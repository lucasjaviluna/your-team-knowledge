package main

import (
	"bytes"
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/corporate-knowledge/ytk-memory/internal/core"
	_ "modernc.org/sqlite"
)

func TestWriteDoctorExplainsMissingConfiguration(t *testing.T) {
	var output bytes.Buffer
	result := map[string]any{
		"healthy":   false,
		"state":     "missing_configuration",
		"projectId": "autogestion-dsw",
		"database":  "C:/workspace/.ytk-memory/ytk-memory.sqlite",
		"checks": []map[string]string{{
			"name":    "database",
			"status":  "missing",
			"message": "No se encontró la base de datos. Ejecutá `ytk-memory setup codex` para crearla o restaurá un backup.",
		}},
	}

	if err := writeDoctor(&output, result, false); err != nil {
		t.Fatal(err)
	}
	text := output.String()
	for _, expected := range []string{
		"Agent Memory · Falta configuración",
		"Verificaciones:",
		"✗ database:",
		"ytk-memory setup codex",
	} {
		if !strings.Contains(text, expected) {
			t.Errorf("doctor output does not contain %q:\n%s", expected, text)
		}
	}
}

func TestDoctorReportsUnreadableSQLiteAsStructuredFailure(t *testing.T) {
	root := t.TempDir()
	filename := filepath.Join(root, "not-a-database.sqlite")
	if err := os.WriteFile(filename, []byte("not sqlite"), 0644); err != nil {
		t.Fatal(err)
	}
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	var output bytes.Buffer
	previousOutput := os.Stdout
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = write
	err = doctor(config{project: "sample", database: filename, root: root}, true, "codex")
	_ = write.Close()
	os.Stdout = previousOutput
	if err != nil {
		t.Fatal(err)
	}
	if _, err := output.ReadFrom(read); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), `"healthy":false`) || !strings.Contains(output.String(), `"status":"invalid"`) {
		t.Fatalf("doctor did not report structured SQLite failure: %s", output.String())
	}
}

func TestDoctorResolveFailureReportsInvalidProjectConfiguration(t *testing.T) {
	var output bytes.Buffer
	if err := writeDoctor(&output, map[string]any{
		"healthy":   false,
		"state":     "invalid_configuration",
		"projectId": "sample",
		"database":  "unresolved",
		"checks": []map[string]string{{
			"name":    "project_config",
			"status":  "invalid",
			"message": "Invalid JSON in .ytk-memory.json.",
		}},
	}, false); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "project_config") || !strings.Contains(output.String(), "Invalid JSON") {
		t.Fatalf("project configuration failure was not actionable: %s", output.String())
	}
}

