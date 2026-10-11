import { describe, expect, it } from "vitest";

import { ContextOrchestrator } from "../../src/application/context/index.js";
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
});
