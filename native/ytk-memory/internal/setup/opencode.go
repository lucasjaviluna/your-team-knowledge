package setup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	openCodeLocalStart = "<!-- BEGIN ytk-memory-init:opencode -->"
	openCodeLocalEnd   = "<!-- END ytk-memory-init:opencode -->"
	openCodeServerName = "ytk-memory"
	openCodeMarker     = "Managed by ytk-memory-init: OpenCode project MCP.\n"
)

// InstallOpenCode registers the local MCP server in the project OpenCode config.
func InstallOpenCode(ctx Context, dryRun bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := openCodeInstallChanges(ctx)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, false, "opencode", "project")
}

// UninstallOpenCode removes the project MCP entry and instructions owned by setup.
func UninstallOpenCode(ctx Context, dryRun bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := openCodeUninstallChanges(ctx)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, true, "opencode", "project")
}

func openCodeInstallChanges(ctx Context) ([]change, error) {
	configFile := filepath.Join(ctx.Root, ".ytk-memory.json")
	config, err := jsonObject(configFile)
	if err != nil {
		return nil, err
	}
	config["project_slug"], config["database"] = ctx.ProjectID, ctx.Database
	if ctx.Area != "" {
		config["default_area"] = ctx.Area
	}
	encoded, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return nil, err
	}
	configContent := string(encoded) + "\n"

	openCodeFile := OpenCodeConfigPath(ctx.Root)
	openCodeContent, err := installOpenCodeMCP(read(openCodeFile), openCodeFile, ctx.Executable)
	if err != nil {
		return nil, err
	}
	instructionsFile := filepath.Join(ctx.Root, ".ytk-memory", "YTK-MEMORY.md")
	instructions := renderPortable(ctx.ProjectID)
	if err := managedFile(read(instructionsFile), portableMarker, instructionsFile); err != nil {
		return nil, err
	}
	markerFile := filepath.Join(ctx.Root, ".ytk-memory", "opencode-managed")
	if current := read(markerFile); current != nil && *current != openCodeMarker {
		return nil, fmt.Errorf("%s exists with unknown content; resolve ownership manually.", markerFile)
	}
	agentsFile := filepath.Join(ctx.Root, "AGENTS.md")
	agentsContent, err := replaceBlock(read(agentsFile), openCodeInstructions(ctx.ProjectID), openCodeLocalStart, openCodeLocalEnd, agentsFile)
	if err != nil {
		return nil, err
	}
	return []change{{configFile, &configContent}, {openCodeFile, &openCodeContent}, {instructionsFile, &instructions}, {markerFile, stringPointer(openCodeMarker)}, {agentsFile, agentsContent}}, nil
}

func openCodeUninstallChanges(ctx Context) ([]change, error) {
	markerFile := filepath.Join(ctx.Root, ".ytk-memory", "opencode-managed")
	marker := read(markerFile)
	openCodeFile := OpenCodeConfigPath(ctx.Root)
	openCodeContent, changed, err := uninstallOpenCodeMCP(read(openCodeFile), openCodeFile, marker != nil && *marker == openCodeMarker)
	if err != nil {
		return nil, err
	}
	changes := []change{}
	if changed {
		changes = append(changes, change{openCodeFile, openCodeContent})
	}
	if marker != nil && *marker == openCodeMarker {
		changes = append(changes, change{markerFile, nil})
	}
	agentsFile := filepath.Join(ctx.Root, "AGENTS.md")
	agentsContent, err := removeBlock(read(agentsFile), openCodeLocalStart, openCodeLocalEnd, agentsFile)
	if err != nil {
		return nil, err
	}
	changes = append(changes, change{agentsFile, agentsContent})
	return changes, nil
}

func installOpenCodeMCP(current *string, file, executable string) (string, error) {
	root := map[string]any{}
	if current != nil {
		if err := DecodeOpenCodeConfig([]byte(*current), &root); err != nil {
			return "", fmt.Errorf("Expected a JSON object in %s.", file)
		}
	}
	servers, err := openCodeServers(root, file)
	if err != nil {
		return "", err
	}
	markerFile := filepath.Join(filepath.Dir(file), ".ytk-memory", "opencode-managed")
	owned := false
	if marker, err := os.ReadFile(markerFile); err == nil {
		owned = string(marker) == openCodeMarker
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if _, exists := servers[openCodeServerName]; exists && !owned {
		return "", fmt.Errorf("%s already defines mcp.%s; resolve the collision manually.", file, openCodeServerName)
	}
	servers[openCodeServerName] = map[string]any{"type": "local", "command": []string{executable, "mcp"}, "enabled": true}
	root["mcp"] = servers
	encoded, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return "", err
	}
	return string(encoded) + "\n", nil
}

