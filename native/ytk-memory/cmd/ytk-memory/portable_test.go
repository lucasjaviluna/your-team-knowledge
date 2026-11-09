package main

import (
	"context"
	"encoding/json"
	"github.com/corporate-knowledge/ytk-memory/internal/core"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestPortableCLIRoundTrip(t *testing.T) {
	root := t.TempDir()
	db := filepath.Join(root, "db.sqlite")
	st, err := core.Open(db, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = st.Save(context.Background(), core.SaveInput{ID: "seed", WorkspaceID: "source", Type: "decision", Title: "Test policy", Content: "Preserve data"}); err != nil {
		t.Fatal(err)
	}
	st.Close()
	file := filepath.Join(root, "export.json")
	call := func(args ...string) ([]byte, error) {
		old := os.Stdout
		r, w, e := os.Pipe()
		if e != nil {
			t.Fatal(e)
		}
		os.Stdout = w
		defer func() { os.Stdout = old }()
		e = run(args)
		w.Close()
		b, _ := io.ReadAll(r)
		r.Close()
		return b, e
	}
	if _, err = call("portable-export", "--project", "source", "--database", db, "--ids", "seed", "--to", file); err != nil {
		t.Fatal(err)
	}
	original, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = call("portable-export", "--project", "source", "--database", db, "--ids", "seed", "--to", file); err == nil {
		t.Fatal("overwrote existing file")
	}
	after, _ := os.ReadFile(file)
	if string(after) != string(original) {
		t.Fatal("existing file changed")
	}
	out, err := call("portable-preview", "--project", "dest", "--database", db, "--from", file)
	if err != nil {
		t.Fatal(err)
	}
	var preview core.PortablePreview
	if err = json.Unmarshal(out, &preview); err != nil || preview.Token == "" {
		t.Fatalf("preview %s %v", out, err)
	}
	if _, err = call("portable-import", "--project", "dest", "--database", db, "--from", file, "--token", preview.Token); err == nil {
		t.Fatal("confirmation not required")
	}
	out, err = call("portable-import", "--project", "dest", "--database", db, "--from", file, "--token", preview.Token, "--confirm")
	if err != nil {
		t.Fatal(err)
	}
	var result core.PortableImportResult
	if err = json.Unmarshal(out, &result); err != nil || result.Inserted != 1 {
		t.Fatalf("import %s %v", out, err)
	}
}
