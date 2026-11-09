package setup

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"reflect"
)

const copilotStart = "<!-- BEGIN ytk-memory-init:copilot -->"
const copilotEnd = "<!-- END ytk-memory-init:copilot -->"
const copilotMarker = "copilot-vscode-managed.json"

// InstallCopilot configures VS Code workspace MCP and project instructions.
func InstallCopilot(ctx Context, dryRun bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := copilotChanges(ctx, false)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, false, "copilot-vscode", "project")
}

// UninstallCopilot only removes files and entries owned by this adapter.
func UninstallCopilot(ctx Context, dryRun bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := copilotChanges(ctx, true)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, true, "copilot-vscode", "project")
}
func copilotChanges(ctx Context, uninstall bool) ([]change, error) {
	mcpFile := filepath.Join(ctx.Root, ".vscode", "mcp.json")
	markerFile := filepath.Join(ctx.Root, ".ytk-memory", copilotMarker)
	instructionsFile := filepath.Join(ctx.Root, ".github", "copilot-instructions.md")
	current := read(mcpFile)
	marker := read(markerFile)
	if uninstall && marker == nil {
		block, err := removeBlock(read(instructionsFile), copilotStart, copilotEnd, instructionsFile)
		if err != nil {
			return nil, err
		}
		return []change{{instructionsFile, block}}, nil
	}
	root := map[string]any{}
	if current != nil {
		if err := json.Unmarshal([]byte(*current), &root); err != nil || root == nil {
			return nil, fmt.Errorf("%s must contain a JSON object without comments; preserve and resolve the configuration manually", mcpFile)
		}
	}
	servers := map[string]any{}
	if val, ok := root["servers"]; ok {
		var valid bool
		servers, valid = val.(map[string]any)
		if !valid {
			return nil, fmt.Errorf("%s has a non-object servers value", mcpFile)
		}
	}
	existing, exists := servers["ytk-memory"]
	var owned any
	if marker != nil {
		if json.Unmarshal([]byte(*marker), &owned) != nil || !validCopilotMarker(owned) {
			return nil, fmt.Errorf("%s has invalid ownership data", markerFile)
		}
	}
	if marker != nil && exists && !reflect.DeepEqual(existing, owned) {
		return nil, fmt.Errorf("%s has a modified managed server; resolve ownership manually", mcpFile)
	}
	if !uninstall && exists && marker == nil {
		return nil, fmt.Errorf("%s already defines servers.ytk-memory; resolve the collision manually", mcpFile)
	}
	changes := []change{}
	if uninstall {
		if exists && marker != nil {
			delete(servers, "ytk-memory")
			if len(servers) == 0 {
				delete(root, "servers")
			} else {
				root["servers"] = servers
			}
			if len(root) == 0 {
				changes = append(changes, change{mcpFile, nil})
			} else {
				b, err := json.MarshalIndent(root, "", "  ")
				if err != nil {
					return nil, err
				}
				v := string(b) + "\n"
				changes = append(changes, change{mcpFile, &v})
			}
		}
		if marker != nil {
			changes = append(changes, change{markerFile, nil})
		}
		block, err := removeBlock(read(instructionsFile), copilotStart, copilotEnd, instructionsFile)
		if err != nil {
			return nil, err
		}
		return append(changes, change{instructionsFile, block}), nil
	}
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
	configText := string(encoded) + "\n"
	server := map[string]any{"type": "stdio", "command": ctx.Executable, "args": []string{"mcp"}, "cwd": ctx.Root}
	servers["ytk-memory"] = server
	root["servers"] = servers
	encoded, err = json.MarshalIndent(root, "", "  ")
	if err != nil {
		return nil, err
	}
	mcpText := string(encoded) + "\n"
	encoded, err = json.MarshalIndent(server, "", "  ")
	if err != nil {
		return nil, err
	}
	markerText := string(encoded) + "\n"
	portableFile := filepath.Join(ctx.Root, ".ytk-memory", "YTK-MEMORY.md")
	portable := renderPortable(ctx.ProjectID)
	if err = managedFile(read(portableFile), portableMarker, portableFile); err != nil {
		return nil, err
	}
	block := copilotStart + "\n## YTK Memory\n\nProject: `" + ctx.ProjectID + "`. Follow `.ytk-memory/YTK-MEMORY.md` for meaningful project work and saved-memory questions. Start and finish a session, retrieve context before decisions, and never store secrets.\n" + copilotEnd
	instructions, err := replaceBlock(read(instructionsFile), block, copilotStart, copilotEnd, instructionsFile)
	if err != nil {
		return nil, err
	}
	return []change{{configFile, &configText}, {mcpFile, &mcpText}, {markerFile, &markerText}, {portableFile, &portable}, {instructionsFile, instructions}}, nil
}

func validCopilotMarker(value any) bool {
	entry, ok := value.(map[string]any)
	if !ok || len(entry) != 4 || entry["type"] != "stdio" {
		return false
	}
	exe, ok := entry["command"].(string)
	if !ok || exe == "" {
		return false
	}
	cwd, ok := entry["cwd"].(string)
	if !ok || cwd == "" {
		return false
	}
	args, ok := entry["args"].([]any)
	return ok && len(args) == 1 && args[0] == "mcp"
}
