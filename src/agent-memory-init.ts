#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveProjectMemoryConfig } from "./mcp/project-resolver.js";

/** Creates project-local, runtime-neutral MCP setup without overwriting user files. */
export function initializeAgentMemory(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  workingDirectory: string,
): { projectId: string; files: readonly string[] } {
  const values = parseArgs(args);
  const root = resolve(workingDirectory);
  const configFile = join(root, ".team-memory.json");
  const current = existsSync(configFile) ? parseObject(configFile) : {};
  const projectId =
    value(values, "project") ??
    stringValue(current.project_slug) ??
    resolveProjectMemoryConfig({ environment, workingDirectory: root })
      .projectId;
  const database =
    value(values, "database") ??
    stringValue(current.database) ??
    ".team-memory/agent-memory.sqlite";
  const area = value(values, "area") ?? stringValue(current.default_area);
  const mcpFile = join(root, ".team-memory", "mcp.json");
  const instructionsFile = join(root, ".team-memory", "AGENT-MEMORY.md");
  if (!values.has("force"))
    for (const filename of [mcpFile, instructionsFile])
      if (existsSync(filename))
        throw new Error(
          `${filename} already exists; pass --force to replace it.`,
        );
  mkdirSync(dirname(mcpFile), { recursive: true });
  writeFileSync(
    configFile,
    `${JSON.stringify({ ...current, project_slug: projectId, database, ...(area ? { default_area: area } : {}) }, null, 2)}\n`,
  );
  writeFileSync(
    mcpFile,
    `${JSON.stringify({ command: "team-knowledge-memory-mcp", args: ["--database", database] }, null, 2)}\n`,
  );
  writeFileSync(
    instructionsFile,
    `# Agent Memory\n\nProject: \`${projectId}\`. Start with \`memory_session_start\`; search before project decisions; save reusable knowledge with a stable \`topicKey\`; finish with a concise summary. Do not store secrets.\n`,
  );
  return { projectId, files: [configFile, mcpFile, instructionsFile] };
}
function parseArgs(args: readonly string[]): Map<string, string | true> {
  const values = new Map<string, string | true>();
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (
      !flag ||
      !["--project", "--database", "--area", "--force"].includes(flag)
    )
      throw new Error(`Unknown argument: ${flag ?? ""}`);
    if (flag === "--force") {
      values.set("force", true);
      continue;
    }
    const next = args[i + 1];
    if (!next || next.startsWith("--"))
      throw new Error(`Missing value for ${flag}.`);
    values.set(flag.slice(2), next);
    i += 1;
  }
  return values;
}
function value(
  values: Map<string, string | true>,
  name: string,
): string | undefined {
  const result = values.get(name);
  return typeof result === "string" && result.trim()
    ? result.trim()
    : undefined;
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function parseObject(filename: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(filename, "utf8"));
    if (typeof value === "object" && value !== null && !Array.isArray(value))
      return value as Record<string, unknown>;
  } catch {
    /* handled below */
  }
  throw new Error(`Expected a JSON object in ${filename}.`);
}
if (process.argv[1]?.endsWith("agent-memory-init.js")) {
  try {
    process.stdout.write(
      `${JSON.stringify(initializeAgentMemory(process.argv.slice(2), process.env, process.cwd()))}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `agent-memory setup: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
