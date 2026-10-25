import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AgentMemoryProtocol,
  MemoryService,
  SqliteAgentMemoryProvider,
  SqliteAgentMemoryRepository,
} from "../../src/index.js";

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

describe("AgentMemoryProtocol", () => {
  it("provides idempotent, project-scoped memory without runtime dependencies", async () => {
    const directory = mkdtempSync(join(tmpdir(), "agent-memory-protocol-"));
    const repository = new SqliteAgentMemoryRepository(
      join(directory, "memory.db"),
    );
    resources.push({ repository, directory });
    const provider = new SqliteAgentMemoryProvider(
      new MemoryService(repository),
    );
    const protocol = new AgentMemoryProtocol(provider);
    const project = { projectId: "project-a", area: "backend" };

    const first = await protocol.remember(project, {
      type: "decision",
      subjectKey: "architecture/auth",
      title: "Authentication model",
      content: "Use short-lived bearer tokens.",
    });
    const updated = await protocol.remember(project, {
      type: "decision",
      subjectKey: "architecture/auth",
      title: "Authentication model updated",
      content: "Use short-lived bearer tokens at the HTTP boundary.",
    });
    const session = await protocol.bootstrap(project, {
      query: "authentication",
    });
    const otherArea = await provider.save(
      {
        type: "decision",
        subjectKey: "architecture/frontend-auth",
        title: "Frontend authentication",
        content: "Use the browser session for authentication.",
        area: "frontend",
      },
      { projectId: "project-a" },
    );
    const finished = await protocol.finish(project, {
      sessionId: session.sessionId,
      summary: "Authentication decision confirmed.",
    });

    expect(updated.entryId).toBe(first.entryId);
    expect(session.entries).toHaveLength(1);
    expect(session.entries[0]).toEqual(
      expect.objectContaining({
        projectId: "project-a",
        type: "decision",
        area: "backend",
      }),
    );
    expect(finished.summaryStored).toBe(true);
    await expect(
      provider.get(first.entryId!, { projectId: "project-b" }),
    ).resolves.toBeUndefined();
    await expect(
      provider.get(otherArea.entryId!, project),
    ).resolves.toBeUndefined();
    await expect(
      provider.finishSession(
        { sessionId: session.sessionId },
        { projectId: "project-b" },
      ),
    ).rejects.toThrow("was not found");
    await expect(
      provider.save(
        {
          type: "discovery",
          title: "Cross-project session",
          content: "This write must be rejected.",
          sessionId: session.sessionId,
        },
        { projectId: "project-b" },
      ),
    ).rejects.toThrow("was not found");
  });
});
