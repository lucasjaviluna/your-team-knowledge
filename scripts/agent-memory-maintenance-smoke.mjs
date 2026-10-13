/* global console, process */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoryService, SqliteAgentMemoryRepository } from "../dist/memory.js";

const directory = mkdtempSync(join(tmpdir(), "agent-memory-maintenance-"));
const database = join(directory, "agent-memory.sqlite");
const backup = join(directory, "agent-memory.backup.sqlite");
const executionBackup = join(directory, "agent-memory.execution.backup.sqlite");
const project = "maintenance-smoke";
const purgeBefore = "2099-01-01T00:00:00.000Z";

try {
  const repository = new SqliteAgentMemoryRepository(database);
  const service = new MemoryService(repository);
  const memory = service.save({
    workspaceId: project,
    type: "decision",
    title: "Maintenance smoke",
    content: "This memory exercises the maintenance flow.",
    validFrom: new Date("2026-10-01T00:00:00.000Z"),
    expiresAt: new Date("2026-10-02T00:00:00.000Z"),
  });
  repository.close();

  const preview = runDemo({
    database,
    backup,
    project,
    purgeBefore,
  });
  assert.equal(preview.retention.dryRun, true);
  assert.deepEqual(preview.retention.expiredCandidateIds, [memory.id]);
  assert.deepEqual(preview.retention.purgeCandidateIds, [memory.id]);

  const executed = runDemo({
    database,
    backup: executionBackup,
    project,
    purgeBefore,
    dryRun: false,
  });
  assert.equal(executed.retention.dryRun, false);
  assert.equal(executed.retention.archivedCount, 1);
  assert.equal(executed.retention.purgedCount, 1);

  const restored = new SqliteAgentMemoryRepository(backup);
  assert.equal(restored.findById(memory.id)?.status, "active");
  restored.close();

  const current = new SqliteAgentMemoryRepository(database);
  assert.equal(current.findById(memory.id), undefined);
  current.close();
  console.log("Agent Memory maintenance smoke passed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

function runDemo({ database, backup, project, purgeBefore, dryRun = true }) {
  const args = [
    "scripts/agent-memory-demo.mjs",
    "--database",
    database,
    "--backup-to",
    backup,
    "--project",
    project,
    "--query",
    "maintenance smoke",
    "--retention-purge-before",
    purgeBefore,
    "--retention-dry-run",
    String(dryRun),
  ];
  const output = execFileSync(process.execPath, args, {
    encoding: "utf8",
  });
  return JSON.parse(output);
}
