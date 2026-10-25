// Package setup installs the files owned by the native Agent Memory consumer setup.
package setup

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	configStart    = "# BEGIN ytk-memory-init:codex"
	configEnd      = "# END ytk-memory-init:codex"
	localStart     = "<!-- BEGIN ytk-memory-init:codex -->"
	localEnd       = "<!-- END ytk-memory-init:codex -->"
	portableMarker = "<!-- Managed by ytk-memory-init -->"
	skillMarker    = "<!-- Managed by ytk-memory-init:codex-skill -->"
)

type Context struct {
	Root, Home, Executable, ProjectID, Database, Area string
}
type Change struct {
	File   string `json:"file"`
	Action string `json:"action"`
}
type Result struct {
	ProjectID        string   `json:"projectId"`
	Agent            string   `json:"agent"`
	InstructionScope string   `json:"instructionScope"`
	DryRun           bool     `json:"dryRun"`
	Uninstall        bool     `json:"uninstall"`
	Files            []string `json:"files"`
	Changes          []Change `json:"changes"`
}
type change struct {
	file    string
	content *string
}

func Install(ctx Context, dryRun, portable bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := installChanges(ctx, portable)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, false)
}
func Uninstall(ctx Context, dryRun, removeGlobalMCP bool) (Result, error) {
	if err := valid(ctx); err != nil {
		return Result{}, err
	}
	changes, err := uninstallChanges(ctx, removeGlobalMCP)
	if err != nil {
		return Result{}, err
	}
	return apply(ctx, changes, dryRun, true)
}
func valid(ctx Context) error {
	if strings.TrimSpace(ctx.Root) == "" || strings.TrimSpace(ctx.ProjectID) == "" || strings.TrimSpace(ctx.Database) == "" || strings.TrimSpace(ctx.Executable) == "" {
		return errors.New("setup context is incomplete")
	}
	return nil
}
func installChanges(ctx Context, portable bool) ([]change, error) {
	configFile := filepath.Join(ctx.Root, ".ytk-memory.json")
	current, err := jsonObject(configFile)
	if err != nil {
		return nil, err
	}
	current["project_slug"] = ctx.ProjectID
	current["database"] = ctx.Database
	if ctx.Area != "" {
		current["default_area"] = ctx.Area
	}
	encoded, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return nil, err
	}
	portableContent := string(encoded) + "\n"
	configPath := filepath.Join(ctx.Home, "config.toml")
	args := []string{"mcp"}
	jsonArgs, _ := json.Marshal(args)
	block := strings.Join([]string{configStart, "[mcp_servers.ytk_memory]", "command = " + quote(ctx.Executable), "args = " + string(jsonArgs), configEnd}, "\n")
	managed, err := replaceConfig(read(configPath), block, configPath)
	if err != nil {
		return nil, err
	}
	changes := []change{{configFile, &portableContent}, {configPath, &managed}}
	legacyConfigPath := filepath.Join(ctx.Root, ".codex", "config.toml")
	legacyCurrent := read(legacyConfigPath)
	legacyConfig, err := removeBlock(legacyCurrent, configStart, configEnd, legacyConfigPath)
	if err != nil {
		return nil, err
	}
	if legacyConfig != nil && strings.Contains(*legacyConfig, "[mcp_servers.ytk_memory]") {
		return nil, fmt.Errorf("%s already defines mcp_servers.ytk_memory; resolve the collision manually.", legacyConfigPath)
	}
	if legacyCurrent != legacyConfig {
		changes = append(changes, change{legacyConfigPath, legacyConfig})
	}
	instructions := renderPortable(ctx.ProjectID)
	instructionsFile := filepath.Join(ctx.Root, ".ytk-memory", "YTK-MEMORY.md")
	if err := managedFile(read(instructionsFile), portableMarker, instructionsFile); err != nil {
		return nil, err
	}
	changes = append(changes, change{instructionsFile, &instructions})
	if portable {
		mcpFile := filepath.Join(ctx.Root, ".ytk-memory", "mcp.json")
		mcp := fmt.Sprintf("{\n  \"_managedBy\": \"ytk-memory-init\",\n  \"command\": %s,\n  \"args\": %s\n}\n", quote(ctx.Executable), string(jsonArgs))
		if err := managedFile(read(mcpFile), "\"_managedBy\": \"ytk-memory-init\"", mcpFile); err != nil {
			return nil, err
		}
		changes = append(changes, change{mcpFile, &mcp})
	}
	agents := filepath.Join(ctx.Root, "AGENTS.md")
	text, err := replaceBlock(read(agents), localInstructions(ctx.ProjectID), localStart, localEnd, agents)
	if err != nil {
		return nil, err
	}
	changes = append(changes, change{agents, text})
	skill := filepath.Join(ctx.Root, ".agents", "skills", "ytk-memory", "SKILL.md")
	if err := managedFile(read(skill), skillMarker, skill); err != nil {
		return nil, err
	}
	rendered := renderSkill(ctx.ProjectID)
	changes = append(changes, change{skill, &rendered})
	return changes, nil
}
func uninstallChanges(ctx Context, removeGlobalMCP bool) ([]change, error) {
	changes := []change{}
	if removeGlobalMCP {
		config := filepath.Join(ctx.Home, "config.toml")
		text, err := removeBlock(read(config), configStart, configEnd, config)
		if err != nil {
			return nil, err
		}
		changes = append(changes, change{config, text})
	}
	legacyConfig := filepath.Join(ctx.Root, ".codex", "config.toml")
	legacyCurrent := read(legacyConfig)
	legacyText, err := removeBlock(legacyCurrent, configStart, configEnd, legacyConfig)
	if err != nil {
		return nil, err
	}
	if legacyCurrent != legacyText {
		changes = append(changes, change{legacyConfig, legacyText})
	}
	agents := filepath.Join(ctx.Root, "AGENTS.md")
	text, err := removeBlock(read(agents), localStart, localEnd, agents)
	if err != nil {
		return nil, err
	}
	changes = append(changes, change{agents, text})
	skill := filepath.Join(ctx.Root, ".agents", "skills", "ytk-memory", "SKILL.md")
	current := read(skill)
	if current != nil && strings.Contains(*current, skillMarker) {
		changes = append(changes, change{skill, nil})
	}
	return changes, nil
}
func apply(ctx Context, changes []change, dry, uninstall bool) (Result, error) {
	result := Result{ProjectID: ctx.ProjectID, Agent: "codex", InstructionScope: "local", DryRun: dry, Uninstall: uninstall, Files: []string{}, Changes: []Change{}}
	pending := []change{}
	for _, c := range changes {
		before := read(c.file)
		same := (before == nil && c.content == nil) || (before != nil && c.content != nil && *before == *c.content)
		if same {
			continue
		}
		action := "update"
		if c.content == nil {
			action = "remove"
		} else if before == nil {
			action = "create"
		}
		result.Files = append(result.Files, c.file)
		result.Changes = append(result.Changes, Change{File: c.file, Action: action})
		pending = append(pending, c)
	}
	if dry {
		return result, nil
	}
	prior := []change{}
	for _, c := range pending {
		before := read(c.file)
		prior = append(prior, change{c.file, before})
		if err := write(c); err != nil {
			for i := len(prior) - 1; i >= 0; i-- {
				_ = write(prior[i])
			}
			return Result{}, err
		}
	}
	return result, nil
}
func write(c change) error {
	if c.content == nil {
		if err := os.Remove(c.file); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(c.file), 0755); err != nil {
		return err
	}
	tmp := c.file + ".ytk-memory.tmp"
	if err := os.WriteFile(tmp, []byte(*c.content), 0644); err != nil {
		return err
	}
	return os.Rename(tmp, c.file)
}
func jsonObject(file string) (map[string]any, error) {
	raw := read(file)
	if raw == nil {
		return map[string]any{}, nil
	}
	out := map[string]any{}
	if err := json.Unmarshal([]byte(*raw), &out); err != nil {
		return nil, fmt.Errorf("Expected a JSON object in %s.", file)
	}
	return out, nil
}
func read(file string) *string {
	raw, err := os.ReadFile(file)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return nil
	}
	text := string(raw)
	return &text
}
func quote(value string) string { encoded, _ := json.Marshal(value); return string(encoded) }
func managedFile(current *string, marker, file string) error {
	if current != nil && !strings.Contains(*current, marker) {
		return fmt.Errorf("%s exists without an installer marker; resolve the collision manually.", file)
	}
	return nil
}
func replaceConfig(current *string, block, file string) (string, error) {
	without, err := removeBlock(current, configStart, configEnd, file)
	if err != nil {
		return "", err
	}
	if without != nil {
		if strings.Contains(*without, "[mcp_servers.ytk_memory]") {
			return "", fmt.Errorf("%s already defines mcp_servers.ytk_memory; resolve the collision manually.", file)
		}
	}
	return appendBlock(without, block), nil
}
func replaceBlock(current *string, block, begin, end, file string) (*string, error) {
	without, err := removeBlock(current, begin, end, file)
	if err != nil {
		return nil, err
	}
	out := appendBlock(without, block)
	return &out, nil
}
func removeBlock(current *string, begin, end, file string) (*string, error) {
	if current == nil {
		return nil, nil
	}
	from := strings.Index(*current, begin)
	to := strings.Index(*current, end)
	if (from < 0) != (to < 0) {
		return nil, fmt.Errorf("%s has an incomplete managed block.", file)
	}
	if from < 0 {
		return current, nil
	}
	if strings.Index((*current)[from+len(begin):], begin) >= 0 || strings.Index((*current)[to+len(end):], end) >= 0 || to < from {
		return nil, fmt.Errorf("%s has duplicate or malformed managed blocks.", file)
	}
	remaining := (*current)[:from] + (*current)[to+len(end):]
	remaining = strings.TrimPrefix(remaining, "\n")
	remaining = strings.TrimPrefix(remaining, "\n")
	remaining = strings.TrimSuffix(remaining, "\n\n")
	if remaining == "" {
		return nil, nil
	}
	if !strings.HasSuffix(remaining, "\n") {
		remaining += "\n"
	}
	return &remaining, nil
}
func appendBlock(current *string, block string) string {
	if current == nil || *current == "" {
		return block + "\n"
	}
	return strings.TrimRight(*current, "\n") + "\n\n" + block + "\n"
}
func renderPortable(project string) string {
	return "# Agent Memory\n\n" + portableMarker + "\n\n" + protocol(project)
}
func renderSkill(project string) string {
	return "---\nname: ytk-memory\ndescription: Use YTK Memory for meaningful project work and questions about saved project memory.\n---\n\n" + skillMarker + "\n\n# YTK Memory workflow\n\n" + protocol(project)
}
func protocol(project string) string {
	return strings.Join([]string{
		"## Scope",
		"",
		"This workflow belongs to project `" + project + "`. The configured MCP server is already scoped to this project and its SQLite database. Do not try to use it to read or write another project.",
		"",
		"## When to use this workflow",
		"",
		"Use it for meaningful coding or investigation work in this project, and whenever the user asks what is saved in YTK Memory. Trivial conversation that does not need project context does not require a memory session. Use the configured YTK Memory MCP tools for memory questions; do not inspect the SQLite file directly as a substitute.",
		"",
		"## Start of work",
		"",
		"1. Call `memory_session_start` once when a meaningful task begins. For a follow-up in the same task, keep using that session instead of starting a new one. Pass a short topic as `query` when one is clear.",
		"2. Keep the returned `sessionId`. Pass it to every `memory_save` made during that task and to `memory_session_finish`.",
		"3. Treat returned entries as evidence. An empty result means that the query found no relevant entries; it does not mean the database is empty.",
		"",
		"## Search carefully",
		"",
		"- Use a short, focused keyword or phrase, preferably one topic per `memory_search` call (for example, `Go` or `installer`). Avoid combining many synonyms or writing a long question as one query.",
		"- If a search is empty, retry with a simpler or more distinctive term. Try alternate wording or language separately when useful, then report that no matching entry was found if those searches are also empty.",
		"- Do not infer that the database is empty or count all entries from search results. These tools do not provide a full listing or total-count operation.",
		"- Use `memory_get` to read a result by ID when its preview is insufficient.",
		"- Keep `limit` between 1 and 100 and `maxChars` between 100 and 20000.",
		"",
		"## Persist durable findings",
		"",
		"Save reusable decisions, discoveries, patterns, or preferences with a stable `subjectKey`. Do not store secrets, credentials, tokens, unnecessary personal data, or raw conversations. Never store unverified hypotheses as facts.",
		"",
		"## Finish or pause work",
		"",
		"Before ending a meaningful task, call `memory_session_finish` with the same `sessionId`. Include a concise handoff when there are useful findings or unfinished work.",
	}, "\n") + "\n"
}
func localInstructions(project string) string {
	return localStart + "\n## YTK Memory\n\nProject: `" + project + "`. Apply the `ytk-memory` skill for meaningful project work and whenever the user asks about saved YTK Memory. If the skill is unavailable, follow `.ytk-memory/YTK-MEMORY.md`. Never store secrets.\n" + localEnd
}
