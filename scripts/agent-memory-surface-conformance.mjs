/* global process */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { runAgentMemoryAdmin } from "../dist/agent-memory-admin.js";
import { initializeAgentMemory } from "../dist/agent-memory-init.js";
import { MemoryService, SqliteAgentMemoryRepository } from "../dist/memory.js";

const fixture = JSON.parse(
  readFileSync("test/fixtures/agent-memory-surface-conformance.json", "utf8"),
);
const root = mkdtempSync(join(tmpdir(), "agent-memory-surface-"));

try {
  const mcp = await runMcpConformance(fixture.mcp);
  const maintenance = await runMaintenanceConformance(
    fixture.maintenance,
    root,
  );
  const installer = runInstallerConformance(fixture.installer, root);
  process.stdout.write(
    `${JSON.stringify({ version: fixture.version, mcp, maintenance, installer }, null, 2)}\n`,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

async function runMcpConformance(expected) {
  const database = join(root, "mcp.sqlite");
  const executable = resolve("dist/mcp-server.js");
  const first = await connect("surface-a", database, executable);
  try {
    const tools = (await first.client.listTools()).tools
      .map((tool) => tool.name)
      .sort();
    assert.deepEqual(tools, [...expected.tools].sort());
    const started = output(
      await first.client.callTool({
        name: "memory_session_start",
        arguments: { query: "surface" },
      }),
    );
    const saved = output(
      await first.client.callTool({
        name: "memory_save",
        arguments: {
          type: "decision",
          topicKey: "surface/conformance",
          title: "Surface contract",
          content: "The MCP surface is stable.",
          sessionId: started.sessionId,
        },
      }),
    );
    const searched = output(
      await first.client.callTool({
        name: "memory_search",
        arguments: { query: "surface", limit: 5, maxChars: 1_000 },
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

    const second = await connect("surface-b", database, executable);
    try {
      const isolated = await second.client.callTool({
        name: "memory_get",
        arguments: { memoryId: saved.entryId },
      });
      assert.equal(isolated.isError, true);
      assert.equal(expected.projectIsolation, true);
    } finally {
      await second.client.close();
    }
    return { tools, projectIsolation: true, status: "passed" };
  } finally {
    await first.client.close();
  }
}

async function runMaintenanceConformance(expected, directory) {
  const database = join(directory, "maintenance.sqlite");
  const backup = join(directory, "maintenance.backup.sqlite");
  const upgradeBackup = join(directory, "maintenance.upgrade.sqlite");
  const currentBackup = join(directory, "maintenance.current.sqlite");
  const repository = new SqliteAgentMemoryRepository(database);
  const service = new MemoryService(repository);
  const memory = service.save({
    workspaceId: "surface-maintenance",
    type: "decision",
    title: "Maintenance contract",
    content: "Backup and rollback are explicit operations.",
  });
  repository.close();

  const doctor = await runAgentMemoryAdmin(
    ["doctor", "--project", "surface-maintenance", "--database", database],
    {},
    directory,
  );
  assert.equal(doctor.healthy, expected.doctorHealthy);
  const backedUp = await runAgentMemoryAdmin(
    [
      "backup",
      "--project",
      "surface-maintenance",
      "--database",
      database,
      "--to",
      backup,
    ],
    {},
    directory,
  );
  assert.equal(existsSync(backedUp.destinationFile), true);
  const upgraded = await runAgentMemoryAdmin(
    [
      "upgrade",
      "--project",
      "surface-maintenance",
      "--database",
      database,
      "--backup-to",
      upgradeBackup,
    ],
    {},
    directory,
  );
  assert.equal(upgraded.schema, expected.upgradeSchema);
  await assert.rejects(
    () =>
      runAgentMemoryAdmin(
        [
          "rollback",
          "--project",
          "surface-maintenance",
          "--database",
          database,
          "--from",
          backup,
          "--backup-current-to",
          currentBackup,
        ],
        {},
        directory,
      ),
    new Error("Rollback requires --confirm."),
  );
  const rolledBack = await runAgentMemoryAdmin(
    [
      "rollback",
      "--project",
      "surface-maintenance",
      "--database",
      database,
      "--from",
      backup,
      "--backup-current-to",
      currentBackup,
      "--confirm",
    ],
    {},
    directory,
  );
  assert.equal(existsSync(rolledBack.restoredFrom), true);
  const restored = new SqliteAgentMemoryRepository(database);
  assert.equal(restored.findById(memory.id)?.title, "Maintenance contract");
  restored.close();
  return {
    doctorHealthy: doctor.healthy,
    schema: upgraded.schema,
    rollback: "passed",
  };
}

function runInstallerConformance(expected, directory) {
  const project = join(directory, "consumer");
  const result = initializeAgentMemory(
    ["--agent", expected.agent, "--project", "surface-consumer", "--dry-run"],
    {},
    project,
  );
  assert.equal(result.instructionScope, expected.instructionScope);
  assert.equal(result.dryRun, true);
  assert.equal(existsSync(join(project, ".ytk-memory.json")), false);
  initializeAgentMemory(
    ["--agent", expected.agent, "--project", "surface-consumer"],
    {},
    project,
  );
  const files = [
    ".ytk-memory.json",
    ".codex/config.toml",
    ".ytk-memory/YTK-MEMORY.md",
  ];
  for (const file of expected.managedFiles)
    assert.equal(files.includes(file), true);
  assert.equal(existsSync(join(project, ".ytk-memory.json")), true);
  assert.match(
    readFileSync(join(project, ".codex/config.toml"), "utf8"),
    /ytk_memory/,
  );
  initializeAgentMemory(
    ["--agent", expected.agent, "--uninstall"],
    {},
    project,
  );
  assert.equal(existsSync(join(project, ".ytk-memory.json")), true);
  return {
    agent: expected.agent,
    instructionScope: result.instructionScope,
    status: "passed",
  };
}

async function connect(projectId, database, executable) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable, "--database", database, "--project", projectId],
    stderr: "pipe",
  });
  const client = new Client({
    name: "agent-memory-surface-conformance",
    version: "0.1.0",
  });
  await client.connect(transport);
  return { client, transport };
}

function output(result) {
  if (result.isError || !result.structuredContent)
    throw new Error(JSON.stringify(result.content));
  return result.structuredContent;
}
