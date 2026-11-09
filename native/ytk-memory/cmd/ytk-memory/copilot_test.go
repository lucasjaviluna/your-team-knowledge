package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestInspectCopilotSetup(t *testing.T) {
	root := t.TempDir()
	exe := filepath.Join(root, "binary")
	if err := os.WriteFile(exe, []byte("test"), 0600); err != nil {
		t.Fatal(err)
	}
	entry := map[string]any{"type": "stdio", "command": exe, "args": []string{"mcp"}, "cwd": root}
	marker, _ := json.Marshal(entry)
	config, _ := json.Marshal(map[string]any{"servers": map[string]any{"ytk-memory": entry}})
	os.MkdirAll(filepath.Join(root, ".vscode"), 0755)
	os.MkdirAll(filepath.Join(root, ".ytk-memory"), 0755)
	os.WriteFile(filepath.Join(root, ".vscode", "mcp.json"), config, 0600)
	os.WriteFile(filepath.Join(root, ".ytk-memory", "copilot-vscode-managed.json"), marker, 0600)
	if c := inspectCopilotSetup(root); c["status"] != "ok" {
		t.Fatalf("check: %v", c)
	}
	os.Remove(exe)
	if c := inspectCopilotSetup(root); c["status"] != "invalid" {
		t.Fatalf("missing executable: %v", c)
	}
}
