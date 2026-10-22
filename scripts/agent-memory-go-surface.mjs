/* global process */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = resolve(".");
const moduleDirectory = join(root, "native", "ytk-memory");
const temporary = mkdtempSync(join(tmpdir(), "ytk-memory-go-surface-"));
const executable = join(
  temporary,
  process.platform === "win32" ? "ytk-memory.exe" : "ytk-memory",
);
const database = join(temporary, "memory.sqlite");
const backup = join(temporary, "memory.backup.sqlite");
const upgradeBackup = join(temporary, "memory.upgrade.sqlite");
const currentBackup = join(temporary, "memory.current.sqlite");

try {
  run(
    goCommand(),
    ["build", "-o", executable, "./cmd/ytk-memory"],
    moduleDirectory,
    {
      ...process.env,
      GOCACHE: join(tmpdir(), "ytk-memory-go-build-cache"),
    },
  );
  const first = await connect("surface-a");
  try {
    const tools = (await first.client.listTools()).tools
      .map((tool) => tool.name)
      .sort();
    assert.deepEqual(tools, [
      "memory_get",
      "memory_save",
      "memory_search",
      "memory_session_finish",
      "memory_session_start",
    ]);
    const started = output(
      await first.client.callTool({
        name: "memory_session_start",
        arguments: {},
      }),
    );
    const saved = output(
      await first.client.callTool({
        name: "memory_save",
        arguments: {
          type: "decision",
          topicKey: "surface/conformance",
          title: "Surface contract",
          content: "The Go MCP surface is stable.",
          sessionId: started.sessionId,
        },
      }),
    );
    const searched = output(
      await first.client.callTool({
        name: "memory_search",
        arguments: { query: "surface", limit: 5 },
      }),
    );
    const fetched = output(
      await first.client.callTool({
        name: "memory_get",
        arguments: { memoryId: saved.entryId },
      }),
    );
    const finished = output(
      await first.client.callTool({
        name: "memory_session_finish",
        arguments: {
          sessionId: started.sessionId,
          summary: "Surface checked.",
        },
      }),
    );
    assert.equal(searched.entries.length, 1);
    assert.equal(fetched.entry.id, saved.entryId);
    assert.equal(finished.summaryStored, true);

    const second = await connect("surface-b");
    try {
      const isolated = await second.client.callTool({
        name: "memory_get",
        arguments: { memoryId: saved.entryId },
      });
      assert.equal(isolated.isError, true);
    } finally {
      await second.client.close();
      await second.transport.close();
    }

    await first.client.close();
    await first.transport.close();

    const status = (operation, args = []) =>
      cli(operation, [
        "--project",
        "surface-a",
        "--database",
        database,
        ...args,
      ]);
    assert.equal(status("doctor").healthy, true);
    const backupResult = status("backup", ["--to", backup]);
    assert.equal(backupResult.operation, "backup");
    assert.ok(backupResult.totalPages > 0);
    assert.equal(backupResult.remainingPages, 0);
    const upgradeResult = status("upgrade", ["--backup-to", upgradeBackup]);
    assert.equal(upgradeResult.schema, "current");
    assert.ok(upgradeResult.backup.totalPages > 0);
    assert.throws(
      () =>
        cli("rollback", [
          "--project",
          "surface-a",
          "--database",
          database,
          "--from",
          backup,
          "--backup-current-to",
          currentBackup,
        ]),
      /Rollback requires --confirm/,
    );
    assert.equal(
      status("rollback", [
        "--from",
        backup,
        "--backup-current-to",
        currentBackup,
        "--confirm",
      ]).operation,
      "rollback",
    );
    assert.equal(status("doctor").healthy, true);
    process.stdout.write(
      `${JSON.stringify({ tools, projectIsolation: true, doctor: true, backup: true, upgrade: true, rollback: true, status: "passed" }, null, 2)}\n`,
    );
  } finally {
    await first.client.close();
    await first.transport.close();
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

async function connect(project) {
  const client = new Client({
    name: "ytk-memory-go-surface-test",
    version: "0.1.0",
  });
  const transport = new StdioClientTransport({
    command: executable,
    args: ["mcp", "--project", project, "--database", database],
  });
  await client.connect(transport);
  return { client, transport };
}

function output(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result));
  if (result.structuredContent) return result.structuredContent;
  const content = result.content.find((item) => item.type === "text");
  return JSON.parse(content.text);
}

function cli(operation, args) {
  const result = spawnSync(executable, [operation, ...args, "--json"], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return JSON.parse(result.stdout);
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function goCommand() {
  if (process.env.GO) return process.env.GO;
  const windowsGo = "C:\\Program Files\\Go\\bin\\go.exe";
  return process.platform === "win32" && existsSync(windowsGo)
    ? windowsGo
    : "go";
}
