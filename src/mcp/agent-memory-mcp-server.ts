import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";

import {
  AgentMemoryProtocol,
  type AgentMemoryContext,
  type AgentMemoryProvider,
} from "../adapters/index.js";

export interface AgentMemoryMcpServerOptions {
  name?: string;
  version?: string;
  defaultLimit?: number;
  defaultMaxChars?: number;
}

const memoryType = z.enum([
  "decision",
  "discovery",
  "pattern",
  "preference",
  "summary",
]);

const searchFields = {
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(100).optional(),
  maxChars: z.number().int().min(100).max(20_000).optional(),
};

/** Creates an MCP server scoped to exactly one project context. */
export function createAgentMemoryMcpServer(
  provider: AgentMemoryProvider,
  context: AgentMemoryContext,
  options: AgentMemoryMcpServerOptions = {},
): McpServer {
  const scopedContext = Object.freeze({ ...context });
  const protocol = new AgentMemoryProtocol(provider, {
    ...(options.defaultLimit ? { defaultLimit: options.defaultLimit } : {}),
    ...(options.defaultMaxChars
      ? { defaultMaxChars: options.defaultMaxChars }
      : {}),
  });
  const server = new McpServer({
    name: options.name ?? "ytk-memory",
    version: options.version ?? "0.1.0",
  });

  server.registerTool(
    "memory_session_start",
    {
      title: "Start memory session",
      description:
        "Start a project-scoped work session and optionally recall relevant memory.",
      inputSchema: z.object({
        query: searchFields.query.optional(),
        limit: searchFields.limit,
        maxChars: searchFields.maxChars,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (input) =>
      runTool(() =>
        protocol.bootstrap(scopedContext, {
          ...(input.query ? { query: input.query } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
          ...(input.maxChars ? { maxChars: input.maxChars } : {}),
        }),
      ),
  );

  server.registerTool(
    "memory_search",
    {
      title: "Search memory",
      description: "Search reusable memory within the configured project.",
      inputSchema: z.object(searchFields),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) =>
      runTool(() =>
        provider.search(
          {
            query: input.query,
            ...(input.limit ? { limit: input.limit } : {}),
            ...(input.maxChars ? { maxChars: input.maxChars } : {}),
          },
          scopedContext,
        ),
      ),
  );

  server.registerTool(
    "memory_get",
    {
      title: "Get memory",
      description: "Read one memory by id from the configured project.",
      inputSchema: z.object({
        memoryId: z.string().trim().min(1).max(200),
        maxChars: z.number().int().min(100).max(20_000).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) =>
      runTool(async () => {
        const entry = await provider.get(
          input.memoryId,
          scopedContext,
          input.maxChars,
        );
        if (!entry) throw new Error("Memory was not found in this project.");
        return { entry };
      }),
  );

  server.registerTool(
    "memory_save",
    {
      title: "Save memory",
      description:
        "Create or update durable project memory. A topicKey makes writes idempotent.",
      inputSchema: z.object({
        type: memoryType,
        title: z.string().trim().min(1).max(500),
        content: z.string().trim().min(1).max(50_000),
        topicKey: z.string().trim().min(1).max(500).optional(),
        tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
        source: z.string().trim().min(1).max(200).optional(),
        sessionId: z.string().trim().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (input) =>
      runTool(() =>
        provider.save(
          {
            type: input.type,
            title: input.title,
            content: input.content,
            ...(input.topicKey ? { topicKey: input.topicKey } : {}),
            ...(input.tags ? { tags: input.tags } : {}),
            ...(input.source ? { source: input.source } : {}),
            ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            ...(scopedContext.area ? { area: scopedContext.area } : {}),
          },
          scopedContext,
        ),
      ),
  );

  server.registerTool(
    "memory_session_finish",
    {
      title: "Finish memory session",
      description:
        "Finish a project-scoped session and optionally persist its durable summary.",
      inputSchema: z.object({
        sessionId: z.string().trim().min(1).max(200),
        summary: z.string().trim().min(1).max(50_000).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (input) =>
      runTool(() =>
        protocol.finish(scopedContext, {
          sessionId: input.sessionId,
          ...(input.summary ? { summary: input.summary } : {}),
        }),
      ),
  );

  return server;
}

async function runTool(action: () => Promise<unknown>) {
  try {
    const result = await action();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Memory operation failed.";
    return {
      isError: true,
      content: [{ type: "text" as const, text: message }],
    };
  }
}
