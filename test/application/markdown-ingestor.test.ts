import { describe, expect, it } from "vitest";

import {
  ingestMarkdown,
  ingestMarkdownWithEmbeddings,
} from "../../src/application/index.js";

describe("ingestMarkdown", () => {
  it("creates a document and preserves paragraph boundaries in chunks", () => {
    const result = ingestMarkdown({
      sourceId: "source-handbook",
      externalId: "handbook/authentication",
      workspaceId: "workspace-checkout",
      title: "Authentication handbook",
      version: "2026-10",
      content:
        "# Authentication\n\nUse the approved login flow for every checkout authentication request and validate the session before continuing.\n\nRotate credentials during incidents.",
      accessPolicy: {
        workspaceId: "workspace-checkout",
        teamIds: ["team-platform"],
      },
      maxChunkCharacters: 100,
    });

    expect(result.document.title).toBe("Authentication handbook");
    expect(result.document.status).toBe("active");
    expect(result.chunks).toHaveLength(3);
    expect(result.chunks[0]?.ordinal).toBe(0);
    expect(result.chunks[2]?.content).toContain("Rotate credentials");
  });
});

describe("ingestMarkdownWithEmbeddings", () => {
  it("enriches every chunk with the provider output", async () => {
    const provider = {
      modelId: "test-model",
      dimensions: 3,
      embedQuery: async () => [0, 0, 0],
      embedDocuments: async (texts: readonly string[]) =>
        texts.map((_, index) => [index + 1, 0, 0]),
    };

    const result = await ingestMarkdownWithEmbeddings(
      {
        sourceId: "source",
        externalId: "document",
        workspaceId: "workspace",
        title: "Título",
        content:
          "Primer párrafo con suficiente contenido para superar el límite de chunk y probar la asociación del primer vector.\n\nSegundo párrafo con suficiente contenido para superar el límite de chunk y probar la asociación del segundo vector.",
        maxChunkCharacters: 100,
        accessPolicy: { workspaceId: "workspace" },
      },
      provider,
    );

    expect(result.chunks.map((chunk) => chunk.embedding)).toEqual([
      [1, 0, 0],
      [2, 0, 0],
    ]);
  });
});
