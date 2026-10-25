package core

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestOpenMigratesLegacySQLiteDatabase(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "legacy.sqlite")
	database, err := sql.Open("sqlite", filename)
	if err != nil {
		t.Fatal(err)
	}
	_, err = database.Exec(`CREATE TABLE memory_items (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, session_id TEXT,
		type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
		subject_key TEXT, tags_json TEXT NOT NULL, status TEXT NOT NULL,
		created_at TEXT NOT NULL, updated_at TEXT NOT NULL
	); INSERT INTO memory_items VALUES (
		'legacy-memory', 'workspace-a', NULL, 'decision', 'Legacy decision',
		'Keep the legacy boundary.', 'architecture/legacy', '["legacy"]', 'active',
		'2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
	);`)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}

	store, err := Open(filename, func() time.Time { return time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC) })
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	item, err := store.findMemory(context.Background(), "legacy-memory")
	if err != nil {
		t.Fatal(err)
	}
	if item.ValidFrom != "1970-01-01T00:00:00.000Z" {
		t.Fatalf("validFrom = %s", item.ValidFrom)
	}
	found, err := store.findActiveBySubjectKey(context.Background(), "workspace-a", "architecture/legacy", "2026-01-15T12:00:00.000Z")
	if err != nil {
		t.Fatal(err)
	}
	if found.ID != "legacy-memory" {
		t.Fatalf("found %s", found.ID)
	}
}

func TestSearchExpandsAuthenticationSynonyms(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "memory.sqlite"), func() time.Time { return time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC) })
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	_, err = store.Save(context.Background(), SaveInput{ID: "id-001", WorkspaceID: "workspace-a", Type: "decision", Title: "Authentication boundary", Content: "Checkout uses the approved boundary."})
	if err != nil {
		t.Fatal(err)
	}
	items, err := store.Search(context.Background(), "workspace-a", "auth checkout", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != "id-001" {
		t.Fatalf("unexpected search result: %#v", items)
	}
}

func TestSaveRollsBackWhenIndexingFails(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "memory.sqlite"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if _, err := store.db.Exec(`DROP TABLE memory_items_fts`); err != nil {
		t.Fatal(err)
	}
	_, err = store.Save(context.Background(), SaveInput{ID: "atomic-save", WorkspaceID: "workspace-a", Type: "decision", Title: "Atomic save", Content: "The item and its index must commit together."})
	if err == nil {
		t.Fatal("Save succeeded despite the injected database failure")
	}
	var count int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM memory_items WHERE id='atomic-save'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("memory item persisted after failed Save: %d", count)
	}
}

func TestCompactRollsBackSummaryWhenRelationFails(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "memory.sqlite"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	for _, id := range []string{"source-one", "source-two"} {
		if _, err := store.Save(context.Background(), SaveInput{ID: id, WorkspaceID: "workspace-a", Type: "decision", Title: id, Content: "Source memory."}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.db.Exec(`CREATE TRIGGER reject_relation BEFORE INSERT ON memory_relations BEGIN SELECT RAISE(ABORT, 'injected failure'); END`); err != nil {
		t.Fatal(err)
	}
	_, err = store.Compact(context.Background(), CompactInput{ID: "compact-summary", WorkspaceID: "workspace-a", Title: "Compacted", MemoryIDs: []string{"source-one", "source-two"}, MaxChars: 1000, ArchiveSources: true})
	if err == nil {
		t.Fatal("Compact succeeded despite the injected database failure")
	}
	var summaryCount, archivedCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM memory_items WHERE id='compact-summary'`).Scan(&summaryCount); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM memory_items WHERE status='archived'`).Scan(&archivedCount); err != nil {
		t.Fatal(err)
	}
	if summaryCount != 0 || archivedCount != 0 {
		t.Fatalf("Compact left partial state: summary=%d archived=%d", summaryCount, archivedCount)
	}
}

func TestPreviewConsolidationDoesNotWriteOrArchiveSources(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "memory.sqlite"), func() time.Time { return time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC) })
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	for _, id := range []string{"source-one", "source-two"} {
		if _, err := store.Save(context.Background(), SaveInput{ID: id, WorkspaceID: "workspace-a", Type: "decision", Title: id, Content: "Conflicting source memory."}); err != nil {
			t.Fatal(err)
		}
	}
	preview, err := store.PreviewConsolidation(context.Background(), CompactInput{WorkspaceID: "workspace-a", Title: "Reviewed decision", MemoryIDs: []string{"source-one", "source-two"}, MaxChars: 1000, ArchiveSources: true})
	if err != nil {
		t.Fatal(err)
	}
	if preview.Title != "Reviewed decision" || len(preview.SourceIDs) != 2 || len(preview.ArchiveSourceIDs) != 2 {
		t.Fatalf("unexpected preview: %#v", preview)
	}
	for _, id := range preview.SourceIDs {
		item, ok, err := store.Get(context.Background(), id, "workspace-a")
		if err != nil || !ok || item.Status != "active" {
			t.Fatalf("preview modified source %s: item=%#v ok=%v err=%v", id, item, ok, err)
		}
	}
	if _, ok, err := store.Get(context.Background(), "summary", "workspace-a"); err != nil || ok {
		t.Fatalf("preview created a summary: ok=%v err=%v", ok, err)
	}
}

func TestEndOwnedSessionRejectsSensitiveSummaryWithoutClosing(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "memory.sqlite"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	owner := "owner-a"
	if _, err := store.StartSession(context.Background(), "session-a", "workspace-a", &owner); err != nil {
		t.Fatal(err)
	}
	summary := "api_key=abcdefghijklmnopqrstuvwxyz123456"
	if _, err := store.EndOwnedSession(context.Background(), "session-a", "workspace-a", owner, &summary); err == nil {
		t.Fatal("EndOwnedSession accepted sensitive summary")
	}
	session, err := store.findSession(context.Background(), "session-a")
	if err != nil {
		t.Fatal(err)
	}
	if session.EndedAt != nil || session.Summary != nil {
		t.Fatalf("session was modified after rejected summary: %#v", session)
	}
}