func TestResolveRequiresLocalProjectConfiguration(t *testing.T) {
	root := t.TempDir()
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	if _, err := resolve("", "", "", true); err == nil || !strings.Contains(err.Error(), "not configured") {
		t.Fatalf("expected missing local configuration error, got %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".ytk-memory.json"), []byte(`{"project_slug":"sample","database":".ytk-memory/ytk-memory.sqlite"}`), 0644); err != nil {
		t.Fatal(err)
	}
	resolved, err := resolve("", "", "", true)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.project != "sample" {
		t.Fatalf("got project %q, want sample", resolved.project)
	}
}

func TestInspectClaudeSetupChecksManagedProjectServer(t *testing.T) {
	root := t.TempDir()
	executable := filepath.Join(root, "ytk-memory")
	if err := os.WriteFile(executable, []byte("binary"), 0755); err != nil {
		t.Fatal(err)
	}
	mcp := `{"mcpServers":{"ytk-memory":{"_managedBy":"ytk-memory-init","command":` + strconv.Quote(executable) + `,"args":["mcp"]}}}`
	filename := filepath.Join(root, ".mcp.json")
	if err := os.WriteFile(filename, []byte(mcp), 0644); err != nil {
		t.Fatal(err)
	}
	if check := inspectClaudeSetup(filename); check["status"] != "ok" {
		t.Fatalf("unexpected Claude setup check: %#v", check)
	}
	if err := os.Remove(executable); err != nil {
		t.Fatal(err)
	}
	if check := inspectClaudeSetup(filename); check["status"] != "invalid" {
		t.Fatalf("missing executable was accepted: %#v", check)
	}
}

func TestInspectOpenCodeSetupChecksManagedProjectServer(t *testing.T) {
	root := t.TempDir()
	executable := filepath.Join(root, "ytk-memory")
	if err := os.WriteFile(executable, []byte("binary"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".ytk-memory"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".ytk-memory", "opencode-managed"), []byte("Managed by ytk-memory-init: OpenCode project MCP.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	mcp := `{"mcp":{"ytk-memory":{"type":"local","command":[` + strconv.Quote(executable) + `,"mcp"],"enabled":true}}}`
	filename := filepath.Join(root, "opencode.json")
	if err := os.WriteFile(filename, []byte(mcp), 0644); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(root, ".ytk-memory", "opencode-managed")
	if check := inspectOpenCodeSetup(filename, marker); check["status"] != "ok" {
		t.Fatalf("unexpected OpenCode setup check: %#v", check)
	}
	if err := os.Remove(executable); err != nil {
		t.Fatal(err)
	}
	if check := inspectOpenCodeSetup(filename, marker); check["status"] != "invalid" {
		t.Fatalf("missing executable was accepted: %#v", check)
	}
}

func TestInspectCodexSetupRejectsMalformedTOML(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(filename, []byte("[mcp_servers.ytk_memory\ncommand = \"ytk-memory\"\n"), 0644); err != nil {
		t.Fatal(err)
	}
	check := inspectCodexSetup(filename)
	if check["status"] != "invalid" || !strings.Contains(check["message"], "TOML") {
		t.Fatalf("malformed TOML was not diagnosed: %#v", check)
	}
}

func TestInspectCodexSetupDetectsDifferentRegisteredBinary(t *testing.T) {
	running, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	other := filepath.Join(t.TempDir(), "other-ytk-memory")
	if err := os.WriteFile(other, []byte("different executable"), 0755); err != nil {
		t.Fatal(err)
	}
	filename := filepath.Join(t.TempDir(), "config.toml")
	text := "# BEGIN ytk-memory-init:codex\n[mcp_servers.ytk_memory]\ncommand = " + strconv.Quote(other) + "\nargs = [\"mcp\"]\n# END ytk-memory-init:codex\n"
	if err := os.WriteFile(filename, []byte(text), 0644); err != nil {
		t.Fatal(err)
	}
	if check := inspectCodexSetup(filename); check["status"] != "incompatible" {
		t.Fatalf("different registered executable was not reported (running %s): %#v", running, check)
	}
}

func TestRollbackRestoresLegacyDatabase(t *testing.T) {
	root := t.TempDir()
	legacy := filepath.Join(root, "legacy.sqlite")
	database, err := sql.Open("sqlite", legacy)
	if err != nil {
		t.Fatal(err)
	}
	_, err = database.Exec(`CREATE TABLE memory_items (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, session_id TEXT,
		type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
		subject_key TEXT, tags_json TEXT NOT NULL, status TEXT NOT NULL,
		created_at TEXT NOT NULL, updated_at TEXT NOT NULL
	); INSERT INTO memory_items VALUES (
		'legacy-rollback', 'sample', NULL, 'decision', 'Inherited record',
		'Keep data during rollback.', 'migration/legacy', '["legacy"]', 'active',
		'2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
	);`)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
	current := filepath.Join(root, "current.sqlite")
	store, err := core.Open(current, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Save(context.Background(), core.SaveInput{ID: "current", WorkspaceID: "sample", Type: "decision", Title: "Current record", Content: "Safety backup must remain."}); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	if err := doRollback(config{project: "sample", database: current}, legacy, filepath.Join(root, "safety.sqlite"), true, true); err != nil {
		t.Fatal(err)
	}
	restored, err := core.Open(current, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	item, found, err := restored.Get(context.Background(), "legacy-rollback", "sample")
	if err != nil || !found || item.Title != "Inherited record" {
		t.Fatalf("legacy record missing after rollback: item=%#v found=%v err=%v", item, found, err)
	}
	if _, err := os.Stat(filepath.Join(root, "safety.sqlite")); err != nil {
		t.Fatalf("pre-rollback database backup missing: %v", err)
	}
}
