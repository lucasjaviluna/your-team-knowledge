import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MemoryService, PiHarnessMemoryProtocol } from "../../src/index.js";
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

describe("PiHarnessMemoryProtocol", () => {
  it("bootstraps recall, stores idempotently, and finishes with a summary", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pi-memory-protocol-"));
    const repository = new SqliteAgentMemoryRepository(
      join(directory, "memory.db"),
    );
    resources.push({ repository, directory });
    const events: string[] = [];
    const protocol = new PiHarnessMemoryProtocol(
      new MemoryService(repository),
      undefined,
      {
        observe: (event) => events.push(`${event.operation}:${event.outcome}`),
      },
    );

    const context = { projectId: "workspace", area: "backend" };
    const first = await protocol.remember(context, {
      type: "decision",
      subjectKey: "auth/model",
      title: "Authentication model",
      content: "Use bearer authentication at the HTTP boundary.",
    });
    const second = await protocol.remember(context, {
      type: "decision",
      subjectKey: "auth/model",
      title: "Authentication model updated",
      content: "Use short-lived bearer authentication at the HTTP boundary.",
    });
    const bootstrapped = await protocol.bootstrap(context, {
      query: "authentication",
      maxChars: 100,
    });
    const finished = await protocol.finish(context, {
      sessionId: bootstrapped.sessionId,
      summary: "Confirmed the authentication model.",
    });

    expect(first.stored).toBe(true);
    expect(second.entryId).toBe(first.entryId);
    expect(bootstrapped.entries).toHaveLength(1);
    expect(finished.summaryStored).toBe(true);
    expect(events).toEqual([
      "remember:success",
      "remember:success",
      "bootstrap:success",
      "remember:success",
      "finish:success",
    ]);
  });
});
