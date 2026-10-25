package setup

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
)

const (
	claudeLocalStart = "<!-- BEGIN ytk-memory-init:claude -->"
	claudeLocalEnd   = "<!-- END ytk-memory-init:claude -->"
	claudeServerName = "ytk-memory"
	claudeManagedKey = "_managedBy"
	claudeManagedBy  = "ytk-memory-init"
)

// InstallClaude adds a project-scoped stdio server to Claude Code's .mcp.json.
// It preserves foreign MCP servers and writes only a managed block to CLAUDE.md.
func InstallClaude(ctx Context, dryRun bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := claudeInstallChanges(ctx)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, false, "claude-code", "project")
}

// UninstallClaude removes only the server and instructions owned by this setup.
// It deliberately retains the local database and shared YTK Memory protocol.
func UninstallClaude(ctx Context, dryRun bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := claudeUninstallChanges(ctx)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, true, "claude-code", "project")
}

func claudeInstallChanges(ctx Context) ([]change, error) {
	configFile := filepath.Join(ctx.Root, ".ytk-memory.json")
	config, err := jsonObject(configFile)
	if err != nil {
		return nil, err
	}
	config["project_slug"] = ctx.ProjectID
	config["database"] = ctx.Database
	if ctx.Area != "" {
		config["default_area"] = ctx.Area
	}
	encoded, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return nil, err
	}
	configContent := string(encoded) + "\n"

	mcpFile := filepath.Join(ctx.Root, ".mcp.json")
	mcpContent, err := installClaudeMCP(read(mcpFile), mcpFile, ctx.Executable)
	if err != nil {
		return nil, err
	}
	instructions := renderPortable(ctx.ProjectID)
	instructionsFile := filepath.Join(ctx.Root, ".ytk-memory", "YTK-MEMORY.md")
	if err := managedFile(read(instructionsFile), portableMarker, instructionsFile); err != nil {
		return nil, err
	}
	claudeFile := filepath.Join(ctx.Root, "CLAUDE.md")
	claudeContent, err := replaceBlock(read(claudeFile), claudeInstructions(ctx.ProjectID), claudeLocalStart, claudeLocalEnd, claudeFile)
	if err != nil {
		return nil, err
	}
	return []change{{configFile, &configContent}, {mcpFile, &mcpContent}, {instructionsFile, &instructions}, {claudeFile, claudeContent}}, nil
}

func claudeUninstallChanges(ctx Context) ([]change, error) {
	mcpFile := filepath.Join(ctx.Root, ".mcp.json")
	mcpContent, changed, err := uninstallClaudeMCP(read(mcpFile), mcpFile)
	if err != nil {
		return nil, err
	}
	changes := []change{}
	if changed {
		changes = append(changes, change{mcpFile, mcpContent})
	}
	claudeFile := filepath.Join(ctx.Root, "CLAUDE.md")
	claudeContent, err := removeBlock(read(claudeFile), claudeLocalStart, claudeLocalEnd, claudeFile)
	if err != nil {
		return nil, err
	}
	changes = append(changes, change{claudeFile, claudeContent})
	return changes, nil
}

func installClaudeMCP(current *string, file, executable string) (string, error) {
	root := map[string]any{}
	if current != nil {
		if err := json.Unmarshal([]byte(*current), &root); err != nil {
			return "", fmt.Errorf("Expected a JSON object in %s.", file)
		}
	}
	servers, err := mcpServers(root, file)
	if err != nil {
		return "", err
	}
	if existing, ok := servers[claudeServerName]; ok && !claudeManaged(existing) {
		return "", fmt.Errorf("%s already defines mcpServers.%s; resolve the collision manually.", file, claudeServerName)
	}
	servers[claudeServerName] = map[string]any{claudeManagedKey: claudeManagedBy, "command": executable, "args": []string{"mcp"}}
	root["mcpServers"] = servers
	encoded, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return "", err
	}
	return string(encoded) + "\n", nil
}

func uninstallClaudeMCP(current *string, file string) (*string, bool, error) {
	if current == nil {
		return nil, false, nil
	}
	root := map[string]any{}
	if err := json.Unmarshal([]byte(*current), &root); err != nil {
		return nil, false, fmt.Errorf("Expected a JSON object in %s.", file)
	}
	servers, err := mcpServers(root, file)
	if err != nil {
		return nil, false, err
	}
	existing, found := servers[claudeServerName]
	if !found || !claudeManaged(existing) {
		return current, false, nil
	}
	delete(servers, claudeServerName)
	if len(servers) == 0 {
		delete(root, "mcpServers")
	} else {
		root["mcpServers"] = servers
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

func mcpServers(root map[string]any, file string) (map[string]any, error) {
	value, found := root["mcpServers"]
	if !found {
		return map[string]any{}, nil
	}
	servers, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s has a non-object mcpServers value.", file)
	}
	return servers, nil
}

func claudeManaged(value any) bool {
	server, ok := value.(map[string]any)
	return ok && strings.TrimSpace(fmt.Sprint(server[claudeManagedKey])) == claudeManagedBy
}

func claudeInstructions(project string) string {
	return claudeLocalStart + "\n## YTK Memory\n\nProject: `" + project + "`. Follow `.ytk-memory/YTK-MEMORY.md` for meaningful project work and saved-memory questions. Start and finish a memory session, retrieve context before durable decisions, and never store secrets.\n" + claudeLocalEnd
}
