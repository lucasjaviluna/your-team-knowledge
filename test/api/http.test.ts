import { request } from "node:http";

import { describe, expect, it } from "vitest";

import {
  KnowledgeQueryService,
  StaticBearerSecurity,
  createKnowledgeHttpServer,
  type AuditEvent,
  type EmbeddingProvider,
  type KnowledgeHttpOptions,
  type KnowledgeHttpServices,
  type KnowledgeRepository,
} from "../../src/index.js";
import type {
  Document,
  DocumentChunk,
  KnowledgeSource,
} from "../../src/domain/index.js";

const source: KnowledgeSource = {
  id: "source",
  kind: "markdown",
  name: "handbook",
};

const document: Document = {
  id: "document",
  sourceId: "source",
  externalId: "doc-1",
  workspaceId: "workspace",
  title: "Handbook",
  version: "1",
  status: "active",
  accessPolicy: { workspaceId: "workspace" },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const chunk: DocumentChunk = {
  id: "chunk",
  documentId: "document",
  ordinal: 0,
  content: "Contenido citado.",
  metadata: {},
};

function createServices(): KnowledgeHttpServices {
  const provider: EmbeddingProvider = {
    modelId: "test-model",
    dimensions: 3,
    embedQuery: async () => [0.9, 0.1, 0],
    embedDocuments: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
  };
  const repository: KnowledgeRepository = {
    async save() {},
    async search() {
      return [{ document, chunk, source, score: 0.87 }];
    },
    async close() {},
  };
  return {
    ingestion: {
      async ingestMarkdown() {
        return { document, chunks: [chunk] };
      },
    } as unknown as KnowledgeHttpServices["ingestion"],
    query: new KnowledgeQueryService(repository, provider),
    context: {
      async resolve(input) {
        return {
          query: input.query,
          intent: input.intent ?? "mixed",
          memories: [],
          citations: [],
          contextText: "Contexto de prueba.",
          estimatedTokens: 5,
          truncated: false,
        };
      },
    },
  };
}

function createOptions() {
  const events: AuditEvent[] = [];
  const options: KnowledgeHttpOptions = {
    security: new StaticBearerSecurity(
      new Map([
        [
          "test-token",
          {
            actorId: "actor",
            teamIds: ["team-platform"],
            workspaceIds: ["workspace"],
          },
        ],
      ]),
    ),
    audit: {
      record: async (event: AuditEvent) => {
        events.push(event);
      },
    },
  };
  return {
    options,
    events,
  };
}

async function startServer(
  services: KnowledgeHttpServices,
  options: KnowledgeHttpOptions,
) {
  const server = createKnowledgeHttpServer(services, options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address.");
  }
  return { server, port: address.port };
}

function post(
  port: number,
  path: string,
  body: unknown,
  requestId = "test-request",
) {
  return new Promise<{ status: number; body: Record<string, unknown> }>(
    (resolve, reject) => {
      const payload = JSON.stringify(body);
      const client = request(
        {
          host: "127.0.0.1",
          port,
          path,
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
            authorization: "Bearer test-token",
            "x-request-id": requestId,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(
                Buffer.concat(chunks).toString("utf8"),
              ) as Record<string, unknown>,
            });
          });
        },
      );
      client.on("error", reject);
      client.end(payload);
    },
  );
}

function get(port: number, path: string) {
  return new Promise<{ status: number; body: Record<string, unknown> }>(
    (resolve, reject) => {
      const client = request(
        { host: "127.0.0.1", port, path, method: "GET" },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(
                Buffer.concat(chunks).toString("utf8"),
              ) as Record<string, unknown>,
            });
          });
        },
      );
      client.on("error", reject);
      client.end();
    },
  );
}

describe("knowledge HTTP API", () => {
  it("serves health and query responses with citations", async () => {
    const { options, events } = createOptions();
    const { server, port } = await startServer(createServices(), options);

    try {
      const health = await get(port, "/health");
      expect(health).toEqual({ status: 200, body: { status: "ok" } });

      const response = await post(port, "/v1/knowledge/query", {
        workspaceId: "workspace",
        actorId: "actor",
        teamIds: [],
        query: "¿Qué dice el handbook?",
      });

      expect(response.status).toBe(200);
      expect(response.body.citations).toEqual([
        expect.objectContaining({
          documentId: "document",
          chunkId: "chunk",
          excerpt: "Contenido citado.",
        }),
      ]);

      const context = await post(port, "/v1/context", {
        workspaceId: "workspace",
        query: "deployment",
        maxTokens: 100,
      });
      expect(context.status).toBe(200);
      expect(context.body).toEqual(
        expect.objectContaining({
          contextText: "Contexto de prueba.",
          estimatedTokens: 5,
        }),
      );

      const ingestion = await post(port, "/v1/knowledge/documents", {
        source,
        document: {
          sourceId: "source",
          externalId: "doc-1",
          workspaceId: "workspace",
          title: "Handbook",
          content: "Contenido del handbook.",
          accessPolicy: { workspaceId: "workspace" },
        },
      });
      expect(ingestion.status).toBe(201);
      expect(ingestion.body.chunks).toEqual([chunk]);
      expect(events).toHaveLength(3);
      expect(events.every((event) => event.outcome === "success")).toBe(true);
      expect(events.map((event) => event.requestId)).toEqual([
        "test-request",
        "test-request",
        "test-request",
      ]);
      expect(events[0]?.metadata).toEqual({ resultCount: 1 });
      expect(events[1]?.metadata).toEqual({
        memoryCount: 0,
        citationCount: 0,
        estimatedTokens: 5,
      });
      expect(events[2]?.metadata).toEqual({ chunkCount: 1 });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("separates liveness from dependency readiness", async () => {
    const { options } = createOptions();
    options.readiness = async () => ({
      dependencies: { postgres: "ok", audit: "ok" },
    });
    const { server, port } = await startServer(createServices(), options);

    try {
      await expect(get(port, "/health")).resolves.toMatchObject({
        status: 200,
        body: { status: "ok" },
      });
      await expect(get(port, "/ready")).resolves.toEqual({
        status: 200,
        body: {
          status: "ready",
          dependencies: { postgres: "ok", audit: "ok" },
        },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns 503 when readiness dependencies fail", async () => {
    const { options } = createOptions();
    options.readiness = async () => {
      throw new Error("database unavailable");
    };
    const { server, port } = await startServer(createServices(), options);

    try {
      await expect(get(port, "/ready")).resolves.toEqual({
        status: 503,
        body: { status: "not_ready" },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects an unauthorized workspace and audits the denial", async () => {
    const { options, events } = createOptions();
    const { server, port } = await startServer(createServices(), options);

    try {
      const response = await post(port, "/v1/knowledge/query", {
        workspaceId: "workspace-other",
        query: "consulta",
      });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "Access denied." });
      expect(events).toEqual([
        expect.objectContaining({
          action: "knowledge.query",
          outcome: "denied",
          actorId: "actor",
          workspaceId: "workspace-other",
        }),
      ]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
