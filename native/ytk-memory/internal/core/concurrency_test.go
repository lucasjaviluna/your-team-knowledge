package core

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestSQLiteConcurrencyWorker(t *testing.T) {
	mode := os.Getenv("YTK_SQLITE_WORKER_MODE")
	if mode == "" {
		return
	}
	filename := os.Getenv("YTK_SQLITE_WORKER_DB")
	store, err := Open(filename, nil)
	if err != nil {
		t.Fatal(err)
	}

	if mode == "crash" {
		tx, err := store.db.BeginTx(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		item := Memory{ID: "uncommitted", Title: "Interrupted write", Content: "Must roll back after process exit", Tags: []string{}}
		if _, err := tx.Exec(`INSERT INTO memory_items (id,workspace_id,type,title,content,tags_json,status,created_at,updated_at,valid_from) VALUES ('uncommitted','workspace-a','decision',?,?, '[]','active','2026-01-01','2026-01-01','2026-01-01')`, item.Title, item.Content); err != nil {
			t.Fatal(err)
		}
		if err := index(context.Background(), tx, item); err != nil {
			t.Fatal(err)
		}
		os.Exit(0) // Deliberately leave an open transaction for SQLite recovery.
	}
	if mode != "write" {
		t.Fatalf("unknown worker mode %q", mode)
	}
	defer store.Close()
	worker, err := strconv.Atoi(os.Getenv("YTK_SQLITE_WORKER_ID"))
	if err != nil {
		t.Fatal(err)
	}
	iterations, err := strconv.Atoi(os.Getenv("YTK_SQLITE_WORKER_ITERATIONS"))
	if err != nil {
		t.Fatal(err)
	}
	for i := range iterations {
		_, err := store.Save(context.Background(), SaveInput{
			ID:          fmt.Sprintf("worker-%d-item-%d", worker, i),
			WorkspaceID: "workspace-a",
			Type:        "decision",
			Title:       "Multiprocess concurrency marker",
			Content:     "SQLite writer coordination and FTS consistency",
			SubjectKey:  stringPointer(fmt.Sprintf("worker/%d/item/%d", worker, i)),
		})
		if err != nil {
			t.Fatalf("save unique worker memory %d/%d: %v", worker, i, err)
		}
		_, err = store.Save(context.Background(), SaveInput{
			ID:          fmt.Sprintf("shared-worker-%d", worker),
			WorkspaceID: "workspace-a",
			Type:        "decision",
			Title:       "Shared concurrency marker",
			Content:     fmt.Sprintf("Last update from worker %d iteration %d", worker, i),
			SubjectKey:  stringPointer("shared/concurrency-marker"),
		})
		if err != nil {
			t.Fatalf("save shared worker memory %d/%d: %v", worker, i, err)
		}
	}
}

func TestConcurrentProcessesSerializeIdempotentSaves(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "concurrent.sqlite")

	const workers, iterations = 8, 20
	type workerProcess struct {
		command *exec.Cmd
		output  *bytes.Buffer
	}
	commands := make([]workerProcess, 0, workers)
	startedAt := time.Now()
	for worker := range workers {
		command := exec.Command(os.Args[0], "-test.run=^TestSQLiteConcurrencyWorker$")
		output := &bytes.Buffer{}
		command.Stdout, command.Stderr = output, output
		command.Env = append(os.Environ(),
			"YTK_SQLITE_WORKER_MODE=write",
			"YTK_SQLITE_WORKER_DB="+filename,
			"YTK_SQLITE_WORKER_ID="+strconv.Itoa(worker),
			"YTK_SQLITE_WORKER_ITERATIONS="+strconv.Itoa(iterations),
		)
		if err := command.Start(); err != nil {
			t.Fatal(err)
		}
		commands = append(commands, workerProcess{command: command, output: output})
	}
	observer, err := Open(filename, nil)
	if err != nil {
		t.Fatalf("open concurrent read observer: %v", err)
	}
	readerCtx, stopReader := context.WithCancel(context.Background())
	readerErrors := make(chan error, 1)
	go func() {
		for {
			select {
			case <-readerCtx.Done():
				readerErrors <- nil
				return
			default:
			}
			if _, err := observer.Search(readerCtx, "workspace-a", "concurrency marker", 10); err != nil {
				if readerCtx.Err() != nil {
					readerErrors <- nil
					return
				}
				readerErrors <- err
				return
			}
			select {
			case <-readerCtx.Done():
				readerErrors <- nil
				return
			default:
			}
		}
	}()
	var workerFailure error
	for worker, process := range commands {
		if err := process.command.Wait(); err != nil && workerFailure == nil {
			workerFailure = fmt.Errorf("worker %d failed: %w\n%s", worker, err, process.output)
		}
	}
	stopReader()
	if err := <-readerErrors; err != nil {
		_ = observer.Close()
		t.Fatalf("concurrent reader failed: %v", err)
	}
	if err := observer.Close(); err != nil {
		t.Fatal(err)
	}
	if workerFailure != nil {
		t.Fatal(workerFailure)
	}
	t.Logf("multiprocess writes=%d, processes=%d, elapsed=%s, SQLITE_BUSY/LOCKED errors=%d", workers*iterations*2, workers, time.Since(startedAt).Round(time.Millisecond), 0)
	store, err := Open(filename, nil)
	if err != nil {
		t.Fatalf("open store after concurrent initialization and writes: %v", err)
	}
	defer store.Close()

	var memories, activeShared int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM memory_items`).Scan(&memories); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM memory_items WHERE workspace_id='workspace-a' AND subject_key='shared/concurrency-marker' AND status='active'`).Scan(&activeShared); err != nil {
		t.Fatal(err)
	}
	wantMemories := workers*iterations + 1
	if memories != wantMemories || activeShared != 1 {
		t.Fatalf("concurrent upserts left memories=%d (want %d), active shared keys=%d (want 1)", memories, wantMemories, activeShared)
	}
	items, err := store.Search(context.Background(), "workspace-a", "concurrency marker", wantMemories+1)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != wantMemories {
		t.Fatalf("FTS returned %d records after %d committed saves", len(items), wantMemories)
	}
	if err := store.IntegrityCheck(context.Background()); err != nil {
		t.Fatalf("integrity check after concurrent writes: %v", err)
	}
}

