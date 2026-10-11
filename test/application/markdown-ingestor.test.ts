import { describe, expect, it } from "vitest";

import { ingestMarkdown } from "../../src/application/index.js";

describe("ingestMarkdown", () => {
  it("creates a document and preserves paragraph boundaries in chunks", () => {
    const result = ingestMarkdown({
      sourceId: "source-handbook",
      externalId: "handbook/authentication",
      workspaceId: "workspace-checkout",
      title: "Authentication handbook",
      version: "2026-10",
      content: "# Authentication\n\nUse the approved login flow for every checkout authentication request and validate the session before continuing.\n\nRotate credentials during incidents.",
      accessPolicy: { workspaceId: "workspace-checkout", teamIds: ["team-platform"] },
      maxChunkCharacters: 100,
    });

    expect(result.document.title).toBe("Authentication handbook");
    expect(result.document.status).toBe("active");
    expect(result.chunks).toHaveLength(3);
    expect(result.chunks[0]?.ordinal).toBe(0);
    expect(result.chunks[2]?.content).toContain("Rotate credentials");
  });
});
