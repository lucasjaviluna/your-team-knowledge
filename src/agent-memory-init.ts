#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { codexInstallerAdapter } from "./installer/codex-adapter.js";
import {
  portableProtocolMarker,
  renderPortableProtocol,
} from "./installer/agent-memory-protocol.js";
import type {
  AgentInstallerAdapter,
  FileChange,
  InstructionScope,
  InstallerContext,
} from "./installer/agent-adapter.js";
import { resolveProjectMemoryConfig } from "./mcp/project-resolver.js";

const adapters = new Map<string, AgentInstallerAdapter>([
  [codexInstallerAdapter.name, codexInstallerAdapter],
]);

export interface InitializationResult {
  projectId: string;
  agent?: string;
  instructionScope?: InstructionScope;
  dryRun: boolean;
  uninstall: boolean;
  files: readonly string[];
  changes: readonly { file: string; action: "create" | "update" | "remove" }[];
}

/** Plans all changes before writing, so a collision cannot cause a partial install. */
export function initializeAgentMemory(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  workingDirectory: string,
): InitializationResult {
  const values = parseArgs(args);
  const root = resolve(workingDirectory);
  const agent = value(values, "agent");
  const adapter = agent ? adapters.get(agent) : undefined;
  if (agent && !adapter)
    throw new Error(
      `Unsupported agent: ${agent}. Supported agents: ${[...adapters.keys()].join(", ")}.`,
    );
  const uninstall = values.has("uninstall");
  if (uninstall && !adapter) throw new Error("--uninstall requires --agent.");
  if (
    !uninstall &&
    Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) < 22
  )
    throw new Error("YTK Memory requires Node.js 22 or newer.");
  const configFile = join(root, ".ytk-memory.json");
  const current = existsSync(configFile) ? parseObject(configFile) : {};
  const projectArg = value(values, "project");
  const databaseArg = value(values, "database");
  const areaArg = value(values, "area");
  const instructionScope = instructionScopeValue(values);
  const resolved = resolveProjectMemoryConfig({
    ...(projectArg ? { projectId: projectArg } : {}),
    ...(databaseArg ? { database: databaseArg } : {}),
    ...(areaArg ? { area: areaArg } : {}),
    environment,
    workingDirectory: root,
  });
  const projectId =
    projectArg ?? stringValue(current.project_slug) ?? resolved.projectId;
  const database =
    databaseArg ??
    stringValue(current.database) ??
    ".ytk-memory/ytk-memory.sqlite";
  const area = areaArg ?? stringValue(current.default_area);
  const executableFile = uninstall ? "" : resolveExecutableFile();
  const context: InstallerContext = {
    root,
    userHome: homedir(),
    environment,
    projectId,
    databaseFile: resolve(root, database),
    executableFile,
    nodeExecutable: process.execPath,
    instructionScope,
    ...(area ? { area } : {}),
  };
  const changes: readonly FileChange[] = uninstall
    ? (adapter?.uninstall(context) ?? [])
    : [
        ...portableChanges(
          context,
          current,
          configFile,
          values.has("force"),
          !adapter || values.has("portable"),
        ),
        ...(adapter?.install(context) ?? []),
      ];
  const modified = changes.filter(
    ({ filename, content }) => read(filename) !== content,
  );
  const actions: InitializationResult["changes"] = modified.map(
    ({ filename, content }) => ({
      file: filename,
      action:
        content === null
          ? "remove"
          : read(filename) === null
            ? "create"
            : "update",
    }),
  );
  if (!values.has("dry-run")) applyChanges(modified);
  return {
    projectId,
    ...(agent ? { agent } : {}),
    ...(agent ? { instructionScope } : {}),
    dryRun: values.has("dry-run"),
    uninstall,
    files: modified.map(({ filename }) => filename),
    changes: actions,
  };
}

function portableChanges(
  context: InstallerContext,
  current: Record<string, unknown>,
  configFile: string,
  force: boolean,
  includeMcpManifest: boolean,
): FileChange[] {
  const database = context.databaseFile;
  const mcpFile = join(context.root, ".ytk-memory", "mcp.json");
  const instructionsFile = join(context.root, ".ytk-memory", "YTK-MEMORY.md");
  const config = `${JSON.stringify({ ...current, project_slug: context.projectId, database, ...(context.area ? { default_area: context.area } : {}) }, null, 2)}\n`;
  const mcp = `${JSON.stringify({ _managedBy: "ytk-memory-init", command: context.nodeExecutable, args: [context.executableFile, "--project", context.projectId, "--database", database, ...(context.area ? ["--area", context.area] : [])] }, null, 2)}\n`;
  const instructions = renderPortableProtocol(context.projectId);
  const managedFiles = includeMcpManifest
    ? ([
        [mcpFile, '"_managedBy": "ytk-memory-init"'],
        [instructionsFile, portableProtocolMarker],
      ] as const)
    : ([[instructionsFile, portableProtocolMarker]] as const);
  for (const [filename, marker] of managedFiles) {
    const existing = read(filename);
    const legacy =
      includeMcpManifest && filename === mcpFile
        ? isLegacyPortableMcp(existing)
        : isLegacyPortableInstructions(existing);
    if (existing !== null && !existing.includes(marker) && !legacy && !force)
      throw new Error(
        `${filename} exists without an installer marker; pass --force to replace it.`,
      );
  }
  return [
    { filename: configFile, content: config },
    ...(includeMcpManifest ? [{ filename: mcpFile, content: mcp }] : []),
    { filename: instructionsFile, content: instructions },
  ];
}

