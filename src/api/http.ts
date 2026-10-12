import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";

import type {
  AuditEvent,
  AuditSink,
  KnowledgeIngestionService,
  KnowledgeQueryService,
  ContextProvider,
} from "../application/index.js";
import type { KnowledgeSource } from "../domain/index.js";
import type { MarkdownIngestionInput } from "../application/index.js";
import type {
  ApiPrincipal,
  KnowledgeHttpAction,
  KnowledgeHttpSecurity,
} from "./security.js";

export interface KnowledgeHttpServices {
  ingestion: KnowledgeIngestionService;
  query: KnowledgeQueryService;
  context?: ContextProvider;
}

export interface KnowledgeHttpOptions {
  security: KnowledgeHttpSecurity;
  audit: AuditSink;
  readiness?: () => Promise<Readonly<Record<string, unknown>>>;
}

export function createKnowledgeHttpServer(
  services: KnowledgeHttpServices,
  options: KnowledgeHttpOptions,
): Server {
  return createServer((request, response) => {
    void handleKnowledgeHttpRequest(request, response, services, options);
  });
}

async function handleKnowledgeHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  services: KnowledgeHttpServices,
  options: KnowledgeHttpOptions,
): Promise<void> {
  const requestId = resolveRequestId(request);
  response.setHeader("x-request-id", requestId);
  let principal: ApiPrincipal | null = null;
  let action: KnowledgeHttpAction | undefined;
  let workspaceId: string | undefined;
  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && request.url === "/ready") {
      if (!options.readiness) {
        sendJson(response, 200, { status: "ready" });
        return;
      }
      try {
        const details = await options.readiness();
        sendJson(response, 200, { status: "ready", ...details });
      } catch {
        sendJson(response, 503, { status: "not_ready" });
      }
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    principal = await options.security.authenticate(request);
    if (!principal) {
      sendJson(response, 401, { error: "Authentication required." });
      return;
    }

    const body = await readJson(request);
    if (request.url === "/v1/knowledge/query") {
      action = "query";
      const queryInput = parseQueryInput(
        body as Record<string, unknown>,
        principal,
      );
      workspaceId = queryInput.workspaceId;
      await authorize(options, principal, action, workspaceId);
      const result = await services.query.search(queryInput);
      await recordAudit(options.audit, {
        action: "knowledge.query",
        outcome: "success",
        actorId: principal.actorId,
        workspaceId,
        requestId,
        metadata: { resultCount: result.results.length },
      });
      sendJson(response, 200, result);
      return;
    }

    if (request.url === "/v1/knowledge/documents") {
      action = "ingest";
      const input = parseIngestionInput(body as Record<string, unknown>);
      workspaceId = input.document.workspaceId;
      await authorize(options, principal, action, workspaceId);
      const result = await services.ingestion.ingestMarkdown(
        input.source,
        input.document,
      );
      await recordAudit(options.audit, {
        action: "knowledge.ingest",
        outcome: "success",
        actorId: principal.actorId,
        workspaceId,
        resourceType: "document",
        resourceId: result.document.id,
        requestId,
        metadata: { chunkCount: result.chunks.length },
      });
      sendJson(response, 201, {
        document: result.document,
        chunks: result.chunks.map(withoutEmbedding),
      });
      return;
    }

    if (request.url === "/v1/context") {
      action = "context";
      const contextInput = parseContextInput(
        body as Record<string, unknown>,
        principal,
      );
      workspaceId = contextInput.workspaceId;
      await authorize(options, principal, action, workspaceId);
      if (!services.context) {
        throw new Error("Context service unavailable.");
      }
      const result = await services.context.resolve(contextInput);
      await recordAudit(options.audit, {
        action: "context.resolve",
        outcome: "success",
        actorId: principal.actorId,
        workspaceId,
        requestId,
        metadata: {
          memoryCount: result.memories.length,
          citationCount: result.citations.length,
          estimatedTokens: result.estimatedTokens,
        },
      });
      sendJson(response, 200, result);
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error.";
    if (principal && action) {
      await recordAudit(options.audit, {
        action: auditAction(action),
        outcome: message === "Access denied." ? "denied" : "error",
        actorId: principal.actorId,
        ...(workspaceId ? { workspaceId } : {}),
        requestId,
        metadata: { error: message },
      });
    }
    const statusCode = message === "Access denied." ? 403 : 400;
    sendJson(response, statusCode, { error: message });
  }
}

function auditAction(action: KnowledgeHttpAction): AuditEvent["action"] {
  return action === "query"
    ? "knowledge.query"
    : action === "ingest"
      ? "knowledge.ingest"
      : "context.resolve";
}

function resolveRequestId(request: IncomingMessage): string {
  const header = request.headers["x-request-id"];
  const candidate = Array.isArray(header) ? header[0] : header;
  const normalized = candidate?.trim();
  return normalized && normalized.length <= 200 ? normalized : randomUUID();
}

