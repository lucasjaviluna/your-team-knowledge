import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MemoryService, PiHarnessMemoryProvider } from "../../src/index.js";
import { SqliteAgentMemoryRepository } from "../../src/infrastructure/index.js";

const resources: Array<{
  repository: SqliteAgentMemoryRepository;
  directory: string;
}> = [];

afterEach(() => {
  for (const resource of resources.splice(0)) {
    resource.repository.close();
    rmSync(resource.directory, { recursive: true, force: true });
  }
});

describe("PiHarnessMemoryProvider", () => {
  it("implements pi-harness retrieval and storage over SQLite", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pi-memory-provider-"));
    const repository = new SqliteAgentMemoryRepository(
      join(directory, "memory.db"),
    );
    resources.push({ repository, directory });
    const provider = new PiHarnessMemoryProvider(new MemoryService(repository));

    const stored = await provider.store(
      {
        idempotencyKey: "architecture/auth",
        title: "Authentication decision",
        content: "Use bearer authentication at the HTTP boundary.",
        source: "pi-harness",
        area: "backend",
        tags: ["decision", "authentication"],
      },
      { projectId: "workspace" },
    );
    const result = await provider.search(
      { query: "authentication", limit: 5, maxChars: 30 },
      { projectId: "workspace", area: "backend" },
    );

    expect(stored.stored).toBe(true);
    expect(result.entries).toEqual([
      expect.objectContaining({
        projectId: "workspace",
        source: "agent-memory:sqlite",
        area: "backend",
        content: "Use bearer authentication at t…",
      }),
    ]);
    await expect(
      provider.isAvailable({ projectId: "workspace" }),
    ).resolves.toBe(true);
  });

  it("completes only due reviews within the consumer project", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pi-memory-review-"));
    const repository = new SqliteAgentMemoryRepository(
      join(directory, "memory.db"),
    );
    resources.push({ repository, directory });
    const service = new MemoryService(
      repository,
      () => new Date("2026-10-13T12:00:00.000Z"),
    );
    const provider = new PiHarnessMemoryProvider(service);
    const memory = service.save({
      workspaceId: "workspace",
      type: "decision",
      title: "Reviewable decision",
      content: "Review this decision periodically.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      reviewAt: new Date("2026-10-12T00:00:00.000Z"),
    });

    await expect(
      provider.listDueForReview(
        { limit: 5, maxChars: 20 },
        { projectId: "workspace", area: "backend" },
      ),
    ).resolves.toEqual({
      entries: [
        expect.objectContaining({
          id: memory.id,
          projectId: "workspace",
          area: "backend",
          content: "Review this decision…",
        }),
      ],
    });

    await expect(
      provider.completeReview(
        {
          memoryId: memory.id,
          nextReviewAt: "2026-11-13T12:00:00.000Z",
          reason: "Confirmed by pi-harness.",
        },
        { projectId: "workspace" },
      ),
    ).resolves.toEqual({
      reviewed: true,
      entryId: memory.id,
      nextReviewAt: "2026-11-13T12:00:00.000Z",
    });
    await expect(
      provider.completeReview(
        {
          memoryId: memory.id,
          nextReviewAt: "2026-12-13T12:00:00.000Z",
        },
        { projectId: "other-workspace" },
      ),
    ).resolves.toEqual({ reviewed: false, reason: "not_due" });
  });
});