func uninstallOpenCodeMCP(current *string, file string, owned bool) (*string, bool, error) {
	if current == nil || !owned {
		return current, false, nil
	}
	root := map[string]any{}
	if err := DecodeOpenCodeConfig([]byte(*current), &root); err != nil {
		return nil, false, fmt.Errorf("Expected a JSON object in %s.", file)
	}
	servers, err := openCodeServers(root, file)
	if err != nil {
		return nil, false, err
	}
	if _, found := servers[openCodeServerName]; !found {
		return current, false, nil
	}
	delete(servers, openCodeServerName)
	if len(servers) == 0 {
		delete(root, "mcp")
	} else {
		root["mcp"] = servers
	}
	if len(root) == 0 {
		return nil, true, nil
	}
	encoded, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return nil, false, err
	}
	content := string(encoded) + "\n"
	return &content, true, nil
}

func openCodeServers(root map[string]any, file string) (map[string]any, error) {
	value, found := root["mcp"]
	if !found {
		return map[string]any{}, nil
	}
	servers, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s has a non-object mcp value.", file)
	}
	return servers, nil
}

// OpenCodeConfigPath selects an existing project config, preferring JSON.
func OpenCodeConfigPath(root string) string {
	jsonPath := filepath.Join(root, "opencode.json")
	if _, err := os.Stat(jsonPath); err == nil {
		return jsonPath
	}
	jsoncPath := filepath.Join(root, "opencode.jsonc")
	if _, err := os.Stat(jsoncPath); err == nil {
		return jsoncPath
	}
	return jsonPath
}

// DecodeOpenCodeConfig accepts OpenCode's JSON and JSONC config formats.
func DecodeOpenCodeConfig(data []byte, target any) error {
	cleaned := stripJSONC(data)
	return json.Unmarshal(cleaned, target)
}

func stripJSONC(data []byte) []byte {
	var out strings.Builder
	inString, escaped := false, false
	for i := 0; i < len(data); i++ {
		ch := data[i]
		if inString {
			out.WriteByte(ch)
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				inString = false
			}
			continue
		}
		if ch == '"' {
			inString = true
			out.WriteByte(ch)
			continue
		}
		if ch == '/' && i+1 < len(data) && data[i+1] == '/' {
			for i++; i < len(data) && data[i] != '\n'; i++ {
			}
			out.WriteByte(' ')
			continue
		}
		if ch == '/' && i+1 < len(data) && data[i+1] == '*' {
			i += 2
			for i < len(data)-1 && !(data[i] == '*' && data[i+1] == '/') {
				if data[i] == '\n' {
					out.WriteByte('\n')
				}
				i++
			}
			i++
			continue
		}
		out.WriteByte(ch)
	}
	withoutComments := []byte(out.String())
	out.Reset()
	inString, escaped = false, false
	for i := 0; i < len(withoutComments); i++ {
		ch := withoutComments[i]
		if inString {
			out.WriteByte(ch)
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				inString = false
			}
			continue
		}
		if ch == '"' {
			inString = true
			out.WriteByte(ch)
			continue
		}
		if ch == ',' {
			j := i + 1
			for j < len(withoutComments) && (withoutComments[j] == ' ' || withoutComments[j] == '\t' || withoutComments[j] == '\r' || withoutComments[j] == '\n') {
				j++
			}
			if j < len(withoutComments) && (withoutComments[j] == '}' || withoutComments[j] == ']') {
				continue
			}
		}
		out.WriteByte(ch)
	}
	return []byte(out.String())
}

func openCodeInstructions(project string) string {
	return openCodeLocalStart + "\n## YTK Memory for OpenCode\n\nProject: `" + project + "`. Follow `.ytk-memory/YTK-MEMORY.md` for meaningful project work and saved-memory questions. Start and finish a memory session, retrieve context before durable decisions, and never store secrets.\n" + openCodeLocalEnd
}

func stringPointer(value string) *string { return &value }
