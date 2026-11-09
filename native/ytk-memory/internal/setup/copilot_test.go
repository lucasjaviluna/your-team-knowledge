package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCopilotSetupLifecycle(t *testing.T) {
	root := t.TempDir()
	ctx := Context{Root: root, Executable: filepath.Join(root, "ytk-memory"), ProjectID: "demo", Database: filepath.Join(root, "data.sqlite")}
	mcp := filepath.Join(root, ".vscode", "mcp.json")
	if err := os.MkdirAll(filepath.Dir(mcp), 0755); err != nil {
		t.Fatal(err)
	}
	original := `{"servers":{"other":{"type":"stdio","command":"other"}},"inputs":[]}`
	if err := os.WriteFile(mcp, []byte(original), 0644); err != nil {
		t.Fatal(err)
	}
	dry, err := InstallCopilot(ctx, true)
	if err != nil || len(dry.Changes) == 0 {
		t.Fatalf("dry run: %+v %v", dry, err)
	}
	before, _ := os.ReadFile(mcp)
	if string(before) != original {
		t.Fatal("dry-run changed file")
	}
	if _, err = InstallCopilot(ctx, false); err != nil {
		t.Fatal(err)
	}
	again, err := InstallCopilot(ctx, false)
	if err != nil || len(again.Changes) != 0 {
		t.Fatalf("not idempotent: %+v %v", again, err)
	}
	raw, _ := os.ReadFile(mcp)
	var config map[string]any
	if err = json.Unmarshal(raw, &config); err != nil {
		t.Fatal(err)
	}
	servers := config["servers"].(map[string]any)
	server := servers["ytk-memory"].(map[string]any)
	if server["cwd"] != root || server["type"] != "stdio" || servers["other"] == nil {
		t.Fatalf("config: %#v", config)
	}
	instructions, _ := os.ReadFile(filepath.Join(root, ".github", "copilot-instructions.md"))
	if !strings.Contains(string(instructions), copilotStart) {
		t.Fatal("missing instructions")
	}
	if _, err = UninstallCopilot(ctx, false); err != nil {
		t.Fatal(err)
	}
	raw, _ = os.ReadFile(mcp)
	if err = json.Unmarshal(raw, &config); err != nil {
		t.Fatal(err)
	}
	servers = config["servers"].(map[string]any)
	if servers["other"] == nil || servers["ytk-memory"] != nil {
		t.Fatalf("uninstall removed other config: %#v", config)
	}
	if _, err = os.Stat(filepath.Join(root, ".ytk-memory.json")); err != nil {
		t.Fatal("shared configuration removed")
	}
	if _, err = UninstallCopilot(ctx, false); err != nil {
		t.Fatal(err)
	}
}
func TestCopilotPreservesUnownedOrModifiedConfig(t *testing.T) {
	root := t.TempDir()
	ctx := Context{Root: root, Executable: "/bin/ytk-memory", ProjectID: "demo", Database: filepath.Join(root, "db")}
	file := filepath.Join(root, ".vscode", "mcp.json")
	os.MkdirAll(filepath.Dir(file), 0755)
	for _, v := range []string{`{"servers":{"ytk-memory":{"command":"foreign"}}}`, `{ // comment
 "servers": {} }`} {
		os.WriteFile(file, []byte(v), 0644)
		if _, err := InstallCopilot(ctx, false); err == nil {
			t.Fatal("accepted unowned or JSONC config")
		}
		b, _ := os.ReadFile(file)
		if string(b) != v {
			t.Fatal("changed rejected configuration")
		}
	}
	os.WriteFile(file, []byte(`{"servers":{}}`), 0644)
	if _, err := InstallCopilot(ctx, false); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(file)
	modified := strings.Replace(string(b), "/bin/ytk-memory", "/bin/changed", 1)
	os.WriteFile(file, []byte(modified), 0644)
	if _, err := UninstallCopilot(ctx, false); err == nil {
		t.Fatal("removed modified entry")
	}
	after, _ := os.ReadFile(file)
	if string(after) != modified {
		t.Fatal("modified entry was changed")
	}
}

func TestCopilotCoexistsWithClaude(t *testing.T) {
	root := t.TempDir()
	ctx := Context{Root: root, Executable: filepath.Join(root, "ytk-memory"), ProjectID: "demo", Database: filepath.Join(root, "db.sqlite")}
	if _, err := InstallClaude(ctx, false); err != nil {
		t.Fatal(err)
	}
	claudeFile := filepath.Join(root, ".mcp.json")
	before, err := os.ReadFile(claudeFile)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = InstallCopilot(ctx, false); err != nil {
		t.Fatal(err)
	}
	if _, err = UninstallCopilot(ctx, false); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(claudeFile)
	if err != nil || string(after) != string(before) {
		t.Fatalf("Claude config changed: %v", err)
	}
	if _, err = os.Stat(filepath.Join(root, "CLAUDE.md")); err != nil {
		t.Fatal("Claude instructions removed")
	}
}

func TestCopilotUninstallWithoutOwnershipIgnoresJSONC(t *testing.T) {
	root := t.TempDir()
	ctx := Context{Root: root, Executable: "exe", ProjectID: "demo", Database: filepath.Join(root, "db")}
	file := filepath.Join(root, ".vscode", "mcp.json")
	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		t.Fatal(err)
	}
	text := "{ // user config\n \"servers\": {} }"
	if err := os.WriteFile(file, []byte(text), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := UninstallCopilot(ctx, false); err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(file)
	if string(after) != text {
		t.Fatal("unowned file changed")
	}
}
