package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func contextFor(t *testing.T, scope Scope) Context {
	t.Helper()
	root := t.TempDir()
	return Context{Root: root, Home: filepath.Join(root, "codex-home"), Executable: filepath.Join(root, "bin", "ytk-memory"), ProjectID: "sample", Database: filepath.Join(root, ".ytk-memory", "ytk-memory.sqlite"), Area: "backend", Scope: scope}
}

func TestInstallPreservesFilesRepeatsAndUninstallsOwnedBlocks(t *testing.T) {
	ctx := contextFor(t, Local)
	config := filepath.Join(ctx.Root, ".codex", "config.toml")
	if err := os.MkdirAll(filepath.Dir(config), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config, []byte("model = \"gpt-6\"\n\n[mcp_servers.other]\nurl = \"https://example.org/mcp\"\n"), 0644); err != nil {
		t.Fatal(err)
	}
	agents := filepath.Join(ctx.Root, "AGENTS.md")
	if err := os.WriteFile(agents, []byte("# Team guidance\n\nKeep existing rules.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	preview, err := Install(ctx, true, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Changes) != 5 {
		t.Fatalf("got %d changes, want 5", len(preview.Changes))
	}
	if _, err := os.Stat(filepath.Join(ctx.Root, ".ytk-memory.json")); !os.IsNotExist(err) {
		t.Fatal("dry run wrote a file")
	}
	if _, err := Install(ctx, false, false); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(config)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "[mcp_servers.ytk_memory]") || !strings.Contains(string(contents), "[mcp_servers.other]") {
		t.Fatalf("config did not preserve or add tables: %s", contents)
	}
	if _, err := Install(ctx, false, false); err != nil {
		t.Fatal(err)
	}
	result, err := Install(ctx, true, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Changes) != 0 {
		t.Fatalf("repeat would change %v", result.Changes)
	}
	if _, err := Uninstall(ctx, false); err != nil {
		t.Fatal(err)
	}
	contents, err = os.ReadFile(config)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "model = \"gpt-6\"\n\n[mcp_servers.other]\nurl = \"https://example.org/mcp\"\n" {
		t.Fatalf("unexpected config after uninstall: %q", contents)
	}
	contents, err = os.ReadFile(agents)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "# Team guidance\n\nKeep existing rules.\n" {
		t.Fatalf("unexpected agents after uninstall: %q", contents)
	}
	if _, err := os.Stat(filepath.Join(ctx.Root, ".agents", "skills", "ytk-memory", "SKILL.md")); !os.IsNotExist(err) {
		t.Fatal("managed skill was retained")
	}
}

func TestInstallRejectsForeignConfigBeforeWriting(t *testing.T) {
	ctx := contextFor(t, Local)
	filename := filepath.Join(ctx.Root, ".codex", "config.toml")
	if err := os.MkdirAll(filepath.Dir(filename), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filename, []byte("[mcp_servers.ytk_memory]\ncommand = \"other\"\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := Install(ctx, false, false); err == nil || !strings.Contains(err.Error(), "collision") {
		t.Fatalf("expected collision error, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(ctx.Root, ".ytk-memory.json")); !os.IsNotExist(err) {
		t.Fatal("installer wrote before collision")
	}
}

func TestGlobalInstructionsAreConditionalAndSelective(t *testing.T) {
	ctx := contextFor(t, Global)
	agents := filepath.Join(ctx.Home, "AGENTS.md")
	if err := os.MkdirAll(ctx.Home, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(agents, []byte("# Personal guidance\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := Install(ctx, false, false); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(agents)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(content), "Project: `sample`") || !strings.Contains(string(content), "tools are available") {
		t.Fatalf("unexpected global instructions: %s", content)
	}
	if _, err := Uninstall(ctx, false); err != nil {
		t.Fatal(err)
	}
	content, err = os.ReadFile(agents)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "# Personal guidance\n" {
		t.Fatalf("unexpected global uninstall result: %q", content)
	}
}
