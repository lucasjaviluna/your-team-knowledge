import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  AgentInstallerAdapter,
  FileChange,
  InstructionScope,
} from "./agent-adapter.js";
import { codexSkillMarker, renderCodexSkill } from "./agent-memory-protocol.js";

const start = "# BEGIN ytk-memory-init:codex";
const end = "# END ytk-memory-init:codex";
const instructionsStart = "<!-- BEGIN ytk-memory-init:codex -->";
const instructionsEnd = "<!-- END ytk-memory-init:codex -->";
const globalInstructionsStart = "<!-- BEGIN ytk-memory-init:codex-global -->";
const globalInstructionsEnd = "<!-- END ytk-memory-init:codex-global -->";
const table = "[mcp_servers.ytk_memory]";
const legacyTableName = "team_knowledge_memory";

export const codexInstallerAdapter: AgentInstallerAdapter = {
  name: "codex",
  install(context) {
    const configFile = join(context.root, ".codex", "config.toml");
    const agentsFile = join(context.root, "AGENTS.md");
    const globalAgentsFile = join(codexHome(context), "AGENTS.md");
    const skillFile = join(
      context.root,
      ".agents",
      "skills",
      "ytk-memory",
      "SKILL.md",
    );
    const config = read(configFile);
    const block = [
      start,
      table,
      `command = ${JSON.stringify(context.nodeExecutable)}`,
      `args = ${JSON.stringify([context.executableFile, "--project", context.projectId, "--database", context.databaseFile, ...(context.area ? ["--area", context.area] : [])])}`,
      `cwd = ${JSON.stringify(context.root)}`,
      end,
    ].join("\n");
    const changes: FileChange[] = [
      {
        filename: configFile,
        content: replaceManagedConfig(config, block, configFile),
      },
    ];
    if (includesLocal(context.instructionScope))
      changes.push({
        filename: agentsFile,
        content: replaceBlock(
          read(agentsFile),
          localInstructions(context),
          instructionsStart,
          instructionsEnd,
          agentsFile,
        ),
      });
    if (includesLocal(context.instructionScope))
      changes.push({
        filename: skillFile,
        content: replaceManagedSkill(
          read(skillFile),
          renderCodexSkill(context.projectId),
          skillFile,
        ),
      });
    if (includesGlobal(context.instructionScope))
      changes.push({
        filename: globalAgentsFile,
        content: replaceBlock(
          read(globalAgentsFile),
          globalInstructions(),
          globalInstructionsStart,
          globalInstructionsEnd,
          globalAgentsFile,
        ),
      });
    return changes;
  },
  uninstall(context) {
    const configFile = join(context.root, ".codex", "config.toml");
    const agentsFile = join(context.root, "AGENTS.md");
    const skillFile = join(
      context.root,
      ".agents",
      "skills",
      "ytk-memory",
      "SKILL.md",
    );
    const changes: FileChange[] = [];
    if (includesLocal(context.instructionScope)) {
      changes.push({
        filename: configFile,
        content: removeBlock(read(configFile), start, end, configFile),
      });
      changes.push({
        filename: skillFile,
        content: removeManagedSkill(read(skillFile)),
      });
      changes.push({
        filename: agentsFile,
        content: removeBlock(
          read(agentsFile),
          instructionsStart,
          instructionsEnd,
          agentsFile,
        ),
      });
    }
    if (includesGlobal(context.instructionScope)) {
      const globalAgentsFile = join(codexHome(context), "AGENTS.md");
      changes.push({
        filename: globalAgentsFile,
        content: removeBlock(
          read(globalAgentsFile),
          globalInstructionsStart,
          globalInstructionsEnd,
          globalAgentsFile,
        ),
      });
    }
    return changes;
  },
};

function includesLocal(scope: InstructionScope): boolean {
  return scope === "local" || scope === "both";
}

function includesGlobal(scope: InstructionScope): boolean {
  return scope === "global" || scope === "both";
}

function codexHome(context: {
  environment: NodeJS.ProcessEnv;
  userHome: string;
}): string {
  return resolve(
    context.environment.CODEX_HOME ?? join(context.userHome, ".codex"),
  );
}

function localInstructions(context: { projectId: string }): string {
  return [
    instructionsStart,
    "## YTK Memory",
    "",
    `Project: \`${context.projectId}\`. Apply the \`ytk-memory\` skill for meaningful project work and whenever the user asks about saved YTK Memory. It defines the required session, search, persistence, and handoff workflow. If the skill is unavailable, follow \`.ytk-memory/YTK-MEMORY.md\`. Never store secrets.`,
    instructionsEnd,
  ].join("\n");
}

