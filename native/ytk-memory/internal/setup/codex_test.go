package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func contextFor(t *testing.T) Context {
	t.Helper()
	root := t.TempDir()
	return Context{Root: root, Home: filepath.Join(root, "codex-home"), Executable: filepath.Join(root, "bin", "ytk-memory"), ProjectID: "sample", Database: filepath.Join(root, ".ytk-memory", "ytk-memory.sqlite"), Area: "backend"}
}

func TestInstallUsesGlobalMCPAndLocalInstructions(t *testing.T) {
	ctx := contextFor(t)
	globalConfig := filepath.Join(ctx.Home, "config.toml")
	if err := os.MkdirAll(ctx.Home, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(globalConfig, []byte("model = \"gpt-6\"\n\n[mcp_servers.other]\nurl = \"https://example.org/mcp\"\n"), 0644); err != nil {
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
	contents, err := os.ReadFile(globalConfig)
	if err != nil {
		t.Fatal(err)
	}
	text := string(contents)
	if !strings.Contains(text, "[mcp_servers.ytk_memory]") || !strings.Contains(text, "args = [\"mcp\"]") || strings.Contains(text, ctx.ProjectID) {
		t.Fatalf("unexpected global MCP registration: %s", text)
	}
	if _, err := os.Stat(filepath.Join(ctx.Root, ".codex", "config.toml")); !os.IsNotExist(err) {
		t.Fatal("project config should not be created")
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
	if _, err := Uninstall(ctx, false, false); err != nil {
		t.Fatal(err)
	}
	contents, err = os.ReadFile(globalConfig)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "[mcp_servers.ytk_memory]") {
		t.Fatal("local uninstall removed the global MCP registration")
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

func TestUninstallCanRemoveOwnedGlobalMCP(t *testing.T) {
	ctx := contextFor(t)
	if _, err := Install(ctx, false, false); err != nil {
		t.Fatal(err)
	}
	if _, err := Uninstall(ctx, false, true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(ctx.Home, "config.toml")); !os.IsNotExist(err) {
		t.Fatal("global config should be removed when it only contained the managed MCP block")
	}
}

func TestInstallRejectsForeignGlobalMCPBeforeWriting(t *testing.T) {
	ctx := contextFor(t)
	filename := filepath.Join(ctx.Home, "config.toml")
	if err := os.MkdirAll(ctx.Home, 0755); err != nil {
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

func TestInstallMigratesOwnedProjectMCPRegistration(t *testing.T) {
	ctx := contextFor(t)
	legacyConfig := filepath.Join(ctx.Root, ".codex", "config.toml")
	if err := os.MkdirAll(filepath.Dir(legacyConfig), 0755); err != nil {
		t.Fatal(err)
	}
	legacy := "model = \"gpt-6\"\n\n" + configStart + "\n[mcp_servers.ytk_memory]\ncommand = \"old-binary\"\nargs = [\"mcp\", \"--project\", \"sample\"]\n" + configEnd + "\n"
	if err := os.WriteFile(legacyConfig, []byte(legacy), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := Install(ctx, false, false); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(legacyConfig)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "model = \"gpt-6\"\n" {
		t.Fatalf("unexpected project config after migration: %q", contents)
	}
	global, err := os.ReadFile(filepath.Join(ctx.Home, "config.toml"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(global), "args = [\"mcp\"]") {
		t.Fatalf("global MCP registration was not created: %s", global)
	}
}
