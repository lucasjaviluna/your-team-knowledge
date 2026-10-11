import { describe, expect, it } from "vitest";

import type { MemoryItem, Workspace } from "../../src/domain/index.js";

describe("domain contracts", () => {
  it("represent a workspace and a local memory item", () => {
    const workspace: Workspace = {
      id: "workspace-checkout",
      organizationId: "organization-acme",
      name: "Checkout",
      type: "software",
    };

    const memory: MemoryItem = {
      id: "memory-authentication-decision",
      workspaceId: workspace.id,
      type: "decision",
      title: "Authentication approach",
      content: "The checkout workflow uses the approved authentication model.",
      subjectKey: "architecture/checkout/authentication",
      tags: ["architecture", "authentication"],
      status: "active",
      createdAt: new Date("2026-10-11T00:00:00.000Z"),
      updatedAt: new Date("2026-10-11T00:00:00.000Z"),
    };

    expect(memory.workspaceId).toBe(workspace.id);
    expect(memory.subjectKey).toBe("architecture/checkout/authentication");
  });
});
