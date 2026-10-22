#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

import { SqliteAgentMemoryRepository } from "./infrastructure/sqlite/index.js";
import { resolveProjectMemoryConfig } from "./mcp/project-resolver.js";

type Operation = "doctor" | "backup" | "upgrade" | "rollback";

/** Operational CLI. Rollback is intentionally explicit and always backs up the current database first. */
export async function runAgentMemoryAdmin(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  workingDirectory: string,
): Promise<Record<string, unknown>> {
  const [operation = "doctor", ...rest] = args;
  if (!isOperation(operation))
    throw new Error(`Unknown operation: ${operation}`);
  const values = parseOptions(rest);
  const requestedProject = option(values, "project");
  const requestedDatabase = option(values, "database");
  const config = resolveProjectMemoryConfig({
    ...(requestedProject ? { projectId: requestedProject } : {}),
    ...(requestedDatabase ? { database: requestedDatabase } : {}),
    environment,
    workingDirectory,
  });
  const database = config.databaseFile;
  if (operation === "doctor") return doctor(config.projectId, database);
  if (!existsSync(database))
    throw new Error(`Database does not exist: ${database}`);
  if (operation === "rollback")
    return rollback(
      database,
      required(values, "from"),
      required(values, "backup-current-to"),
      values.has("confirm"),
    );
  mkdirSync(dirname(database), { recursive: true });
  if (operation === "upgrade") {
    const backupTo = required(values, "backup-to");
    const backup = await backupBeforeMigration(
      database,
      backupTo,
      values.has("overwrite"),
    );
    const repository = new SqliteAgentMemoryRepository(database);
    try {
      return {
        operation,
        projectId: config.projectId,
        database,
        backup,
        schema: "current",
      };
    } finally {
      repository.close();
    }
  }
  const repository = new SqliteAgentMemoryRepository(database);
  try {
    if (operation === "backup")
      return {
        operation,
        projectId: config.projectId,
        ...(await repository.backup(required(values, "to"), {
          overwrite: values.has("overwrite"),
        })),
      };
  } finally {
    repository.close();
  }
  throw new Error(`Unsupported operation: ${operation}`);
}

function doctor(projectId: string, database: string): Record<string, unknown> {
  if (!existsSync(database))
    return {
      operation: "doctor",
      healthy: false,
      projectId,
      database,
      checks: [
        {
          name: "database",
          status: "missing",
          message: "Run the MCP server once or restore a backup.",
        },
      ],
    };
  const repository = new SqliteAgentMemoryRepository(database);
  try {
    return {
      operation: "doctor",
      healthy: true,
      projectId,
      database,
      lifecycle: repository.inspectLifecycle(new Date()),
      node: process.version,
    };
  } finally {
    repository.close();
  }
}

async function rollback(
  database: string,
  source: string,
  backupCurrent: string,
  confirmed: boolean,
): Promise<Record<string, unknown>> {
  if (!confirmed) throw new Error("Rollback requires --confirm.");
  const backup = resolve(source);
  const destination = resolve(database);
  const currentBackup = resolve(backupCurrent);
  if (!existsSync(backup))
    throw new Error(`Rollback source does not exist: ${backup}`);
  if (
    backup === destination ||
    currentBackup === destination ||
    currentBackup === backup
  )
    throw new Error("Rollback paths must be distinct.");
  const repository = new SqliteAgentMemoryRepository(destination);
  try {
    await repository.backup(currentBackup);
  } finally {
    repository.close();
  }
  const temporary = `${destination}.rollback.tmp`;
  if (existsSync(temporary))
    throw new Error(`Temporary rollback file already exists: ${temporary}`);
  copyFileSync(backup, temporary);
  rmSync(destination);
  rmSync(`${destination}-wal`, { force: true });
  rmSync(`${destination}-shm`, { force: true });
  renameSync(temporary, destination);
  return {
    operation: "rollback",
    database: destination,
    restoredFrom: backup,
    backupCurrentTo: currentBackup,
  };
}

