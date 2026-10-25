package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRunEvaluationReportsPerfectSyntheticRetrieval(t *testing.T) {
	directory := t.TempDir()
	fixture := EvaluationFixture{
		Version:     1,
		Clock:       "2026-10-25T12:00:00Z",
		WorkspaceID: "evaluation",
		Memories: []EvaluationMemory{
			{ID: "decision", Type: "decision", Title: "Gateway authentication", Content: "The gateway validates identity.", SubjectKey: "architecture/auth", Tags: []string{"priority:high"}},
			{ID: "other", Type: "discovery", Title: "SQLite backup", Content: "Backups preserve the database.", SubjectKey: "operations/backup"},
		},
		Searches:  []EvaluationCase{{ID: "auth", Query: "gateway identity", RelevantSubjectKeys: []string{"architecture/auth"}}},
		Briefings: []EvaluationCase{{ID: "briefing", RelevantSubjectKeys: []string{"architecture/auth"}, Limit: 1}},
	}
	data, err := json.Marshal(fixture)
	if err != nil {
		t.Fatal(err)
	}
	fixtureFile := filepath.Join(directory, "fixture.json")
	if err := os.WriteFile(fixtureFile, data, 0600); err != nil {
		t.Fatal(err)
	}
	report, err := RunEvaluation(fixtureFile, filepath.Join(directory, "memory.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if report.SearchRecallAtK != 1 || report.SearchPrecisionAtK != 1 || report.BriefingPrecision != 1 {
		t.Fatalf("unexpected report: %#v", report)
	}
	if len(report.Search) != 1 || len(report.Briefing) != 1 || report.Briefing[0].ContextChars == 0 {
		t.Fatalf("unexpected evaluation cases: %#v", report)
	}
}

func TestRunEvaluationRejectsUnknownFixtureVersion(t *testing.T) {
	directory := t.TempDir()
	fixtureFile := filepath.Join(directory, "fixture.json")
	if err := os.WriteFile(fixtureFile, []byte(`{"version":2}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := RunEvaluation(fixtureFile, filepath.Join(directory, "memory.sqlite")); err == nil {
		t.Fatal("RunEvaluation accepted an unknown fixture version")
	}
}
