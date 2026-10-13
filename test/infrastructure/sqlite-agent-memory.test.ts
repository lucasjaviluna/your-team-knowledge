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
    expect(
      service.search({ workspaceId: "workspace-checkout", query: "updated" }),
    ).toHaveLength(1);
    expect(
      service.search({ workspaceId: "workspace-checkout", query: "initial" }),
    ).toHaveLength(0);
  });

  it("rejects credential-like content before persisting it", () => {
    const { repository, service } = createMemoryService();

    expect(() =>
      service.save({
        workspaceId: "workspace-checkout",
        type: "discovery",
        title: "Runtime configuration",
        content: "client_secret: 12345678901234567890",
      }),
    ).toThrow("Sensitive content detected in memory.");

    expect(
      service.search({
        workspaceId: "workspace-checkout",
        query: "runtime configuration",
      }),
    ).toHaveLength(0);
    expect(
      repository.findActiveBySubjectKey(
        "workspace-checkout",
        "runtime/configuration",
      ),
    ).toBeUndefined();
  });

  it("supports simple singular and plural query variations", () => {
    const { service } = createMemoryService();

    service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Guard de ruta",
      content: "La ruta autenticada usa un guard.",
    });

    const results = service.search({
      workspaceId: "workspace-checkout",
      query: "rutas guards",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Guard de ruta");
  });

  it("tracks session lifecycle and memory relations", () => {
    const { service } = createMemoryService();
    const session = service.startSession({ workspaceId: "workspace-checkout" });
    const first = service.save({
      workspaceId: "workspace-checkout",
      sessionId: session.id,
      type: "discovery",
      title: "Checkout uses a BFF",
      content: "The checkout frontend calls the BFF.",
    });
    const second = service.save({
      workspaceId: "workspace-checkout",
      sessionId: session.id,
      type: "decision",
      title: "Keep the BFF boundary",
      content: "The BFF remains the integration boundary.",
    });

    const relation = service.addRelation({
      sourceMemoryId: second.id,
      targetMemoryId: first.id,
      relation: "supports",
    });
    const ended = service.endSession({
      sessionId: session.id,
      summary: "Captured the BFF decision.",
    });

    expect(ended.summary).toBe("Captured the BFF decision.");
    expect(ended.endedAt).toBeDefined();
    expect(service.listRelations(first.id)).toEqual([relation]);
  });

  it("filters memories by validity and review lifecycle", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const { service } = createMemoryService(() => now);

    service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Future decision",
      content: "This decision becomes valid later.",
      validFrom: new Date("2026-10-14T00:00:00.000Z"),
    });
    service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Expired decision",
      content: "This decision is no longer valid.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-10-12T00:00:00.000Z"),
    });
    service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Review decision",
      content: "This decision needs review.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      reviewAt: new Date("2026-10-12T00:00:00.000Z"),
    });

    expect(
      service.search({
        workspaceId: "workspace-checkout",
        query: "decision",
      }),
    ).toHaveLength(0);
    expect(
      service
        .search({
          workspaceId: "workspace-checkout",
          query: "decision",
          includeNeedsReview: true,
        })
        .map((item) => item.title),
    ).toEqual(["Review decision"]);
    expect(service.listDueForReview("workspace-checkout")).toHaveLength(1);
  });

  it("transitions, archives expired memories and purges archived data", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const { repository, service } = createMemoryService(() => now);
    const expired = service.save({
      workspaceId: "workspace-checkout",
      type: "discovery",
      title: "Expired discovery",
      content: "This discovery has an expiration date.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-10-13T00:00:00.000Z"),
    });
    const retained = service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Retained decision",
      content: "This decision remains active.",
    });

    expect(service.archiveExpired()).toBe(1);
    expect(repository.findById(expired.id)?.status).toBe("archived");
    expect(service.setStatus(retained.id, "needs_review").status).toBe(
      "needs_review",
    );
    expect(
      service.search({
        workspaceId: "workspace-checkout",
        query: "retained",
      }),
    ).toHaveLength(0);
    expect(service.purgeArchived(new Date("2026-10-14T00:00:00.000Z"))).toBe(1);
    expect(repository.findById(expired.id)).toBeUndefined();
  });
});

function createMemoryService(now?: () => Date) {
  const directory = mkdtempSync(join(tmpdir(), "corporate-knowledge-"));
  temporaryDirectories.push(directory);
  const repository = new SqliteAgentMemoryRepository(
    join(directory, "agent-memory.sqlite"),
  );
  resources.push(repository);
  const service = new MemoryService(repository, now);

  return { repository, service };
}
