package core

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPortableRoundTripAndStalePreview(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	st, err := Open(filepath.Join(t.TempDir(), "memory.sqlite"), func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	key := "architecture/wal"
	for _, v := range []SaveInput{{ID: "one", WorkspaceID: "source", Type: "decision", Title: "Database policy", Content: "Use WAL", SubjectKey: &key, Tags: []string{"area:backend"}}, {ID: "two", WorkspaceID: "source", Type: "discovery", Title: "Backup policy", Content: "Use backup", Tags: []string{"area:backend"}}} {
		if _, err = st.Save(ctx, v); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = st.AddRelation(ctx, "one", "two", "supports"); err != nil {
		t.Fatal(err)
	}
	data, err := st.ExportPortable(ctx, "source", "backend", []string{"one", "two"})
	if err != nil {
		t.Fatal(err)
	}
	doc, err := ParsePortable(data)
	if err != nil || len(doc.Relations) != 1 {
		t.Fatalf("export: %v %+v", err, doc)
	}
	if _, err = st.ExportPortable(ctx, "source", "frontend", []string{"one"}); err == nil {
		t.Fatal("export leaked area")
	}
	preview, err := st.PreviewPortable(ctx, "dest", "backend", data)
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Entries) != 2 || preview.Entries[0].Status != "new" {
		t.Fatalf("preview: %+v", preview)
	}
	if _, err = st.Save(ctx, SaveInput{ID: "other", WorkspaceID: "dest", Type: "decision", Title: "Other", Content: "Other decision"}); err != nil {
		t.Fatal(err)
	}
	if _, err = st.ImportPortable(ctx, "dest", "backend", data, preview.Token); err == nil {
		t.Fatal("stale token accepted")
	}
	preview, err = st.PreviewPortable(ctx, "dest", "backend", data)
	if err != nil {
		t.Fatal(err)
	}
	result, err := st.ImportPortable(ctx, "dest", "backend", data, preview.Token)
	if err != nil || result.Inserted != 2 || result.Relations != 1 {
		t.Fatalf("import: %+v %v", result, err)
	}
	preview, err = st.PreviewPortable(ctx, "dest", "backend", data)
	if err != nil {
		t.Fatal(err)
	}
	result, err = st.ImportPortable(ctx, "dest", "backend", data, preview.Token)
	if err != nil || result.Unchanged != 2 || result.Inserted != 0 || result.Relations != 0 {
		t.Fatalf("repeat: %+v %v", result, err)
	}
	found, err := st.Search(ctx, "dest", "backup", 10)
	if err != nil || len(found) != 1 {
		t.Fatalf("FTS: %+v %v", found, err)
	}
	var other PortableDocument
	if err = json.Unmarshal(data, &other); err != nil {
		t.Fatal(err)
	}
	other.Memories[0].Content = "Changed source"
	changed, _ := json.Marshal(other)
	preview, err = st.PreviewPortable(ctx, "dest", "backend", changed)
	if err != nil || preview.Entries[0].Status != "blocked" {
		t.Fatalf("changed source: %+v %v", preview, err)
	}
	if _, err = st.ImportPortable(ctx, "dest", "backend", changed, preview.Token); err == nil {
		t.Fatal("changed origin accepted")
	}
	preview, err = st.PreviewPortable(ctx, "dest", "frontend", data)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range preview.Entries {
		if e.Status != "blocked" {
			t.Fatal("wrong area not blocked")
		}
	}
	if _, err = st.Save(ctx, SaveInput{ID: "collision", WorkspaceID: "third", Type: "decision", Title: "Existing", Content: "Existing", SubjectKey: &key}); err != nil {
		t.Fatal(err)
	}
	preview, err = st.PreviewPortable(ctx, "third", "", data)
	if err != nil || preview.Entries[0].Status != "blocked" {
		t.Fatalf("collision: %+v %v", preview, err)
	}
}
func TestPortableImportRollsBack(t *testing.T) {
	ctx := context.Background()
	st, err := Open(filepath.Join(t.TempDir(), "test.sqlite"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	for _, id := range []string{"a", "b"} {
		if _, err = st.Save(ctx, SaveInput{ID: id, WorkspaceID: "a", Type: "decision", Title: id, Content: "Content"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = st.AddRelation(ctx, "a", "b", "related"); err != nil {
		t.Fatal(err)
	}
	data, err := st.ExportPortable(ctx, "a", "", []string{"a", "b"})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := st.PreviewPortable(ctx, "b", "", data)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = st.db.Exec(`CREATE TRIGGER fail_portable_relation BEFORE INSERT ON memory_relations BEGIN SELECT RAISE(ABORT,'injected'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err = st.ImportPortable(ctx, "b", "", data, preview.Token); err == nil {
		t.Fatal("expected failure")
	}
	var count int
	if err = st.db.QueryRow(`SELECT COUNT(*) FROM memory_items WHERE workspace_id='b'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("partial import %d %v", count, err)
	}
	items, err := st.Search(ctx, "b", "content", 10)
	if err != nil || len(items) != 0 {
		t.Fatalf("partial FTS %v %v", items, err)
	}
	if err = st.db.QueryRow(`SELECT COUNT(*) FROM portable_imports WHERE workspace_id='b'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("partial mapping %d %v", count, err)
	}
}
func TestPortableExactKeys(t *testing.T) {
	data := `{"format":"ytk-memory-export","FORMAT":"ytk-memory-export","version":1,"exportedAt":"2026-11-09T00:00:00Z","source":{"namespace":"8afc8511-f9d2-4604-853c-d46d592292e1"},"memories":[],"relations":[]}`
	if _, err := ParsePortable([]byte(data)); err == nil {
		t.Fatal("case alias accepted")
	}
	if _, err := ParsePortable([]byte(strings.Repeat("[", 20) + strings.Repeat("]", 20))); err == nil {
		t.Fatal("depth accepted")
	}
}

func TestPortableConcurrentImportUsesOnePreview(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "concurrent.sqlite")
	a, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if _, err = a.Save(ctx, SaveInput{ID: "origin", WorkspaceID: "source", Type: "decision", Title: "Concurrent", Content: "One copy"}); err != nil {
		t.Fatal(err)
	}
	data, err := a.ExportPortable(ctx, "source", "", []string{"origin"})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := a.PreviewPortable(ctx, "dest", "", data)
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, st := range []*Store{a, b} {
		go func(st *Store) {
			<-start
			_, e := st.ImportPortable(ctx, "dest", "", data, preview.Token)
			results <- e
		}(st)
	}
	close(start)
	e1, e2 := <-results, <-results
	if (e1 == nil) == (e2 == nil) {
		t.Fatalf("want one success and one stale failure: %v / %v", e1, e2)
	}
	var count int
	if err = a.db.QueryRow(`SELECT count(*) FROM memory_items WHERE workspace_id='dest'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("count=%d err=%v", count, err)
	}
}
