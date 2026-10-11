import { describe, expect, it } from "vitest";

import {
  evaluateContextProvider,
  type ContextBundle,
  type ContextProvider,
} from "../../src/application/context/index.js";
import type { MemoryItem, SourceCitation } from "../../src/domain/index.js";
import { contextEvaluationDataset } from "../fixtures/context-evaluation-dataset.js";

const memory: MemoryItem = {
  id: "memory-decision",
  workspaceId: "workspace-evaluation",
  type: "decision",
  title: "Deployment decision",
  content: "Use staged deployments.",
  tags: ["deployment"],
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const deploymentCitation: SourceCitation = {
  sourceId: "source-deployment",
  documentId: "document-deployment",
  chunkId: "chunk-deployment",
  title: "Deployment guide",
};

const privateCitation: SourceCitation = {
  sourceId: "source-private",
  documentId: "document-private",
  chunkId: "chunk-private",
  title: "Private notes",
};

function bundle(
  query: string,
  intent: ContextBundle["intent"],
  options: Pick<ContextBundle, "memories" | "citations">,
): ContextBundle {
  return {
    query,
    intent,
    memories: options.memories,
    citations: options.citations,
    contextText: "evaluated context",
    estimatedTokens: 2,
    truncated: false,
  };
}

function providerReturningExpectedData(
  includeForbiddenCitation = false,
): ContextProvider {
  return {
    async resolve(request) {
      if (request.query.includes("sesión")) {
        return bundle(request.query, "continuity", {
          memories: [{ memory, reason: "query-match" }],
          citations: [],
        });
      }

      if (request.query.includes("decidimos")) {
        return bundle(request.query, "mixed", {
          memories: [{ memory, reason: "query-match" }],
          citations: [deploymentCitation],
        });
      }

      return bundle(request.query, "documentary", {
        memories: [],
        citations: request.query.includes("privada")
          ? includeForbiddenCitation
            ? [privateCitation]
            : []
          : [deploymentCitation],
      });
    },
  };
}

describe("context evaluation harness", () => {
  it("measures intent, recall and permission isolation", async () => {
    const result = await evaluateContextProvider(
      providerReturningExpectedData(),
      contextEvaluationDataset,
    );

    expect(result).toMatchObject({
      intentAccuracy: 1,
      memoryRecall: 1,
      citationRecall: 1,
      memoryPrecision: 1,
      citationPrecision: 1,
      permissionLeakage: 0,
      passed: true,
    });
    expect(result.cases).toHaveLength(4);
  });

  it("fails when a provider returns forbidden content", async () => {
    const result = await evaluateContextProvider(
      providerReturningExpectedData(true),
      contextEvaluationDataset,
    );

    expect(result.permissionLeakage).toBe(1);
    expect(result.citationPrecision).toBeCloseTo(2 / 3);
    expect(result.passed).toBe(false);
    expect(
      result.cases.find((item) => item.id === "permission-isolation"),
    ).toMatchObject({
      forbiddenDocumentCount: 1,
      citationPrecision: 0,
      passed: false,
    });
  });
});
