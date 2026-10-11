import { describe, expect, it, vi } from "vitest";

import {
  PiHarnessKnowledgeAdapter,
  type KnowledgeClient,
} from "../../src/index.js";

describe("PiHarnessKnowledgeAdapter", () => {
  it("maps agent search calls to the HTTP client and exposes tools", async () => {
    const client: KnowledgeClient = {
      health: vi.fn(),
      query: vi.fn(async (input) => ({
        results: [],
        citations: [
          {
            sourceId: "handbook",
            title: input.query,
            sourceKind: "markdown",
            sourceName: "Engineering Handbook",
            documentId: "document",
            documentVersion: "1",
            chunkId: "chunk",
            chunkOrdinal: 0,
            excerpt: "Authorized context",
            score: 0.9,
          },
        ],
      })),
      ingestMarkdown: vi.fn(),
    };
    const adapter = new PiHarnessKnowledgeAdapter(client);

    const response = await adapter.searchCorporateKnowledge({
      workspaceId: "workspace",
      query: "deployment approval",
      limit: 5,
    });

    expect(response.citations[0]?.excerpt).toBe("Authorized context");
    expect(client.query).toHaveBeenCalledWith({
      workspaceId: "workspace",
      query: "deployment approval",
      limit: 5,
    });
    expect(adapter.toolDefinitions().map((tool) => tool.name)).toEqual([
      "search_corporate_knowledge",
      "ingest_corporate_document",
    ]);
  });
});
