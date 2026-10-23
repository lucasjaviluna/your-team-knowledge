import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeAgentMemory } from "../../src/agent-memory-init.js";

const directories: string[] = [];
function project(): string {
  const root = mkdtempSync(join(tmpdir(), "memory-installer-"));
  directories.push(root);
  return root;
}
afterEach(() => {
  for (const root of directories.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("Codex Agent Memory installer", () => {
  it("preserves existing config and instructions across install, repeat and uninstall", () => {
    const root = project();
    mkdirSync(join(root, ".codex"));
    writeFileSync(
      join(root, ".codex", "config.toml"),
      'model = "gpt-6"\n\n[mcp_servers.other]\nurl = "https://example.org/mcp"\n',
    );
    writeFileSync(
      join(root, "AGENTS.md"),
      "# Team guidance\n\nKeep the existing rules.\n",
    );
    const args = [
      "--agent",
      "codex",
      "--project",
      "sample",
      "--area",
      "backend",
    ];
    const preview = initializeAgentMemory([...args, "--dry-run"], {}, root);
    expect(preview.instructionScope).toBe("local");
    expect(preview.files).toHaveLength(5);
    expect(
      preview.changes.filter((change) => change.action === "create"),
    ).toHaveLength(3);
    expect(
      preview.changes.filter((change) => change.action === "update"),
    ).toHaveLength(2);
    expect(existsSync(join(root, ".ytk-memory.json"))).toBe(false);
    expect(existsSync(join(root, ".ytk-memory", "mcp.json"))).toBe(false);

    initializeAgentMemory(args, {}, root);
    const config = readFileSync(join(root, ".codex", "config.toml"), "utf8");
    expect(config).toContain('model = "gpt-6"');
    expect(config).toContain("[mcp_servers.other]");
    expect(config).toContain("[mcp_servers.ytk_memory]");
    expect(config).toContain('"--project","sample"');
    expect(config).toContain('"--area","backend"');
    expect(existsSync(join(root, ".ytk-memory", "mcp.json"))).toBe(false);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
      "Keep the existing rules.",
    );
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
      "Apply the `ytk-memory` skill for meaningful project work and whenever the user asks about saved YTK Memory",
    );
    expect(
      readFileSync(join(root, ".ytk-memory", "YTK-MEMORY.md"), "utf8"),
    ).toContain("## Available tools");
    const skill = readFileSync(
      join(root, ".agents", "skills", "ytk-memory", "SKILL.md"),
      "utf8",
    );
    expect(skill).toContain("name: ytk-memory");
    expect(skill).toContain("memory_session_finish");
    const normalizedSkill = skill.replace(/\s+/gu, " ");
    expect(normalizedSkill).toContain(
      "An empty result means that the query found no relevant entries; it does not mean the database is empty.",
    );
    expect(normalizedSkill).toContain(
      "These tools do not provide a full listing or total-count operation.",
    );
    expect(initializeAgentMemory(args, {}, root).files).toEqual([]);

    initializeAgentMemory(["--agent", "codex", "--uninstall"], {}, root);
    expect(readFileSync(join(root, ".codex", "config.toml"), "utf8")).toBe(
      'model = "gpt-6"\n\n[mcp_servers.other]\nurl = "https://example.org/mcp"\n',
    );
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe(
      "# Team guidance\n\nKeep the existing rules.\n",
    );
    expect(existsSync(join(root, ".ytk-memory.json"))).toBe(true);
    expect(
      existsSync(join(root, ".agents", "skills", "ytk-memory", "SKILL.md")),
    ).toBe(false);
  });

  it("rejects a foreign server collision before writing any file", () => {
    const root = project();
    mkdirSync(join(root, ".codex"));
    writeFileSync(
      join(root, ".codex", "config.toml"),
      '[mcp_servers.ytk_memory]\ncommand = "other"\n',
    );
    expect(() =>
      initializeAgentMemory(
        ["--agent", "codex", "--project", "sample"],
        {},
        root,
      ),
    ).toThrow(/collision/);
    expect(existsSync(join(root, ".ytk-memory.json"))).toBe(false);
  });

  it("migrates the previous portable files and a recognized Codex server", () => {
    const root = project();
    mkdirSync(join(root, ".codex"));
    mkdirSync(join(root, ".team-memory"));
    writeFileSync(
      join(root, ".codex", "config.toml"),
      '[mcp_servers.team_knowledge_memory]\ncommand = "team-knowledge-memory-mcp"\n\n[features]\nsearch = true\n',
    );
    writeFileSync(
      join(root, ".team-memory", "mcp.json"),
      '{"command":"team-knowledge-memory-mcp","args":["--database","db.sqlite"]}\n',
    );
    writeFileSync(
      join(root, ".team-memory", "AGENT-MEMORY.md"),
      "# Agent Memory\n\nProject: `sample`. Start with `memory_session_start`; search before project decisions; save reusable knowledge with a stable `topicKey`; finish with a concise summary. Do not store secrets.\n",
    );
    initializeAgentMemory(
      ["--agent", "codex", "--project", "sample", "--portable"],
      {},
      root,
    );
    const config = readFileSync(join(root, ".codex", "config.toml"), "utf8");
    expect(config.match(/\[mcp_servers\.ytk_memory\]/g)).toHaveLength(1);
    expect(config).toContain("[features]\nsearch = true");
    expect(
      readFileSync(join(root, ".ytk-memory", "mcp.json"), "utf8"),
    ).toContain('"_managedBy": "ytk-memory-init"');
  });

  it("creates the portable MCP manifest only when requested", () => {
    const root = project();
    initializeAgentMemory(
      ["--agent", "codex", "--project", "sample", "--portable"],
      {},
      root,
    );
    expect(existsSync(join(root, ".ytk-memory", "mcp.json"))).toBe(true);
  });

  it("rejects a foreign project skill before writing any installer file", () => {
    const root = project();
    const skill = join(root, ".agents", "skills", "ytk-memory");
    mkdirSync(skill, { recursive: true });
    writeFileSync(join(skill, "SKILL.md"), "# Another workflow\n");
    expect(() =>
      initializeAgentMemory(
        ["--agent", "codex", "--project", "sample"],
        {},
        root,
      ),
    ).toThrow(/exists without an installer marker/);
    expect(existsSync(join(root, ".ytk-memory.json"))).toBe(false);
    expect(existsSync(join(root, ".codex", "config.toml"))).toBe(false);
  });

  it("installs and removes only conditional instructions in the configured Codex home", () => {
    const root = project();
    const codexHome = join(root, "user-codex");
    mkdirSync(codexHome);
    writeFileSync(join(codexHome, "AGENTS.md"), "# Personal guidance\n");
    initializeAgentMemory(
      ["--agent", "codex", "--project", "sample", "--instructions", "global"],
      { CODEX_HOME: codexHome },
      root,
    );
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(
      existsSync(join(root, ".agents", "skills", "ytk-memory", "SKILL.md")),
    ).toBe(false);
    const globalInstructions = readFileSync(
      join(codexHome, "AGENTS.md"),
      "utf8",
    );
    expect(globalInstructions).toContain("Personal guidance");
    expect(globalInstructions).toContain("tools are available");
    expect(globalInstructions).toContain("asks about saved memory");
    expect(globalInstructions).not.toContain("Project: `sample`");

    initializeAgentMemory(
      ["--agent", "codex", "--uninstall", "--instructions", "global"],
      { CODEX_HOME: codexHome },
      root,
    );
    expect(readFileSync(join(codexHome, "AGENTS.md"), "utf8")).toBe(
      "# Personal guidance\n",
    );
    expect(existsSync(join(root, ".codex", "config.toml"))).toBe(true);
  });

  it("keeps global guidance generic and local guidance project-specific when installing both", () => {
    const root = project();
    const codexHome = join(root, "user-codex");
    initializeAgentMemory(
      ["--agent", "codex", "--project", "sample", "--instructions", "both"],
      { CODEX_HOME: codexHome },
      root,
    );
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
      "Project: `sample`",
    );
    expect(
      existsSync(join(root, ".agents", "skills", "ytk-memory", "SKILL.md")),
    ).toBe(true);
    const globalInstructions = readFileSync(
      join(codexHome, "AGENTS.md"),
      "utf8",
    );
    expect(globalInstructions).toContain("tools are available");
    expect(globalInstructions).not.toContain("Project: `sample`");
  });
});
