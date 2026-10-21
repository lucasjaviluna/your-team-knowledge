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
