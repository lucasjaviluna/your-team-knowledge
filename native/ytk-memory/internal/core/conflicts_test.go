package core

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestConflictCandidatesScopeAndReadOnly(t *testing.T) {
	ctx := context.Background()
	store, err := Open(filepath.Join(t.TempDir(), "test.sqlite"), func() time.Time { return time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC) })
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	inputs := []SaveInput{
		{ID: "base", WorkspaceID: "a", Type: "decision", Title: "Database deployment", Content: "Enable database backup", Tags: []string{"area:backend"}},
		{ID: "candidate", WorkspaceID: "a", Type: "decision", Title: "Database deployment", Content: "Disable database backup", Tags: []string{"area:backend"}},
		{ID: "compatible", WorkspaceID: "a", Type: "decision", Title: "Database deployment", Content: "Enable database backup", Tags: []string{}},
		{ID: "hidden", WorkspaceID: "a", Type: "decision", Title: "Database deployment", Content: "Other area", Tags: []string{"area:frontend"}},
		{ID: "foreign", WorkspaceID: "b", Type: "decision", Title: "Database deployment", Content: "Other project"},
		{ID: "old", WorkspaceID: "a", Type: "decision", Title: "Database deployment", Content: "Archived decision"},
	}
	for _, in := range inputs {
		if _, err = store.Save(ctx, in); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = store.Transition(ctx, "old", "archived", "obsolete"); err != nil {
		t.Fatal(err)
	}
	result, err := store.ConflictCandidates(ctx, "a", "backend", "base", 10, 4000)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Candidates) != 2 || result.Candidates[0].ID != "compatible" || result.Candidates[1].ID != "candidate" {
		t.Fatalf("unexpected candidates: %+v", result)
	}
	if result.Candidates[0].Reasons[0].Code != "shared_terms" || !strings.Contains(result.Candidates[0].Reasons[0].Evidence, "database") {
		t.Fatalf("missing evidence: %+v", result)
	}
	before, _, _ := store.Get(ctx, "candidate", "a")
	_, err = store.ConflictCandidates(ctx, "a", "backend", "base", 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	after, _, _ := store.Get(ctx, "candidate", "a")
	if before.UpdatedAt != after.UpdatedAt || after.Status != "active" {
		t.Fatal("read changed candidate")
	}
	small, err := store.ConflictCandidates(ctx, "a", "backend", "base", 1, 100)
	if err != nil || !small.Truncated {
		t.Fatalf("expected truncated output: %+v %v", small, err)
	}
	for _, id := range []string{"foreign", "hidden", "missing", "old"} {
		if _, err = store.ConflictCandidates(ctx, "a", "backend", id, 10, 4000); err == nil || err.Error() != "memory not found" {
			t.Fatalf("scope %s: %v", id, err)
		}
	}
	if _, err = store.ConflictCandidates(ctx, "a", "backend", "base", 51, 4000); err == nil {
		t.Fatal("invalid limit accepted")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err = store.ConflictCandidates(cancelled, "a", "backend", "base", 10, 4000); err == nil {
		t.Fatal("cancelled context accepted")
	}
}
