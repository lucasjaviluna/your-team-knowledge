import { describe, expect, it } from "vitest";

import {
  classifyContextIntent,
  ContextOrchestrator,
} from "../../src/application/context/index.js";
import type { KnowledgeQueryResponse } from "../../src/application/knowledge/index.js";
import type { MemoryItem, SourceCitation } from "../../src/domain/index.js";

const memory: MemoryItem = {
  id: "memory-1",
  workspaceId: "workspace-a",
  type: "decision",
  title: "Deployment decision",
  content: "Use the staged deployment process.",
  tags: ["deployment"],
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const citation: SourceCitation = {
  sourceId: "source-1",
  documentId: "document-1",
  chunkId: "chunk-1",
  title: "Deployment guide",
  excerpt: "The deployment process uses staged rollouts.",
  score: 0.9,
};

describe("ContextOrchestrator", () => {
  it("classifies continuity, documentary and mixed queries", () => {
    expect(classifyContextIntent("¿Qué decidimos en la sesión anterior?")).toBe(
      "continuity",
    );
    expect(
      classifyContextIntent("¿Qué dice la documentación de despliegue?"),
    ).toBe("documentary");
    expect(
      classifyContextIntent(
        "Recuerdo de la sesión y documentación de despliegue",
      ),
    ).toBe("mixed");
  });

  it("combines memory and knowledge into a traceable context bundle", async () => {
    const orchestrator = new ContextOrchestrator(
      { search: () => [memory] } as never,
      { search: async () => ({ results: [], citations: [citation] }) } as never,
    );

    const bundle = await orchestrator.resolve({
      workspaceId: "workspace-a",
      actorId: "actor-1",
      teamIds: ["team-1"],
      query: "deployment",
    });

    expect(bundle.memories).toEqual([{ memory, reason: "query-match" }]);
    expect(bundle.citations).toEqual([citation]);
    expect(bundle.contextText).toContain("Deployment decision");
    expect(bundle.contextText).toContain("Deployment guide");
    expect(bundle.truncated).toBe(false);
  });

  it("can resolve a single source and reports context truncation", async () => {
    const knowledgeResponse: KnowledgeQueryResponse = {
      results: [],
      citations: [citation],
    };
    const orchestrator = new ContextOrchestrator(
      { search: () => [memory] } as never,
      { search: async () => knowledgeResponse } as never,
    );

    const bundle = await orchestrator.resolve({
      workspaceId: "workspace-a",
      actorId: "actor-1",
      teamIds: [],
      query: "deployment",
      includeMemory: false,
      maxChars: 20,
    });

    expect(bundle.memories).toEqual([]);
    expect(bundle.contextText.length).toBe(20);
    expect(bundle.citations).toEqual([]);
    expect(bundle.truncated).toBe(true);
  });

  it("uses inferred intent to avoid an unnecessary source query", async () => {
    let memoryCalls = 0;
    let knowledgeCalls = 0;
    const orchestrator = new ContextOrchestrator(
      {
        search: () => {
          memoryCalls += 1;
          return [memory];
        },
      } as never,
      {
        search: async () => {
          knowledgeCalls += 1;
          return { results: [], citations: [citation] };
        },
      } as never,
    );

    const bundle = await orchestrator.resolve({
      workspaceId: "workspace-a",
      actorId: "actor-1",
      teamIds: [],
      query: "¿Qué decidimos en la sesión anterior?",
    });

    expect(bundle.intent).toBe("continuity");
    expect(memoryCalls).toBe(1);
    expect(knowledgeCalls).toBe(0);
    expect(bundle.citations).toEqual([]);
  });

  it("supports weighted fusion and an explicit token budget", async () => {
    const orchestrator = new ContextOrchestrator(
      { search: () => [memory] } as never,
      { search: async () => ({ results: [], citations: [citation] }) } as never,
      { ranking: { knowledgeWeight: 2 }, charsPerToken: 4 },
    );

    const bundle = await orchestrator.resolve({
      workspaceId: "workspace-a",
      actorId: "actor-1",
      teamIds: [],
      query: "deployment",
      maxTokens: 5,
    });

    expect(bundle.contextText.startsWith("Knowledge: Deploy")).toBe(true);
    expect(bundle.contextText.length).toBe(20);
    expect(bundle.estimatedTokens).toBe(5);
    expect(bundle.truncated).toBe(true);
  });
});
