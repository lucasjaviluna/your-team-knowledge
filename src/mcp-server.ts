#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { SqliteAgentMemoryProvider } from "./adapters/index.js";
import { MemoryService } from "./application/index.js";
import { SqliteAgentMemoryRepository } from "./infrastructure/index.js";
import { createAgentMemoryMcpServer } from "./mcp/index.js";
import { resolveProjectMemoryConfig } from "./mcp/project-resolver.js";

interface ServerConfig {
  databaseFile: string;
  projectId: string;
  area?: string;
}

export function parseAgentMemoryMcpConfig(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  workingDirectory: string,
): ServerConfig {
  const values = new Map<string, string>();
  const allowedFlags = new Set(["--project", "--database", "--area"]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag || !allowedFlags.has(flag)) {
      throw new Error(`Unknown argument: ${flag ?? ""}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}.`);
    }
    values.set(flag, value);
    index += 1;
  }

  return resolveProjectMemoryConfig({
    ...(values.has("--project") ? { projectId: values.get("--project")! } : {}),
    ...(values.has("--database")
      ? { database: values.get("--database")! }
      : {}),
    ...(values.has("--area") ? { area: values.get("--area")! } : {}),
    environment,
    workingDirectory,
  });
}

async function main(): Promise<void> {
  const config = parseAgentMemoryMcpConfig(
    process.argv.slice(2),
    process.env,
    process.cwd(),
  );
  mkdirSync(dirname(config.databaseFile), { recursive: true });
  const repository = new SqliteAgentMemoryRepository(config.databaseFile);
  const provider = new SqliteAgentMemoryProvider(new MemoryService(repository));
  const context = {
    projectId: config.projectId,
    sessionOwnerId: randomUUID(),
    ...(config.area ? { area: config.area } : {}),
  };
  const handle = serveStdio(() =>
    createAgentMemoryMcpServer(provider, context),
  );
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await handle.close();
    repository.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  process.stdin.once("end", () => void close());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ytk-memory MCP server: ${message}\n`);
  process.exitCode = 1;
});
