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
});
