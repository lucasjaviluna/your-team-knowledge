import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type {
  KnowledgeIngestionService,
  KnowledgeQueryService,
} from "../application/index.js";
import type { KnowledgeSource } from "../domain/index.js";
import type { MarkdownIngestionInput } from "../application/index.js";

export interface KnowledgeHttpServices {
  ingestion: KnowledgeIngestionService;
  query: KnowledgeQueryService;
}

export function createKnowledgeHttpServer(
  services: KnowledgeHttpServices,
): Server {
  return createServer((request, response) => {
    void handleKnowledgeHttpRequest(request, response, services);
  });
}

async function handleKnowledgeHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  services: KnowledgeHttpServices,
): Promise<void> {
  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    const body = await readJson(request);
    if (request.url === "/v1/knowledge/query") {
      const result = await services.query.search(
        parseQueryInput(body as Record<string, unknown>),
      );
      sendJson(response, 200, result);
      return;
    }

    if (request.url === "/v1/knowledge/documents") {
      const input = parseIngestionInput(body as Record<string, unknown>);
      const result = await services.ingestion.ingestMarkdown(
        input.source,
        input.document,
      );
      sendJson(response, 201, {
        document: result.document,
        chunks: result.chunks.map(withoutEmbedding),
      });
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error.";
    sendJson(response, 400, { error: message });
  }
}

function parseQueryInput(body: Record<string, unknown>) {
  return {
    workspaceId: requiredString(body.workspaceId, "workspaceId"),
    actorId: requiredString(body.actorId, "actorId"),
    teamIds: stringArray(body.teamIds, "teamIds"),
    query: requiredString(body.query, "query"),
    ...(body.limit === undefined
      ? {}
      : { limit: positiveInteger(body.limit, "limit") }),
  };
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
