import { describe, expect, it } from "vitest";

import { buildKnowledgeSearchQuery } from "../../src/infrastructure/index.js";

describe("buildKnowledgeSearchQuery", () => {
  it("keeps workspace and access policy filtering in the database query", () => {
    const query = buildKnowledgeSearchQuery({
      workspaceId: "workspace-checkout",
      actorId: "actor-alice",
      teamIds: ["team-platform"],
      query: "authentication",
      limit: 10,
    });

    expect(query.text).toContain("d.workspace_id = $1");
    expect(query.text).toContain("access_policy->'actorIds'");
    expect(query.text).toContain("access_policy->'teamIds'");
    expect(query.text).toContain("plainto_tsquery('simple', $4)");
    expect(query.text).toContain("dc.embedding <=> $5::vector(384)");
    expect(query.values).toEqual([
      "workspace-checkout",
      "actor-alice",
      ["team-platform"],
      "authentication",
      null,
      10,
    ]);
  });

  it("builds a hybrid query when an embedding is available", () => {
    const query = buildKnowledgeSearchQuery({
      workspaceId: "workspace-checkout",
      actorId: "actor-alice",
      teamIds: [],
      query: "authentication",
      queryEmbedding: [0.1, 0.2, 0.3],
      limit: 5,
    });

    expect(query.text).toContain("0.5 * ts_rank_cd");
    expect(query.values[4]).toBe("[0.1,0.2,0.3]");
    expect(query.values[5]).toBe(5);
  });
});
