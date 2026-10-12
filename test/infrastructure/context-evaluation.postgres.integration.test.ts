import { Pool } from "pg";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  ContextOrchestrator,
  evaluateContextProvider,
  KnowledgeIngestionService,
  KnowledgeQueryService,
  MemoryService,
  type EmbeddingProvider,
} from "../../src/application/index.js";
import { PostgresKnowledgeRepository } from "../../src/infrastructure/postgres/index.js";
import { SqliteAgentMemoryRepository } from "../../src/infrastructure/index.js";

const connectionString = process.env.DATABASE_URL;
const describeIntegration = connectionString ? describe : describe.skip;
const cleanupPool = connectionString
  ? new Pool({ connectionString })
  : undefined;
const sqliteRepositories: SqliteAgentMemoryRepository[] = [];
const temporaryDirectories: string[] = [];
const createdDocuments: string[] = [];
let createdSourceId: string | undefined;

afterEach(async () => {
  for (const repository of sqliteRepositories.splice(0)) repository.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  if (cleanupPool && createdDocuments.length) {
    await cleanupPool.query(
      "DELETE FROM documents WHERE id = ANY($1::uuid[])",
      [createdDocuments.splice(0)],
    );
  }
  if (cleanupPool && createdSourceId) {
    await cleanupPool.query("DELETE FROM knowledge_sources WHERE id = $1", [
      createdSourceId,
    ]);
    createdSourceId = undefined;
  }
});

describeIntegration("Context evaluation with PostgreSQL RAG", () => {
  afterAll(async () => {
    await cleanupPool?.end();
  });

  it("evaluates the real hybrid repository with the same quality contract", async () => {
    const directory = mkdtempSync(
      join(tmpdir(), "context-evaluation-postgres-"),
    );
    temporaryDirectories.push(directory);
    const memoryRepository = new SqliteAgentMemoryRepository(
      join(directory, "agent-memory.sqlite"),
    );
    sqliteRepositories.push(memoryRepository);
    const memory = new MemoryService(memoryRepository);
    const workspaceId = `workspace-${crypto.randomUUID()}`;
    const actorId = `actor-${crypto.randomUUID()}`;
    const teamId = `team-${crypto.randomUUID()}`;
    const embeddingProvider = createEmbeddingProvider();

    const savedMemory = memory.save({
      workspaceId,
      type: "decision",
      title: "Deployment decision",
      content: "The decision is to use staged deployment releases.",
      subjectKey: "deployment/release-strategy",
    });

    const repository = new PostgresKnowledgeRepository(connectionString!);
    const sourceId = `source-${crypto.randomUUID()}`;
    createdSourceId = sourceId;
    const ingestion = new KnowledgeIngestionService(
      repository,
      embeddingProvider,
    );
    const deploymentInput = {
      sourceId,
      externalId: `deployment-${crypto.randomUUID()}`,
      workspaceId,
      title: "Deployment documentation",
      content: "Deployment documentation describes staged releases.",
      accessPolicy: { workspaceId },
    };
    const privateInput = {
      sourceId,
      externalId: `private-${crypto.randomUUID()}`,
      workspaceId,
      title: "Private documentation",
      content: "Private documentation contains restricted deployment notes.",
      accessPolicy: { workspaceId, actorIds: ["private-owner"] },
    };

    try {
      const deployment = await ingestion.ingestMarkdown(
        { id: sourceId, kind: "markdown", name: "evaluation-docs" },
        deploymentInput,
      );
      const privateDocument = await ingestion.ingestMarkdown(
        { id: sourceId, kind: "markdown", name: "evaluation-docs" },
        privateInput,
      );
      createdDocuments.push(
        deployment.document.id,
        privateDocument.document.id,
      );

      const provider = new ContextOrchestrator(
        memory,
        new KnowledgeQueryService(repository, embeddingProvider),
      );
      const result = await evaluateContextProvider(
        provider,
        [
          {
            id: "postgres-continuity",
            request: {
              workspaceId,
              actorId,
              teamIds: [teamId],
              query: "deployment decision",
              intent: "continuity",
            },
            expectedIntent: "continuity",
            expectedMemoryIds: [savedMemory.id],
          },
          {
            id: "postgres-documentary",
            request: {
              workspaceId,
              actorId,
              teamIds: [teamId],
              query: "deployment documentation",
              intent: "documentary",
            },
            expectedIntent: "documentary",
            expectedDocumentIds: [deployment.document.id],
            forbiddenDocumentIds: [privateDocument.document.id],
          },
          {
            id: "postgres-permission-isolation",
            request: {
              workspaceId,
              actorId,
              teamIds: [teamId],
              query: "private documentation",
              intent: "documentary",
            },
            expectedIntent: "documentary",
            forbiddenDocumentIds: [privateDocument.document.id],
          },
        ],
        {
          intentAccuracy: 1,
          memoryRecall: 1,
          citationRecall: 1,
          memoryPrecision: 1,
          citationPrecision: 1,
          maxPermissionLeakage: 0,
        },
      );

      expect(result.passed).toBe(true);
      expect(result.thresholdFailures).toEqual([]);
      expect(result.permissionLeakage).toBe(0);
    } finally {
      await repository.close();
    }
  }, 30_000);
});

function createEmbeddingProvider(): EmbeddingProvider {
  return {
    modelId: "test-postgres-context-evaluation",
    dimensions: 384,
    embedQuery: async (text) => vector(text.includes("private") ? 1 : 0),
    embedDocuments: async (texts) =>
      texts.map((text) => vector(text.includes("Private") ? 1 : 0)),
  };
}

function vector(index: number): readonly number[] {
  return Array.from({ length: 384 }, (_, position) =>
    position === index ? 1 : 0,
  );
}
