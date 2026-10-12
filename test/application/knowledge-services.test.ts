import { describe, expect, it } from "vitest";

import {
  KnowledgeIngestionService,
  KnowledgeQueryService,
  type EmbeddingProvider,
  type KnowledgeRepository,
} from "../../src/application/index.js";
import type {
  Document,
  DocumentChunk,
  KnowledgeSource,
} from "../../src/domain/index.js";

function createProvider(): EmbeddingProvider {
  return {
    modelId: "test-model",
    dimensions: 3,
    embedQuery: async () => [0.9, 0.1, 0],
    embedDocuments: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
  };
}

function createRepository(): KnowledgeRepository & {
  saved?: {
    source: KnowledgeSource;
    document: Document;
    chunks: readonly DocumentChunk[];
  };
} {
  const repository: KnowledgeRepository & {
    saved?: {
      source: KnowledgeSource;
      document: Document;
      chunks: readonly DocumentChunk[];
    };
  } = {
    async save(source, document, chunks) {
      repository.saved = { source, document, chunks };
    },
    async search() {
      return [];
    },
    async close() {},
  };
  return repository;
}

describe("KnowledgeIngestionService", () => {
  it("coordinates Markdown ingestion, embeddings and persistence", async () => {
    const repository = createRepository();
    const service = new KnowledgeIngestionService(repository, createProvider());

    const result = await service.ingestMarkdown(
      { id: "source", kind: "markdown", name: "handbook" },
      {
        sourceId: "source",
        externalId: "doc-1",
        workspaceId: "workspace",
        title: "Handbook",
        content: "Primer contenido con suficiente longitud.",
        accessPolicy: { workspaceId: "workspace" },
      },
    );

    expect(result.chunks[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(repository.saved?.document.id).toBe(result.document.id);
    expect(repository.saved?.chunks).toEqual(result.chunks);
  });

  it("rejects credential-like content before embedding or persistence", async () => {
    const repository = createRepository();
    const provider = createProvider();
    const embedDocuments = provider.embedDocuments;
    provider.embedDocuments = async (...args) => {
      throw new Error(`embedding should not run: ${args.length}`);
    };
    const service = new KnowledgeIngestionService(repository, provider);

    await expect(
      service.ingestMarkdown(
        { id: "source", kind: "markdown", name: "handbook" },
        {
          sourceId: "source",
          externalId: "doc-secret",
          workspaceId: "workspace",
          title: "Configuration",
          content: "client_secret: 12345678901234567890",
          accessPolicy: { workspaceId: "workspace" },
        },
      ),
    ).rejects.toThrow("Sensitive content detected");
    expect(repository.saved).toBeUndefined();
    expect(embedDocuments).toBeDefined();
  });
});

describe("KnowledgeQueryService", () => {
  it("embeds the query and returns traceable source citations", async () => {
    const repository = createRepository();
    const source = { id: "source", kind: "markdown", name: "handbook" };
    const document: Document = {
      id: "document",
      sourceId: "source",
      externalId: "doc-1",
      workspaceId: "workspace",
      title: "Handbook",
      uri: "https://example.test/handbook",
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
    repository.search = async (input) => {
      expect(input.queryEmbedding).toEqual([0.9, 0.1, 0]);
      return [{ document, chunk, source, score: 0.87 }];
    };
    const service = new KnowledgeQueryService(repository, createProvider());

    const response = await service.search({
      workspaceId: "workspace",
      actorId: "actor",
      teamIds: [],
      query: "¿Qué dice el handbook?",
    });

    expect(response.results).toHaveLength(1);
    expect(response.citations).toEqual([
      {
        sourceId: "source",
        title: "Handbook",
        uri: "https://example.test/handbook",
        sourceKind: "markdown",
        sourceName: "handbook",
        documentId: "document",
        documentVersion: "1",
        chunkId: "chunk",
        chunkOrdinal: 0,
        excerpt: "Contenido citado.",
        score: 0.87,
      },
    ]);
  });
});
