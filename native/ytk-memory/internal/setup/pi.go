package setup

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
)

const (
	piLocalStart        = "<!-- BEGIN ytk-memory-init:pi -->"
	piLocalEnd          = "<!-- END ytk-memory-init:pi -->"
	piServerName        = "ytk-memory"
	piServerDescription = "Managed by ytk-memory-init: local Agent Memory for this project."
)

// InstallPi configures Pi's trusted project MCP file and a scoped AGENTS.md
// block. Pi reads .pi/mcp.json only after the project has been trusted.
func InstallPi(ctx Context, dryRun bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := piInstallChanges(ctx)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, false, "pi", "project")
}

// UninstallPi removes only the Pi MCP entry and Pi-managed instructions.
func UninstallPi(ctx Context, dryRun bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := piUninstallChanges(ctx)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, true, "pi", "project")
}

func piInstallChanges(ctx Context) ([]change, error) {
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
	mcpFile := filepath.Join(ctx.Root, ".pi", "mcp.json")
	mcpContent, err := installPiMCP(read(mcpFile), mcpFile, ctx.Executable)
	if err != nil {
		return nil, err
	}
	instructions := renderPortable(ctx.ProjectID)
	instructionsFile := filepath.Join(ctx.Root, ".ytk-memory", "YTK-MEMORY.md")
	if err := managedFile(read(instructionsFile), portableMarker, instructionsFile); err != nil {
		return nil, err
	}
	agentsFile := filepath.Join(ctx.Root, "AGENTS.md")
	agentsContent, err := replaceBlock(read(agentsFile), piInstructions(ctx.ProjectID), piLocalStart, piLocalEnd, agentsFile)
	if err != nil {
		return nil, err
	}
	return []change{{configFile, &configContent}, {mcpFile, &mcpContent}, {instructionsFile, &instructions}, {agentsFile, agentsContent}}, nil
}

func piUninstallChanges(ctx Context) ([]change, error) {
	mcpFile := filepath.Join(ctx.Root, ".pi", "mcp.json")
	mcpContent, changed, err := uninstallPiMCP(read(mcpFile), mcpFile)
	if err != nil {
		return nil, err
	}
	changes := []change{}
	if changed {
		changes = append(changes, change{mcpFile, mcpContent})
	}
	agentsFile := filepath.Join(ctx.Root, "AGENTS.md")
	agentsContent, err := removeBlock(read(agentsFile), piLocalStart, piLocalEnd, agentsFile)
	if err != nil {
		return nil, err
	}
	changes = append(changes, change{agentsFile, agentsContent})
	return changes, nil
}

func installPiMCP(current *string, file, executable string) (string, error) {
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
	if existing, ok := servers[piServerName]; ok && !piManaged(existing) {
		return "", fmt.Errorf("%s already defines mcpServers.%s; resolve the collision manually.", file, piServerName)
	}
	servers[piServerName] = map[string]any{"command": executable, "args": []string{"mcp"}, "description": piServerDescription}
	root["mcpServers"] = servers
	encoded, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return "", err
	}
	return string(encoded) + "\n", nil
}

func uninstallPiMCP(current *string, file string) (*string, bool, error) {
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
	existing, found := servers[piServerName]
	if !found || !piManaged(existing) {
		return current, false, nil
	}
	delete(servers, piServerName)
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

func piManaged(value any) bool {
	server, ok := value.(map[string]any)
	return ok && strings.TrimSpace(fmt.Sprint(server["description"])) == piServerDescription
}

func piInstructions(project string) string {
	return piLocalStart + "\n## YTK Memory for Pi\n\nProject: `" + project + "`. Follow `.ytk-memory/YTK-MEMORY.md` for meaningful project work and saved-memory questions. Start and finish a memory session, retrieve context before durable decisions, and never store secrets.\n" + piLocalEnd
}
