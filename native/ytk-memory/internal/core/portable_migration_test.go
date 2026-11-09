package core

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestPortableMigrationAndBackupIdentity(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "store.sqlite")
	s, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec(`DROP TABLE portable_imports; DROP TABLE portable_namespaces`); err != nil {
		t.Fatal(err)
	}
	s.Close()
	ro, err := OpenReadOnly(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	check, err := ro.InspectSchema(ctx)
	ro.Close()
	if err != nil || check.Ready || !strings.Contains(strings.Join(check.UpgradeChanges, " "), "portable_imports") {
		t.Fatalf("old schema inspection: %+v %v", check, err)
	}
	s, err = Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err = s.Save(ctx, SaveInput{ID: "x", WorkspaceID: "a", Type: "decision", Title: "Backup", Content: "Keep identity"}); err != nil {
		t.Fatal(err)
	}
	data, err := s.ExportPortable(ctx, "a", "", []string{"x"})
	if err != nil {
		t.Fatal(err)
	}
	before, _ := ParsePortable(data)
	backup := filepath.Join(dir, "backup.sqlite")
	if _, err = s.Backup(ctx, backup); err != nil {
		t.Fatal(err)
	}
	restored, err := Open(backup, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	data, err = restored.ExportPortable(ctx, "a", "", []string{"x"})
	if err != nil {
		t.Fatal(err)
	}
	after, _ := ParsePortable(data)
	if before.Source.Namespace != after.Source.Namespace {
		t.Fatal("backup changed identity")
	}
	preview, err := s.PreviewPortable(ctx, "a", "", data)
	if err != nil || preview.Entries[0].Status != "blocked" {
		t.Fatalf("same-origin import: %+v %v", preview, err)
	}
}
