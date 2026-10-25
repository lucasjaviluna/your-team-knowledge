package setup

import (
	"encoding/json"
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
	agentsContents, err := os.ReadFile(agents)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(agentsContents), "whenever the user asks about saved YTK Memory") {
		t.Fatalf("project instructions do not activate YTK Memory for memory questions: %s", agentsContents)
	}
	for _, artifact := range []string{
		filepath.Join(ctx.Root, ".agents", "skills", "ytk-memory", "SKILL.md"),
		filepath.Join(ctx.Root, ".ytk-memory", "YTK-MEMORY.md"),
	} {
		generated, err := os.ReadFile(artifact)
		if err != nil {
			t.Fatal(err)
		}
		normalized := strings.Join(strings.Fields(string(generated)), " ")
		for _, required := range []string{
			"An empty result means that the query found no relevant entries; it does not mean the database is empty.",
			"These tools do not provide a full listing or total-count operation.",
			"do not inspect the SQLite file directly as a substitute",
		} {
			if !strings.Contains(normalized, required) {
				t.Errorf("%s does not contain %q", artifact, required)
			}
		}
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

func TestInstallClaudePreservesForeignProjectMCPAndUninstallsIdempotently(t *testing.T) {
	ctx := contextFor(t)
	mcpFile := filepath.Join(ctx.Root, ".mcp.json")
	if err := os.WriteFile(mcpFile, []byte(`{"mcpServers":{"foreign":{"command":"foreign-mcp","args":["serve"]}},"otherSetting":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	claudeFile := filepath.Join(ctx.Root, "CLAUDE.md")
	if err := os.WriteFile(claudeFile, []byte("# Existing Claude guidance\n"), 0644); err != nil {
		t.Fatal(err)
	}
	preview, err := InstallClaude(ctx, true)
	if err != nil {
		t.Fatal(err)
	}
	if preview.Agent != "claude-code" || preview.InstructionScope != "project" || len(preview.Changes) != 4 {
		t.Fatalf("unexpected preview: %#v", preview)
	}
	if _, err := InstallClaude(ctx, false); err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	contents, err := os.ReadFile(mcpFile)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(contents, &parsed); err != nil {
		t.Fatal(err)
	}
	servers := parsed["mcpServers"].(map[string]any)
	if _, ok := servers["foreign"]; !ok {
		t.Fatalf("foreign server was removed: %s", contents)
	}
	managed, ok := servers[claudeServerName].(map[string]any)
	if !ok || managed[claudeManagedKey] != claudeManagedBy || managed["command"] != ctx.Executable {
		t.Fatalf("managed Claude server is invalid: %s", contents)
	}
	claude, err := os.ReadFile(claudeFile)
	if err != nil || !strings.Contains(string(claude), claudeLocalStart) || !strings.Contains(string(claude), "Existing Claude guidance") {
		t.Fatalf("CLAUDE.md was not safely updated: %q err=%v", claude, err)
	}
	if repeat, err := InstallClaude(ctx, true); err != nil || len(repeat.Changes) != 0 {
		t.Fatalf("Claude install is not idempotent: result=%#v err=%v", repeat, err)
	}
	if _, err := UninstallClaude(ctx, false); err != nil {
		t.Fatal(err)
	}
	contents, err = os.ReadFile(mcpFile)
	if err != nil {
		t.Fatal(err)
	}
	parsed = map[string]any{}
	if err := json.Unmarshal(contents, &parsed); err != nil {
		t.Fatal(err)
	}
	servers = parsed["mcpServers"].(map[string]any)
	if _, ok := servers["foreign"]; !ok {
		t.Fatal("Claude uninstall removed foreign MCP configuration")
	}
	if _, ok := servers[claudeServerName]; ok {
		t.Fatal("Claude uninstall retained its managed MCP server")
	}
	claude, err = os.ReadFile(claudeFile)
	if err != nil || string(claude) != "# Existing Claude guidance\n" {
		t.Fatalf("Claude uninstall changed foreign instructions: %q err=%v", claude, err)
	}
}

func TestInstallClaudeRejectsForeignServerNameBeforeWriting(t *testing.T) {
	ctx := contextFor(t)
	filename := filepath.Join(ctx.Root, ".mcp.json")
	if err := os.WriteFile(filename, []byte(`{"mcpServers":{"ytk-memory":{"command":"other"}}}`), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := InstallClaude(ctx, false); err == nil || !strings.Contains(err.Error(), "collision") {
		t.Fatalf("expected collision error, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(ctx.Root, ".ytk-memory.json")); !os.IsNotExist(err) {
		t.Fatal("Claude installer wrote before collision")
	}
}

func TestInstallClaudeSupportsPathsWithSpaces(t *testing.T) {
	root := filepath.Join(t.TempDir(), "project with spaces")
	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatal(err)
	}
	ctx := Context{Root: root, Executable: filepath.Join(root, "bin with spaces", "ytk-memory"), ProjectID: "spaces", Database: filepath.Join(root, ".ytk-memory", "ytk-memory.sqlite")}
	if _, err := InstallClaude(ctx, false); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filepath.Join(root, ".mcp.json"))
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(contents, &document); err != nil {
		t.Fatal(err)
	}
	command := document["mcpServers"].(map[string]any)[claudeServerName].(map[string]any)["command"]
	if command != ctx.Executable {
		t.Fatalf("Claude MCP config lost executable path with spaces: %q", command)
	}
}

func TestInstallPiPreservesForeignProjectMCPAndUninstallsIdempotently(t *testing.T) {
	ctx := contextFor(t)
	mcpFile := filepath.Join(ctx.Root, ".pi", "mcp.json")
	if err := os.MkdirAll(filepath.Dir(mcpFile), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(mcpFile, []byte(`{"mcpServers":{"foreign":{"command":"foreign-mcp"}},"setting":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	agentsFile := filepath.Join(ctx.Root, "AGENTS.md")
	if err := os.WriteFile(agentsFile, []byte("# Existing instructions\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if preview, err := InstallPi(ctx, true); err != nil || preview.Agent != "pi" || len(preview.Changes) != 4 {
		t.Fatalf("unexpected Pi preview: result=%#v err=%v", preview, err)
	}
	if _, err := InstallPi(ctx, false); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(mcpFile)
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(contents, &document); err != nil {
		t.Fatal(err)
	}
	servers := document["mcpServers"].(map[string]any)
	if _, ok := servers["foreign"]; !ok {
		t.Fatalf("Pi setup removed foreign server: %s", contents)
	}
	server, ok := servers[piServerName].(map[string]any)
	if !ok || server["description"] != piServerDescription || server["command"] != ctx.Executable {
		t.Fatalf("managed Pi server is invalid: %s", contents)
	}
	if repeat, err := InstallPi(ctx, true); err != nil || len(repeat.Changes) != 0 {
		t.Fatalf("Pi install is not idempotent: result=%#v err=%v", repeat, err)
	}
	if _, err := UninstallPi(ctx, false); err != nil {
		t.Fatal(err)
	}
	contents, err = os.ReadFile(mcpFile)
	if err != nil {
		t.Fatal(err)
	}
	document = map[string]any{}
	if err := json.Unmarshal(contents, &document); err != nil {
		t.Fatal(err)
	}
	servers = document["mcpServers"].(map[string]any)
	if _, ok := servers["foreign"]; !ok {
		t.Fatal("Pi uninstall removed foreign server")
	}
	if _, ok := servers[piServerName]; ok {
		t.Fatal("Pi uninstall retained managed server")
	}
	agents, err := os.ReadFile(agentsFile)
	if err != nil || string(agents) != "# Existing instructions\n" {
		t.Fatalf("Pi uninstall changed foreign instructions: %q err=%v", agents, err)
	}
}

func TestInstallPiRejectsForeignServerNameBeforeWriting(t *testing.T) {
	ctx := contextFor(t)
	filename := filepath.Join(ctx.Root, ".pi", "mcp.json")
	if err := os.MkdirAll(filepath.Dir(filename), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filename, []byte(`{"mcpServers":{"ytk-memory":{"command":"other"}}}`), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := InstallPi(ctx, false); err == nil || !strings.Contains(err.Error(), "collision") {
		t.Fatalf("expected collision error, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(ctx.Root, ".ytk-memory.json")); !os.IsNotExist(err) {
		t.Fatal("Pi installer wrote before collision")
	}
}

func TestInstallOpenCodePreservesForeignConfigAndUninstallsIdempotently(t *testing.T) {
	ctx := contextFor(t)
	filename := filepath.Join(ctx.Root, "opencode.json")
	if err := os.WriteFile(filename, []byte(`{"model":"provider/model","mcp":{"foreign":{"type":"local","command":["foreign-mcp"]}},"other":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	agentsFile := filepath.Join(ctx.Root, "AGENTS.md")
	if err := os.WriteFile(agentsFile, []byte("# Existing instructions\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if preview, err := InstallOpenCode(ctx, true); err != nil || preview.Agent != "opencode" || len(preview.Changes) != 5 {
		t.Fatalf("unexpected OpenCode preview: result=%#v err=%v", preview, err)
	}
	if _, err := InstallOpenCode(ctx, false); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(contents, &document); err != nil {
		t.Fatal(err)
	}
	servers := document["mcp"].(map[string]any)
	if _, ok := servers["foreign"]; !ok {
		t.Fatalf("OpenCode setup removed foreign server: %s", contents)
	}
	managed, ok := servers[openCodeServerName].(map[string]any)
	if !ok || managed["type"] != "local" || managed["enabled"] != true {
		t.Fatalf("managed OpenCode server is invalid: %s", contents)
	}
	if repeat, err := InstallOpenCode(ctx, true); err != nil || len(repeat.Changes) != 0 {
		t.Fatalf("OpenCode install is not idempotent: result=%#v err=%v", repeat, err)
	}
	if _, err := UninstallOpenCode(ctx, false); err != nil {
		t.Fatal(err)
	}
	contents, err = os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	document = map[string]any{}
	if err := json.Unmarshal(contents, &document); err != nil {
		t.Fatal(err)
	}
	servers = document["mcp"].(map[string]any)
	if _, ok := servers["foreign"]; !ok {
		t.Fatal("OpenCode uninstall removed foreign server")
	}
	if _, ok := servers[openCodeServerName]; ok {
		t.Fatal("OpenCode uninstall retained managed server")
	}
	if _, err := os.Stat(filepath.Join(ctx.Root, ".ytk-memory", "opencode-managed")); !os.IsNotExist(err) {
		t.Fatal("OpenCode uninstall retained its ownership marker")
	}
	agents, err := os.ReadFile(agentsFile)
	if err != nil || string(agents) != "# Existing instructions\n" {
		t.Fatalf("OpenCode uninstall changed foreign instructions: %q err=%v", agents, err)
	}
}

func TestInstallOpenCodeRejectsForeignServerNameBeforeWriting(t *testing.T) {
	ctx := contextFor(t)
	filename := filepath.Join(ctx.Root, "opencode.json")
	if err := os.WriteFile(filename, []byte(`{"mcp":{"ytk-memory":{"type":"local","command":["other"]}}}`), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := InstallOpenCode(ctx, false); err == nil || !strings.Contains(err.Error(), "collision") {
		t.Fatalf("expected collision error, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(ctx.Root, ".ytk-memory.json")); !os.IsNotExist(err) {
		t.Fatal("OpenCode installer wrote before collision")
	}
}

func TestInstallOpenCodeSupportsJSONCProjectConfig(t *testing.T) {
	ctx := contextFor(t)
	filename := filepath.Join(ctx.Root, "opencode.jsonc")
	contents := "{\n  // Keep this project setting\n  \"model\": \"provider/model\",\n  \"mcp\": {\n    \"foreign\": {\"type\": \"local\", \"command\": [\"foreign-mcp\"]},\n  },\n}\n"
	if err := os.WriteFile(filename, []byte(contents), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := InstallOpenCode(ctx, false); err != nil {
		t.Fatal(err)
	}
	updated, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := DecodeOpenCodeConfig(updated, &document); err != nil {
		t.Fatalf("rewritten JSONC config is invalid: %v", err)
	}
	servers := document["mcp"].(map[string]any)
	if _, ok := servers["foreign"]; !ok {
		t.Fatalf("JSONC setup removed foreign server: %s", updated)
	}
	if _, ok := servers[openCodeServerName]; !ok {
		t.Fatalf("JSONC setup did not register Agent Memory: %s", updated)
	}
}
