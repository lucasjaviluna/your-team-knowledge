/* global console, process */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { MemoryService, SqliteAgentMemoryRepository } from "../dist/memory.js";

const directory = mkdtempSync(join(tmpdir(), "agent-memory-e2e-"));
const database = join(directory, "agent-memory.sqlite");
const executable = resolve("dist/mcp-server.js");
const project = "two-agent-e2e";

try {
  const agentA = await connect("codex-like-agent");
  const firstSession = output(
    await agentA.client.callTool({
      name: "memory_session_start",
      arguments: { query: "authentication boundary" },
    }),
  );
  const first = output(
    await agentA.client.callTool({
      name: "memory_save",
      arguments: {
        type: "decision",
        topicKey: "security/auth-boundary",
        title: "Authentication boundary",
        content: "Validate short-lived bearer tokens at the HTTP boundary.",
        sessionId: firstSession.sessionId,
      },
    }),
  );
  const updated = output(
    await agentA.client.callTool({
      name: "memory_save",
      arguments: {
        type: "decision",
        topicKey: "security/auth-boundary",
        title: "Authentication boundary",
        content:
          "Validate short-lived bearer tokens at the HTTP boundary and audit failures.",
        sessionId: firstSession.sessionId,
      },
    }),
  );
  assert.equal(updated.entryId, first.entryId, "topicKey must be idempotent");
  output(
    await agentA.client.callTool({
      name: "memory_session_finish",
      arguments: {
        sessionId: firstSession.sessionId,
        summary: "Auth boundary decided.",
      },
    }),
  );
  await close(agentA);

  const agentB = await connect("claude-like-agent");
  const secondSession = output(
    await agentB.client.callTool({
      name: "memory_session_start",
      arguments: { query: "authentication boundary" },
    }),
  );
  const recalledDecision = secondSession.entries.find((entry) =>
    /audit failures/.test(entry.content),
  );
  assert.ok(recalledDecision, "second agent recalls first agent memory");
  const rejected = await agentB.client.callTool({
    name: "memory_save",
    arguments: {
      type: "discovery",
      title: "Session takeover",
      content: "This must not be stored.",
      sessionId: firstSession.sessionId,
    },
  });
  assert.equal(
    rejected.isError,
    true,
    "session ownership must reject takeover",
  );
  const finding = output(
    await agentB.client.callTool({
      name: "memory_save",
      arguments: {
        type: "discovery",
        topicKey: "security/auth-audit",
        title: "Authentication audit",
        content: "Audit token validation failures with a request identifier.",
        sessionId: secondSession.sessionId,
      },
    }),
  );
  output(
    await agentB.client.callTool({
      name: "memory_session_finish",
      arguments: {
        sessionId: secondSession.sessionId,
        summary: "Audit follow-up recorded.",
      },
    }),
  );
  await close(agentB);

  const repository = new SqliteAgentMemoryRepository(database);
  const compacted = new MemoryService(repository).compact({
    workspaceId: project,
    memoryIds: [first.entryId, finding.entryId],
    title: "Authentication continuity",
    archiveSources: true,
  });
  repository.close();

  const resumed = await connect("codex-like-agent-resumed");
  const resumedSession = output(
    await resumed.client.callTool({
      name: "memory_session_start",
      arguments: { query: "authentication audit" },
    }),
  );
  assert.equal(
    resumedSession.entries.length,
    1,
    "compacted summary is recalled",
  );
  assert.equal(resumedSession.entries[0].id, compacted.summary.id);
  output(
    await resumed.client.callTool({
      name: "memory_session_finish",
      arguments: { sessionId: resumedSession.sessionId },
    }),
  );
  await close(resumed);
  console.log(
    JSON.stringify({
      e2e: "passed",
      agents: ["codex-like", "claude-like"],
      compactedSummaryId: compacted.summary.id,
    }),
  );
} finally {
  try {
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  } catch {
    // The Windows stdio child may release SQLite just after its transport closes.
    console.warn(`Temporary E2E directory pending OS cleanup: ${directory}`);
  }
}

async function connect(name) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable, "--database", database, "--project", project],
    stderr: "pipe",
  });
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function close(connection) {
  await connection.client.close();
  await connection.transport.close();
}

function output(result) {
  if (result.isError) throw new Error(JSON.stringify(result.content));
  if (!result.structuredContent || typeof result.structuredContent !== "object")
    throw new Error("MCP tool did not return structuredContent");
  return result.structuredContent;
}