function parseQueryInput(
  body: Record<string, unknown>,
  principal: ApiPrincipal,
) {
  return {
    workspaceId: requiredString(body.workspaceId, "workspaceId"),
    actorId: principal.actorId,
    teamIds: principal.teamIds,
    query: requiredString(body.query, "query"),
    ...(body.limit === undefined
      ? {}
      : { limit: positiveInteger(body.limit, "limit") }),
  };
}

function parseContextInput(
  body: Record<string, unknown>,
  principal: ApiPrincipal,
) {
  return {
    workspaceId: requiredString(body.workspaceId, "workspaceId"),
    actorId: principal.actorId,
    teamIds: principal.teamIds,
    query: requiredString(body.query, "query"),
    ...(body.intent === undefined
      ? {}
      : { intent: contextIntent(body.intent) }),
    ...(body.memoryLimit === undefined
      ? {}
      : { memoryLimit: positiveInteger(body.memoryLimit, "memoryLimit") }),
    ...(body.knowledgeLimit === undefined
      ? {}
      : {
          knowledgeLimit: positiveInteger(
            body.knowledgeLimit,
            "knowledgeLimit",
          ),
        }),
    ...(body.maxChars === undefined
      ? {}
      : { maxChars: positiveInteger(body.maxChars, "maxChars") }),
    ...(body.maxTokens === undefined
      ? {}
      : { maxTokens: positiveInteger(body.maxTokens, "maxTokens") }),
    ...(body.includeMemory === undefined
      ? {}
      : { includeMemory: booleanValue(body.includeMemory, "includeMemory") }),
    ...(body.includeKnowledge === undefined
      ? {}
      : {
          includeKnowledge: booleanValue(
            body.includeKnowledge,
            "includeKnowledge",
          ),
        }),
  };
}

async function authorize(
  options: KnowledgeHttpOptions,
  principal: ApiPrincipal,
  action: KnowledgeHttpAction,
  workspaceId: string | undefined,
): Promise<void> {
  if (
    !workspaceId ||
    !(await options.security.authorize(principal, action, workspaceId))
  ) {
    throw new Error("Access denied.");
  }
}

async function recordAudit(audit: AuditSink, event: AuditEvent): Promise<void> {
  await audit.record(event);
}

function parseIngestionInput(body: Record<string, unknown>): {
  source: KnowledgeSource;
  document: MarkdownIngestionInput;
} {
  const source = body.source;
  const document = body.document;
  if (!isRecord(source) || !isRecord(document)) {
    throw new Error("source and document are required objects.");
  }

  const accessPolicy = document.accessPolicy;
  if (!isRecord(accessPolicy)) {
    throw new Error("document.accessPolicy is required.");
  }

  return {
    source: {
      id: requiredString(source.id, "source.id"),
      kind: requiredString(source.kind, "source.kind"),
      name: requiredString(source.name, "source.name"),
    },
    document: {
      sourceId: requiredString(document.sourceId, "document.sourceId"),
      externalId: requiredString(document.externalId, "document.externalId"),
      workspaceId: requiredString(document.workspaceId, "document.workspaceId"),
      title: requiredString(document.title, "document.title"),
      content: requiredString(document.content, "document.content"),
      accessPolicy: {
        workspaceId: requiredString(
          accessPolicy.workspaceId,
          "document.accessPolicy.workspaceId",
        ),
        ...(accessPolicy.teamIds === undefined
          ? {}
          : {
              teamIds: stringArray(
                accessPolicy.teamIds,
                "document.accessPolicy.teamIds",
              ),
            }),
        ...(accessPolicy.actorIds === undefined
          ? {}
          : {
              actorIds: stringArray(
                accessPolicy.actorIds,
                "document.accessPolicy.actorIds",
              ),
            }),
      },
      ...(document.version === undefined
        ? {}
        : { version: requiredString(document.version, "document.version") }),
      ...(document.uri === undefined
        ? {}
        : { uri: requiredString(document.uri, "document.uri") }),
      ...(document.maxChunkCharacters === undefined
        ? {}
        : {
            maxChunkCharacters: positiveInteger(
              document.maxChunkCharacters,
              "document.maxChunkCharacters",
            ),
          }),
    },
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!isRecord(parsed)) throw new Error("Request body must be a JSON object.");
  return parsed;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function withoutEmbedding<T extends { embedding?: unknown }>(chunk: T) {
  const result = { ...chunk };
  delete result.embedding;
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an array of strings.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function booleanValue(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }
  return value;
}

function contextIntent(value: unknown): "continuity" | "documentary" | "mixed" {
  if (value !== "continuity" && value !== "documentary" && value !== "mixed") {
    throw new Error("intent must be continuity, documentary or mixed.");
  }
  return value;
}