function isLegacyPortableMcp(content: string | null): boolean {
  if (content === null) return false;
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return false;
    const record = parsed as Record<string, unknown>;
    return (
      Object.keys(record).length === 2 &&
      (record.command === "ytk-memory-mcp" ||
        record.command === "team-knowledge-memory-mcp") &&
      Array.isArray(record.args) &&
      record.args.length === 2 &&
      record.args[0] === "--database" &&
      typeof record.args[1] === "string"
    );
  } catch {
    return false;
  }
}

function isLegacyPortableInstructions(content: string | null): boolean {
  return (
    content !== null &&
    /^# Agent Memory\n\nProject: `[^`]+`\. Start with `memory_session_start`; search before project decisions; save reusable knowledge with a stable `subjectKey`; finish with a concise summary\. Do not store secrets\.\n?$/.test(
      content,
    )
  );
}

function applyChanges(changes: readonly FileChange[]): void {
  const prior: { filename: string; content: string | null }[] = [];
  try {
    for (const change of changes) {
      const previous = read(change.filename);
      prior.push({ filename: change.filename, content: previous });
      if (change.content === null) {
        if (previous !== null) unlinkSync(change.filename);
      } else {
        mkdirSync(dirname(change.filename), { recursive: true });
        replaceFile(change.filename, change.content);
      }
    }
  } catch (error) {
    for (const change of prior.reverse()) {
      if (change.content === null) {
        if (existsSync(change.filename)) unlinkSync(change.filename);
      } else replaceFile(change.filename, change.content);
    }
    throw error;
  }
}

function replaceFile(filename: string, content: string): void {
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, content, "utf8");
    renameSync(temporary, filename);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function resolveExecutableFile(): string {
  const alongside = fileURLToPath(new URL("./mcp-server.js", import.meta.url));
  if (existsSync(alongside)) return alongside;
  const built = fileURLToPath(
    new URL("../dist/mcp-server.js", import.meta.url),
  );
  if (existsSync(built)) return built;
  throw new Error(
    "YTK Memory MCP executable is missing; build or reinstall the package first.",
  );
}

function parseArgs(args: readonly string[]): Map<string, string | true> {
  const values = new Map<string, string | true>();
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (
      !flag ||
      ![
        "--project",
        "--database",
        "--area",
        "--agent",
        "--force",
        "--dry-run",
        "--uninstall",
        "--instructions",
        "--no-prompt",
        "--portable",
      ].includes(flag)
    )
      throw new Error(`Unknown argument: ${flag ?? ""}`);
    if (values.has(flag.slice(2)))
      throw new Error(`Duplicate argument: ${flag}.`);
    if (
      [
        "--force",
        "--dry-run",
        "--uninstall",
        "--no-prompt",
        "--portable",
      ].includes(flag)
    ) {
      values.set(flag.slice(2), true);
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

function instructionScopeValue(
  values: Map<string, string | true>,
): InstructionScope {
  const scope = value(values, "instructions") ?? "local";
  if (scope === "local" || scope === "global" || scope === "both") return scope;
  throw new Error(
    `Invalid value for --instructions: ${scope}. Expected local, global, or both.`,
  );
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
function read(filename: string): string | null {
  return existsSync(filename) ? readFileSync(filename, "utf8") : null;
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
  void runCli();
}

async function runCli(): Promise<void> {
  try {
    const args = await cliArgs(process.argv.slice(2));
    const result = initializeAgentMemory(args, process.env, process.cwd());
    const dryRunNotice = result.dryRun
      ? "[dry-run] No se modificará ningún archivo; sólo se mostrarán los cambios previstos.\n"
      : "";
    const summary = formatChangeSummary(result, process.cwd());
    if (process.stdout.isTTY) {
      if (dryRunNotice) process.stderr.write(dryRunNotice);
      process.stdout.write(summary);
    } else {
      process.stderr.write(`${dryRunNotice}${summary}`);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `ytk-memory setup: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

function formatChangeSummary(
  result: InitializationResult,
  workingDirectory: string,
): string {
  const title = result.dryRun
    ? "[dry-run] Cambios previstos:"
    : result.uninstall
      ? "[ytk-memory] Cambios aplicados (desinstalación):"
      : "[ytk-memory] Cambios aplicados:";
  if (result.changes.length === 0)
    return `${title}\n  No hay archivos para modificar.\n`;
  const lines = result.changes.map(
    ({ file, action }) =>
      `  ${actionLabel(action).padEnd(10)} ${displayPath(file, workingDirectory)}`,
  );
  return `${title}\n${lines.join("\n")}\n`;
}

function actionLabel(action: "create" | "update" | "remove"): string {
  if (action === "create") return "crear";
  if (action === "update") return "actualizar";
  return "eliminar";
}

function displayPath(file: string, workingDirectory: string): string {
  const relativePath = relative(workingDirectory, file);
  return relativePath && !relativePath.startsWith("..") ? relativePath : file;
}

async function cliArgs(args: readonly string[]): Promise<readonly string[]> {
  if (
    valueFromArgs(args, "--agent") !== "codex" ||
    hasArgument(args, "--instructions") ||
    hasArgument(args, "--no-prompt") ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY
  )
    return args;
  const scope = await promptInstructionScope();
  return [...args, "--instructions", scope];
}

async function promptInstructionScope(): Promise<InstructionScope> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (
      await readline.question(
        "Add Codex instructions to [l]ocal repository, [g]lobal user profile, or [b]oth? (local): ",
      )
    )
      .trim()
      .toLowerCase();
    if (answer === "" || answer === "l" || answer === "local") return "local";
    if (answer === "g" || answer === "global") return "global";
    if (answer === "b" || answer === "both") return "both";
    throw new Error("Expected local, global, or both.");
  } finally {
    readline.close();
  }
}

function valueFromArgs(
  args: readonly string[],
  flag: string,
): string | undefined {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function hasArgument(args: readonly string[], flag: string): boolean {
  return args.includes(flag);
}