func TestSQLiteRecoversInterruptedTransaction(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "interrupted.sqlite")
	store, err := Open(filename, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	command := exec.Command(os.Args[0], "-test.run=^TestSQLiteConcurrencyWorker$")
	command.Env = append(os.Environ(), "YTK_SQLITE_WORKER_MODE=crash", "YTK_SQLITE_WORKER_DB="+filename)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("interrupted transaction worker failed: %v\n%s", err, output)
	}

	reopened, err := Open(filename, nil)
	if err != nil {
		t.Fatalf("reopen after interrupted write: %v", err)
	}
	defer reopened.Close()
	var count int
	if err := reopened.db.QueryRow(`SELECT COUNT(*) FROM memory_items WHERE id='uncommitted'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("uncommitted transaction survived process exit: %d rows", count)
	}
	if err := reopened.IntegrityCheck(context.Background()); err != nil {
		t.Fatalf("integrity check after interrupted write: %v", err)
	}
}

func TestBackupDuringUncommittedWALWriteKeepsConsistentSnapshot(t *testing.T) {
	root := t.TempDir()
	filename := filepath.Join(root, "live.sqlite")
	store, err := Open(filename, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	if _, err := store.Save(context.Background(), SaveInput{
		ID: "committed-before-backup", WorkspaceID: "workspace-a", Type: "decision",
		Title: "Parallel backup marker", Content: "Committed row and FTS entry",
	}); err != nil {
		t.Fatal(err)
	}
	started := make(chan error, 1)
	release := make(chan struct{})
	finished := make(chan error, 1)
	go func() {
		tx, err := store.db.BeginTx(context.Background(), nil)
		if err != nil {
			started <- err
			return
		}
		defer tx.Rollback()
		item := Memory{ID: "uncommitted-during-backup", Title: "Uncommitted backup marker", Content: "Must not enter the backup snapshot", Tags: []string{}}
		if _, err := tx.Exec(`INSERT INTO memory_items (id,workspace_id,type,title,content,tags_json,status,created_at,updated_at,valid_from) VALUES (?,'workspace-a','decision',?,?,'[]','active','2026-01-01','2026-01-01','2026-01-01')`, item.ID, item.Title, item.Content); err != nil {
			started <- err
			return
		}
		if err := index(context.Background(), tx, item); err != nil {
			started <- err
			return
		}
		started <- nil
		<-release
		finished <- tx.Commit()
	}()
	if err := <-started; err != nil {
		t.Fatalf("start uncommitted writer: %v", err)
	}
	backupPath := filepath.Join(root, "snapshot.sqlite")
	if _, err := store.Backup(context.Background(), backupPath); err != nil {
		close(release)
		t.Fatalf("backup during writes: %v", err)
	}
	close(release)
	if err := <-finished; err != nil {
		t.Fatalf("commit concurrent writer: %v", err)
	}
	backup, err := Open(backupPath, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer backup.Close()
	var rows, indexed int
	if err := backup.db.QueryRow(`SELECT COUNT(*) FROM memory_items`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if err := backup.db.QueryRow(`SELECT COUNT(*) FROM memory_items_fts`).Scan(&indexed); err != nil {
		t.Fatal(err)
	}
	if rows != 1 || indexed != 1 {
		t.Fatalf("backup snapshot has %d memory rows but %d FTS entries", rows, indexed)
	}
	items, err := backup.Search(context.Background(), "workspace-a", "parallel backup marker", 10)
	if err != nil || len(items) != 1 || items[0].ID != "committed-before-backup" {
		t.Fatalf("unexpected backup snapshot search result: items=%#v err=%v", items, err)
	}
}