function globalInstructions(): string {
  return [
    globalInstructionsStart,
    "## YTK Memory",
    "",
    "When the YTK Memory tools are available in the current project, apply its `ytk-memory` skill for meaningful project work and whenever the user asks about saved memory. If that skill is unavailable, follow `.ytk-memory/YTK-MEMORY.md`. Do not store secrets. If the tools are unavailable, continue without YTK Memory.",
    globalInstructionsEnd,
  ].join("\n");
}

function replaceManagedSkill(
  current: string | null,
  skill: string,
  filename: string,
): string {
  if (current !== null && !current.includes(codexSkillMarker))
    throw new Error(
      `${filename} exists without an installer marker; resolve the collision manually.`,
    );
  return skill;
}

function removeManagedSkill(current: string | null): string | null {
  if (current === null || current.includes(codexSkillMarker)) return null;
  return current;
}

function read(filename: string): string | null {
  return existsSync(filename) ? readFileSync(filename, "utf8") : null;
}

function replaceManagedConfig(
  current: string | null,
  block: string,
  filename: string,
): string {
  const withoutOwnBlock = removeBlock(current, start, end, filename);
  const hadOwnBlock = withoutOwnBlock !== current;
  if (withoutOwnBlock !== null) {
    const tables = [...withoutOwnBlock.matchAll(/^\s*\[([^\]\n]+)\]\s*$/gm)];
    let legacyRange: { from: number; to: number } | undefined;
    for (let index = 0; index < tables.length; index += 1) {
      const entry = tables[index];
      const tableName = entry?.[1];
      if (!tableName?.startsWith("mcp_servers.")) continue;
      const name = tableName.slice("mcp_servers.".length).replace(/^"|"$/g, "");
      const from = entry?.index ?? 0;
      const to = tables[index + 1]?.index ?? withoutOwnBlock.length;
      const section = withoutOwnBlock.slice(from, to);
      if (
        name === "ytk_memory" ||
        name.startsWith("ytk_memory.") ||
        name === legacyTableName ||
        name.startsWith(`${legacyTableName}.`)
      ) {
        if (
          (name !== "ytk_memory" && name !== legacyTableName) ||
          hadOwnBlock ||
          legacyRange ||
          !isLegacyMemoryServer(section)
        )
          throw new Error(
            `${filename} already defines mcp_servers.ytk_memory; resolve the collision manually.`,
          );
        legacyRange = { from, to };
        continue;
      }
      if (isLegacyMemoryServer(section))
        throw new Error(
          `${filename} already registers Agent Memory as mcp_servers.${name}; resolve the duplicate manually.`,
        );
    }
    if (legacyRange)
      return append(
        withoutOwnBlock.slice(0, legacyRange.from) +
          withoutOwnBlock.slice(legacyRange.to),
        block,
      );
  }
  return append(withoutOwnBlock, block);
}

function isLegacyMemoryServer(section: string): boolean {
  return /^\s*(?:command|args)\s*=.*(?:ytk-memory-mcp|team-knowledge-memory-mcp|mcp-server\.js)/m.test(
    section,
  );
}

function replaceBlock(
  current: string | null,
  block: string,
  begin: string,
  finish: string,
  filename: string,
): string {
  return append(removeBlock(current, begin, finish, filename), block);
}

function removeBlock(
  current: string | null,
  begin: string,
  finish: string,
  filename: string,
): string | null {
  if (current === null) return null;
  const from = current.indexOf(begin);
  const to = current.indexOf(finish);
  if (from < 0 !== to < 0)
    throw new Error(`${filename} has an incomplete managed block.`);
  if (from < 0) return current;
  if (
    current.indexOf(begin, from + begin.length) >= 0 ||
    current.indexOf(finish, to + finish.length) >= 0 ||
    to < from
  )
    throw new Error(`${filename} has duplicate or malformed managed blocks.`);
  const before = current.slice(0, from);
  const after = current.slice(to + finish.length);
  const remaining = before
    ? before.replace(/\n$/, "") + after.replace(/^\n/, "")
    : after.replace(/^\n{1,2}/, "");
  return remaining || null;
}

function append(current: string | null, block: string): string {
  if (!current) return `${block}\n`;
  return `${current}${current.endsWith("\n") ? "\n" : "\n\n"}${block}\n`;
}
