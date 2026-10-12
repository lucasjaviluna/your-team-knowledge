import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ContextOrchestrator,
  evaluateContextProvider,
  KnowledgeQueryService,
  MemoryService,
  type EmbeddingProvider,
  type KnowledgeRepository,
  type KnowledgeSearchInput,
  type KnowledgeSearchResult,
} from "../../src/application/index.js";
import type {
  Document,
  DocumentChunk,
  KnowledgeSource,
} from "../../src/domain/index.js";
import { SqliteAgentMemoryRepository } from "../../src/infrastructure/index.js";

const repositories: SqliteAgentMemoryRepository[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("context evaluation with real application providers", () => {
  it("evaluates SQLite memory and filtered knowledge through the orchestrator", async () => {
    const directory = mkdtempSync(join(tmpdir(), "context-evaluation-real-"));
    temporaryDirectories.push(directory);
    const memoryRepository = new SqliteAgentMemoryRepository(
      join(directory, "agent-memory.sqlite"),
    );
    repositories.push(memoryRepository);
    const memory = new MemoryService(memoryRepository);

    const savedMemory = memory.save({
      workspaceId: "workspace-real-evaluation",
      type: "decision",
      title: "Deployment decision",
      content: "The decision is to use staged deployment releases.",
      subjectKey: "deployment/release-strategy",
    });

    const knowledge = new KnowledgeQueryService(
      createKnowledgeRepository(),
      createEmbeddingProvider(),
    );
    const provider = new ContextOrchestrator(memory, knowledge);
    const result = await evaluateContextProvider(
      provider,
      [
        {
          id: "real-continuity",
          request: {
            workspaceId: "workspace-real-evaluation",
            actorId: "actor-real-evaluation",
            teamIds: ["team-real-evaluation"],
            query: "deployment decision",
            intent: "continuity",
          },
          expectedIntent: "continuity",
          expectedMemoryIds: [savedMemory.id],
        },
        {
          id: "real-documentary",
          request: {
            workspaceId: "workspace-real-evaluation",
            actorId: "actor-real-evaluation",
            teamIds: ["team-real-evaluation"],
            query: "deployment documentation",
            intent: "documentary",
          },
          expectedIntent: "documentary",
          expectedDocumentIds: ["document-deployment-real"],
          forbiddenDocumentIds: ["document-private-real"],
        },
        {
          id: "real-permission-isolation",
          request: {
            workspaceId: "workspace-real-evaluation",
            actorId: "actor-real-evaluation",
            teamIds: ["team-real-evaluation"],
            query: "private documentation",
            intent: "documentary",
          },
          expectedIntent: "documentary",
          forbiddenDocumentIds: ["document-private-real"],
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
    expect(result.cases).toHaveLength(3);
  });
});

function createEmbeddingProvider(): EmbeddingProvider {
  return {
    modelId: "test-context-evaluation",
    dimensions: 3,
    embedQuery: async () => [1, 0, 0],
    embedDocuments: async (texts) => texts.map(() => [1, 0, 0]),
  };
}

function createKnowledgeRepository(): KnowledgeRepository {
  const source: KnowledgeSource = {
    id: "source-real-evaluation",
    kind: "markdown",
    name: "evaluation-docs",
  };
  const deployment = createDocument(
    "document-deployment-real",
    "Deployment documentation",
    { workspaceId: "workspace-real-evaluation" },
  );
  const privateDocument = createDocument(
    "document-private-real",
    "Private documentation",
    { workspaceId: "workspace-real-evaluation", actorIds: ["private-owner"] },
  );
  const results: readonly KnowledgeSearchResult[] = [
    createResult(
      source,
      deployment,
      "Deployment documentation for staged releases.",
    ),
    createResult(source, privateDocument, "Private deployment notes."),
  ];

  return {
    async save() {},
    async search(input: KnowledgeSearchInput) {
      return results.filter((result) => {
        if (result.document.workspaceId !== input.workspaceId) return false;
        const query = input.query.toLowerCase();
        if (
          !result.document.title
            .toLowerCase()
            .includes(query.split(" ")[0] ?? "")
        ) {
          return false;
        }
        const policy = result.document.accessPolicy;
        return (
          (!policy.actorIds?.length ||
            policy.actorIds.includes(input.actorId)) &&
          (!policy.teamIds?.length ||
            policy.teamIds.some((id) => input.teamIds.includes(id)))
        );
      });
    },
    async close() {},
  };
}

function createDocument(
  id: string,
  title: string,
  accessPolicy: Document["accessPolicy"],
): Document {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    id,
    sourceId: "source-real-evaluation",
    externalId: id,
    workspaceId: "workspace-real-evaluation",
    title,
    version: "1",
    status: "active",
    accessPolicy,
    createdAt: now,
    updatedAt: now,
  };
}

function createResult(
  source: KnowledgeSource,
  document: Document,
  content: string,
): KnowledgeSearchResult {
  const chunk: DocumentChunk = {
    id: `${document.id}-chunk-0`,
    documentId: document.id,
    ordinal: 0,
    content,
    metadata: {},
    embedding: [1, 0, 0],
  };
  return { source, document, chunk, score: 1 };
}