async function backupBeforeMigration(
  database: string,
  destination: string,
  overwrite: boolean,
): Promise<Record<string, unknown>> {
  const target = resolve(destination);
  if (existsSync(target) && !overwrite)
    throw new Error("Backup destination already exists; pass --overwrite.");
  if (target === resolve(database))
    throw new Error("Backup destination must differ from the database.");
  mkdirSync(dirname(target), { recursive: true });
  const source = new Database(database, { readonly: true });
  try {
    const result = await source.backup(target);
    return { destinationFile: target, ...result };
  } finally {
    source.close();
  }
}

function parseOptions(args: readonly string[]): Map<string, string | true> {
  const values = new Map<string, string | true>();
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (!flag?.startsWith("--"))
      throw new Error(`Unknown argument: ${flag ?? ""}`);
    const name = flag.slice(2);
    if (
      ![
        "project",
        "database",
        "to",
        "backup-to",
        "from",
        "backup-current-to",
        "confirm",
        "overwrite",
        "json",
      ].includes(name)
    )
      throw new Error(`Unknown argument: ${flag}`);
    if (name === "confirm" || name === "overwrite" || name === "json") {
      values.set(name, true);
      continue;
    }
    const value = args[i + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${flag}.`);
    values.set(name, value);
    i += 1;
  }
  return values;
}
function option(
  values: Map<string, string | true>,
  name: string,
): string | undefined {
  const value = values.get(name);
  return typeof value === "string" ? value : undefined;
}
function required(values: Map<string, string | true>, name: string): string {
  const value = option(values, name)?.trim();
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}
function isOperation(value: string): value is Operation {
  return (
    value === "doctor" ||
    value === "backup" ||
    value === "upgrade" ||
    value === "rollback"
  );
}

if (process.argv[1]?.endsWith("agent-memory-admin.js"))
  runAgentMemoryAdmin(process.argv.slice(2), process.env, process.cwd())
    .then((result) => {
      const json = process.argv.includes("--json");
      const output =
        result.operation === "doctor" && !json
          ? formatDoctor(result)
          : JSON.stringify(result, null, json ? 2 : undefined);
      process.stdout.write(`${output}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `agent-memory admin: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });

function formatDoctor(result: Record<string, unknown>): string {
  const healthy = result.healthy === true;
  const lines = [
    `Agent Memory · ${healthy ? "Todo en orden" : "Revisar configuración"}`,
    `Proyecto: ${String(result.projectId ?? "desconocido")}`,
    `Base de datos: ${String(result.database ?? "desconocida")}`,
  ];
  if (typeof result.node === "string") lines.push(`Node.js: ${result.node}`);
  const checks = Array.isArray(result.checks) ? result.checks : [];
  if (checks.length === 0 && healthy)
    lines.push(
      "",
      "Verificaciones:",
      "  ✓ Base de datos: SQLite y su esquema se pueden leer.",
    );
  if (checks.length > 0) {
    lines.push("", "Verificaciones:");
    for (const raw of checks) {
      if (!raw || typeof raw !== "object") continue;
      const check = raw as Record<string, unknown>;
      const status = String(check.status ?? "unknown");
      const icon =
        status === "ok"
          ? "✓"
          : status === "missing" || status === "invalid"
            ? "✗"
            : "·";
      lines.push(
        `  ${icon} ${String(check.name ?? "verificación")}: ${String(check.message ?? status)}`,
      );
    }
  }
  const lifecycle = result.lifecycle;
  if (lifecycle && typeof lifecycle === "object") {
    const value = lifecycle as Record<string, unknown>;
    const byStatus =
      value.byStatus && typeof value.byStatus === "object"
        ? (value.byStatus as Record<string, unknown>)
        : {};
    lines.push("", "Memorias:");
    lines.push(
      `  Total: ${String(value.total ?? 0)} · Activas: ${String(byStatus.active ?? 0)} · Para revisar: ${String(byStatus.needs_review ?? 0)} · Archivadas: ${String(byStatus.archived ?? 0)}`,
    );
    lines.push(
      `  Futuras: ${String(value.future ?? 0)} · Vencidas: ${String(value.expired ?? 0)} · Revisión pendiente: ${String(value.dueForReview ?? 0)}`,
    );
  }
  return lines.join("\n");
}
