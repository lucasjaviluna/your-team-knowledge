import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MemoryService } from "../../src/application/index.js";
import { SqliteAgentMemoryRepository } from "../../src/infrastructure/index.js";

const resources: SqliteAgentMemoryRepository[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const repository of resources.splice(0)) {
    repository.close();
  }

  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SqliteAgentMemoryRepository", () => {
  it("persists and finds a local memory", () => {
    const { service } = createMemoryService();

    service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Checkout authentication",
      content: "The checkout workflow uses the approved authentication model.",
      subjectKey: "architecture/checkout/authentication",
      tags: ["architecture", "authentication"],
    });

    const results = service.search({
      workspaceId: "workspace-checkout",
      query: "authentication checkout",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.subjectKey).toBe("architecture/checkout/authentication");
  });

  it("updates the active memory with the same subjectKey", () => {
    const { service } = createMemoryService();
    const original = service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Checkout authentication",
      content: "Initial decision.",
      subjectKey: "architecture/checkout/authentication",
    });

    const updated = service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Checkout authentication updated",
      content: "Updated decision.",
      subjectKey: "architecture/checkout/authentication",
    });

    expect(updated.id).toBe(original.id);
    expect(service.search({ workspaceId: "workspace-checkout", query: "updated" })).toHaveLength(1);
    expect(service.search({ workspaceId: "workspace-checkout", query: "initial" })).toHaveLength(0);
  });
});

function createMemoryService() {
  const directory = mkdtempSync(join(tmpdir(), "corporate-knowledge-"));
  temporaryDirectories.push(directory);
  const repository = new SqliteAgentMemoryRepository(join(directory, "agent-memory.sqlite"));
  resources.push(repository);
  const service = new MemoryService(repository);

  return { repository, service };
}
