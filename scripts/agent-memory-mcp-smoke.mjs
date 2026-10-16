/* global console, process */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const directory = mkdtempSync(join(tmpdir(), "agent-memory-mcp-"));
const database = join(directory, "memory.sqlite");
const executable = resolve("dist/mcp-server.js");

try {
  const first = await connect("project-a");
  const tools = await first.client.listTools();
  const expectedTools = [
    "memory_get",
    "memory_save",
    "memory_search",
    "memory_session_finish",
    "memory_session_start",
  ];
  assertEqual(
    tools.tools.map((tool) => tool.name).sort(),
    expectedTools,
    "tool contract",
  );

  const started = output(
    await first.client.callTool({
      name: "memory_session_start",
      arguments: { query: "authentication" },
    }),
  );
  const saved = output(
    await first.client.callTool({
      name: "memory_save",
      arguments: {
        type: "decision",
        topicKey: "architecture/auth",
        title: "Authentication model",
        content: "Use short-lived bearer tokens.",
        sessionId: started.sessionId,
      },
    }),
  );
  const search = output(
    await first.client.callTool({
      name: "memory_search",
      arguments: { query: "authentication", limit: 5, maxChars: 1_000 },
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
        summary: "Authentication decision completed.",
      },
    }),
  );
  if (search.entries?.length !== 1)
    throw new Error("search did not return the saved memory");
  if (fetched.entry?.id !== saved.entryId)
    throw new Error("get returned a different memory");
  if (finished.summaryStored !== true)
    throw new Error("session summary was not stored");
  await first.client.close();

  const second = await connect("project-b");
  const isolated = await second.client.callTool({
    name: "memory_get",
    arguments: { memoryId: saved.entryId },
  });
  if (isolated.isError !== true)
    throw new Error("cross-project read was not rejected");
  await second.client.close();

  console.log(JSON.stringify({ mcpSmoke: "passed", tools: expectedTools }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}

async function connect(projectId) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable, "--database", database, "--project", projectId],
    stderr: "pipe",
  });
  const client = new Client({ name: "agent-memory-smoke", version: "0.1.0" });
  await client.connect(transport);
  return { client, transport };
}

function output(result) {
  if (result.isError) throw new Error(JSON.stringify(result.content));
  if (
    !result.structuredContent ||
    typeof result.structuredContent !== "object"
  ) {
    throw new Error("tool did not return structuredContent");
  }
  return result.structuredContent;
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
}
