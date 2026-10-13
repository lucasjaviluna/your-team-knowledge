import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { MemoryService } from "../../src/application/index.js";
import type { MemoryLifecycleEvent } from "../../src/application/index.js";
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

  it("expands conservative domain synonyms without dropping AND semantics", () => {
    const { service } = createMemoryService();

    service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Guards de rutas",
      content: "Las rutas se protegen con guards de autenticación.",
    });
    service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Despliegues graduales",
      content: "Los despliegues graduales permiten rollback.",
    });

    expect(
      service
        .search({
          workspaceId: "workspace-checkout",
          query: "proteccion rutas autenticadas",
        })
        .map((item) => item.title),
    ).toEqual(["Guards de rutas"]);
    expect(
      service
        .search({
          workspaceId: "workspace-checkout",
          query: "deployment rollback",
        })
        .map((item) => item.title),
    ).toEqual(["Despliegues graduales"]);
    expect(
      service.search({
        workspaceId: "workspace-checkout",
        query: "proteccion rollback",
      }),
    ).toHaveLength(0);
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
    expect(
      service.addRelation({
        sourceMemoryId: second.id,
        targetMemoryId: first.id,
        relation: "supports",
      }),
    ).toEqual(relation);
    expect(service.listRelations(first.id)).toHaveLength(1);
  });

  it("rejects invalid cross-workspace, missing and archived relations", () => {
    const { service } = createMemoryService();
    const first = service.save({
      workspaceId: "workspace-checkout",
      type: "discovery",
      title: "Checkout discovery",
      content: "The checkout uses a BFF.",
    });
    const second = service.save({
      workspaceId: "workspace-other",
      type: "discovery",
      title: "Other discovery",
      content: "The other workspace uses a BFF.",
    });

    expect(() =>
      service.addRelation({
        sourceMemoryId: first.id,
        targetMemoryId: second.id,
        relation: "related",
      }),
    ).toThrow("same workspace");
    expect(() =>
      service.addRelation({
        sourceMemoryId: first.id,
        targetMemoryId: "missing-memory",
        relation: "related",
      }),
    ).toThrow("Both memories must exist");

    service.setStatus(first.id, "archived");
    expect(() =>
      service.addRelation({
        sourceMemoryId: first.id,
        targetMemoryId: first.id,
        relation: "related",
      }),
    ).toThrow("cannot participate");

    const active = service.save({
      workspaceId: "workspace-checkout",
      type: "pattern",
      title: "Active pattern",
      content: "The active pattern can receive relations.",
    });
    const peer = service.save({
      workspaceId: "workspace-checkout",
      type: "discovery",
      title: "Active peer",
      content: "The peer can receive relations.",
    });
    expect(() =>
      service.addRelation({
        sourceMemoryId: active.id,
        targetMemoryId: peer.id,
        relation: "unknown" as never,
      }),
    ).toThrow("Unsupported memory relation type");
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
    service.addRelation({
      sourceMemoryId: retained.id,
      targetMemoryId: expired.id,
      relation: "related",
    });

    expect(service.archiveExpired()).toBe(1);
    expect(repository.findById(expired.id)?.status).toBe("archived");
    expect(() => service.setStatus(expired.id, "active")).toThrow(
      "cannot transition",
    );
    expect(() => service.setStatus(expired.id, "unknown" as never)).toThrow(
      "Unsupported memory status",
    );
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
    expect(service.listRelations(retained.id)).toHaveLength(0);
  });

  it("observes automatic expiry and retention purge events", () => {
    const events: string[] = [];
    const now = new Date("2026-10-13T12:00:00.000Z");
    const { service } = createMemoryService(
      () => now,
      (event) => {
        const memoryId =
          event.type === "status_changed"
            ? event.transition.memory.id
            : event.type === "review_completed"
              ? event.completion.memory.id
              : event.memoryId;
        events.push(`${event.type}:${memoryId}`);
      },
    );
    const expired = service.save({
      workspaceId: "workspace-checkout",
      type: "discovery",
      title: "Expired discovery",
      content: "This discovery is expired.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-10-13T00:00:00.000Z"),
    });

    expect(service.archiveExpired()).toBe(1);
    expect(service.purgeArchived(new Date("2026-10-14T00:00:00.000Z"))).toBe(1);
    expect(events).toEqual([
      `expired_archived:${expired.id}`,
      `purged:${expired.id}`,
    ]);
  });

  it("previews and executes coordinated retention safely", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const { repository, service } = createMemoryService(() => now);
    const expired = service.save({
      workspaceId: "workspace-checkout",
      type: "discovery",
      title: "Expired discovery",
      content: "This discovery is expired.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-10-13T00:00:00.000Z"),
    });
    const archived = service.save({
      workspaceId: "workspace-checkout",
      type: "discovery",
      title: "Archived discovery",
      content: "This discovery is archived.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
    });
    service.setStatus(archived.id, "archived");

    const preview = service.runRetention({
      purgeBefore: new Date("2026-10-14T00:00:00.000Z"),
      workspaceId: "workspace-checkout",
    });
    expect(preview).toEqual({
      dryRun: true,
      workspaceId: "workspace-checkout",
      allWorkspaces: false,
      expiredCandidateIds: [expired.id],
      archivedCount: 0,
      purgeCandidateIds: [archived.id, expired.id],
      purgedCount: 0,
      metrics: {
        expiredCandidates: 1,
        archived: 0,
        purgeCandidates: 2,
        purged: 0,
      },
    });
    expect(repository.findById(expired.id)?.status).toBe("active");
    expect(repository.findById(archived.id)).toBeDefined();

    const executed = service.runRetention({
      purgeBefore: new Date("2026-10-14T00:00:00.000Z"),
      workspaceId: "workspace-checkout",
      dryRun: false,
    });
    expect(executed.expiredCandidateIds).toEqual([expired.id]);
    expect(executed.archivedCount).toBe(1);
    expect(executed.purgeCandidateIds).toEqual(
      expect.arrayContaining([archived.id, expired.id]),
    );
    expect(executed.purgeCandidateIds).toHaveLength(2);
    expect(executed.purgedCount).toBe(2);
    expect(executed.metrics).toEqual({
      expiredCandidates: 1,
      archived: 1,
      purgeCandidates: 2,
      purged: 2,
    });
    expect(repository.findById(expired.id)).toBeUndefined();
    expect(repository.findById(archived.id)).toBeUndefined();
  });

  it("isolates coordinated retention by workspace and requires explicit global scope", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const { repository, service } = createMemoryService(() => now);
    const workspaceA = service.save({
      workspaceId: "workspace-a",
      type: "discovery",
      title: "A expired",
      content: "Workspace A memory.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-10-13T00:00:00.000Z"),
    });
    const workspaceB = service.save({
      workspaceId: "workspace-b",
      type: "discovery",
      title: "B expired",
      content: "Workspace B memory.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-10-13T00:00:00.000Z"),
    });

    expect(() =>
      service.runRetention({
        purgeBefore: new Date("2026-10-14T00:00:00.000Z"),
      }),
    ).toThrow("workspaceId or an explicit allWorkspaces");

    const scoped = service.runRetention({
      workspaceId: "workspace-a",
      purgeBefore: new Date("2026-10-14T00:00:00.000Z"),
      dryRun: false,
    });
    expect(scoped.expiredCandidateIds).toEqual([workspaceA.id]);
    expect(repository.findById(workspaceA.id)).toBeUndefined();
    expect(repository.findById(workspaceB.id)?.status).toBe("active");

    const globalPreview = service.runRetention({
      allWorkspaces: true,
      purgeBefore: new Date("2026-10-14T00:00:00.000Z"),
    });
    expect(globalPreview.allWorkspaces).toBe(true);
    expect(globalPreview.expiredCandidateIds).toEqual([workspaceB.id]);
  });

  it("creates a restorable SQLite backup without changing the source", async () => {
    const directory = mkdtempSync(join(tmpdir(), "agent-memory-backup-"));
    const sourceFile = join(directory, "source.sqlite");
    const backupFile = join(directory, "backup.sqlite");
    const source = new SqliteAgentMemoryRepository(sourceFile);
    const service = new MemoryService(source);
    const saved = service.save({
      workspaceId: "workspace-a",
      type: "decision",
      title: "Backup operativo",
      content: "La base local debe poder restaurarse.",
    });

    const result = await source.backup(backupFile);
    expect(result.destinationFile).toBe(backupFile);
    expect(result.totalPages).toBeGreaterThan(0);
    expect(result.remainingPages).toBe(0);
    expect(existsSync(backupFile)).toBe(true);
    await expect(source.backup(backupFile)).rejects.toThrow(
      "destinationFile already exists",
    );
    await expect(
      source.backup(backupFile, { overwrite: true }),
    ).resolves.toMatchObject({ destinationFile: backupFile });
    expect(
      service.search({ workspaceId: "workspace-a", query: "restaurarse" }),
    ).toHaveLength(1);
    source.close();

    const restored = new SqliteAgentMemoryRepository(backupFile);
    expect(restored.findById(saved.id)?.content).toBe(
      "La base local debe poder restaurarse.",
    );
    restored.close();
  });

  it("rejects an empty or same-file backup destination", async () => {
    const directory = mkdtempSync(join(tmpdir(), "agent-memory-backup-"));
    temporaryDirectories.push(directory);
    const filename = join(directory, "source.sqlite");
    const repository = new SqliteAgentMemoryRepository(filename);
    resources.push(repository);

    await expect(repository.backup(" ")).rejects.toThrow(
      "destinationFile is required",
    );
    await expect(repository.backup(filename)).rejects.toThrow(
      "destinationFile must differ",
    );
  });

  it("returns and observes lifecycle transition reasons", () => {
    const events: Array<{ type: string; status: string; reason: string }> = [];
    const { service } = createMemoryService(undefined, (event) => {
      if (event.type === "status_changed") {
        events.push({
          type: event.type,
          status: event.transition.status,
          reason: event.transition.reason,
        });
      }
    });
    const memory = service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Reviewable decision",
      content: "This decision needs a review cycle.",
    });

    const transition = service.transitionStatus({
      memoryId: memory.id,
      status: "needs_review",
      reason: "Scheduled review requested by the agent.",
    });

    expect(transition.previousStatus).toBe("active");
    expect(transition.status).toBe("needs_review");
    expect(transition.reason).toBe("Scheduled review requested by the agent.");
    expect(transition.changed).toBe(true);
    expect(events).toEqual([
      {
        type: "status_changed",
        status: "needs_review",
        reason: "Scheduled review requested by the agent.",
      },
    ]);
  });

  it("completes a due review and schedules the next review", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const events: string[] = [];
    const { service, repository } = createMemoryService(
      () => now,
      (event) => events.push(event.type),
    );
    const memory = service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Reviewable decision",
      content: "This decision must be reviewed periodically.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      reviewAt: new Date("2026-10-12T00:00:00.000Z"),
    });

    const completion = service.completeReview({
      memoryId: memory.id,
      nextReviewAt: new Date("2026-11-13T12:00:00.000Z"),
      reason: "Decision confirmed during the scheduled review.",
    });

    expect(completion.previousStatus).toBe("active");
    expect(completion.status).toBe("active");
    expect(completion.reviewAt.toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(repository.findById(memory.id)?.reviewAt?.toISOString()).toBe(
      "2026-11-13T12:00:00.000Z",
    );
    expect(service.listDueForReview("workspace-checkout")).toHaveLength(0);
    expect(events).toEqual(["review_completed"]);
  });

  it("creates a bounded summary with source relations and optional archival", () => {
    const { repository, service } = createMemoryService();
    const first = service.save({
      workspaceId: "workspace-checkout",
      type: "discovery",
      title: "BFF boundary",
      content: "The checkout frontend calls the BFF.",
      tags: ["checkout"],
    });
    const second = service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Keep the boundary",
      content: "The BFF remains the integration boundary.",
      tags: ["architecture"],
    });

    const result = service.compact({
      workspaceId: "workspace-checkout",
      memoryIds: [first.id, second.id],
      title: "Checkout summary",
      maxChars: 200,
      archiveSources: true,
    });

    expect(result.summary.type).toBe("summary");
    expect(result.summary.content.length).toBeLessThanOrEqual(200);
    expect(result.archivedSourceIds).toEqual([first.id, second.id]);
    expect(repository.findById(first.id)?.status).toBe("archived");
    expect(repository.findById(second.id)?.status).toBe("archived");
    expect(service.listRelations(result.summary.id)).toHaveLength(2);
    expect(
      service.search({
        workspaceId: "workspace-checkout",
        query: "checkout summary",
      }),
    ).toHaveLength(1);
  });

  it("reuses the same compact summary for the same sources", () => {
    const { service } = createMemoryService();
    const source = service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Stable boundary",
      content: "The BFF remains the boundary.",
    });

    const first = service.compact({
      workspaceId: "workspace-checkout",
      memoryIds: [source.id],
      title: "Boundary summary",
    });
    const second = service.compact({
      workspaceId: "workspace-checkout",
      memoryIds: [source.id],
      title: "Boundary summary",
    });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.summary.id).toBe(first.summary.id);
    expect(
      service.search({
        workspaceId: "workspace-checkout",
        query: "Boundary summary",
      }),
    ).toHaveLength(1);
  });

  it("reports lifecycle counts and temporal signals", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const { service } = createMemoryService(() => now);
    service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Future",
      content: "Future decision.",
      validFrom: new Date("2026-10-14T00:00:00.000Z"),
    });
    service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Expired",
      content: "Expired decision.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-10-12T00:00:00.000Z"),
    });
    const review = service.save({
      workspaceId: "workspace-checkout",
      type: "decision",
      title: "Review",
      content: "Review decision.",
      validFrom: new Date("2026-10-01T00:00:00.000Z"),
      reviewAt: new Date("2026-10-12T00:00:00.000Z"),
    });
    service.setStatus(review.id, "needs_review");

    expect(service.inspectLifecycle("workspace-checkout")).toEqual({
      total: 3,
      byStatus: { active: 2, needs_review: 1, superseded: 0, archived: 0 },
      future: 1,
      expired: 1,
      dueForReview: 0,
    });
  });

  it("previews archived retention before purging and requires explicit execution", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const { repository, service } = createMemoryService(() => now);
    const archived = service.save({
      workspaceId: "workspace-checkout",
      type: "discovery",
      title: "Old discovery",
      content: "This discovery is retained temporarily.",
    });
    service.setStatus(archived.id, "archived");

    const preview = service.purgeArchivedWithPlan({
      before: new Date("2026-10-14T00:00:00.000Z"),
    });
    expect(preview.dryRun).toBe(true);
    expect(preview.candidateIds).toEqual([archived.id]);
    expect(preview.purgedCount).toBe(0);
    expect(repository.findById(archived.id)).toBeDefined();

    const executed = service.purgeArchivedWithPlan({
      before: new Date("2026-10-14T00:00:00.000Z"),
      dryRun: false,
    });
    expect(executed.purgedCount).toBe(1);
    expect(repository.findById(archived.id)).toBeUndefined();
  });

  it("migrates a legacy SQLite memory table with lifecycle columns", () => {
    const directory = mkdtempSync(join(tmpdir(), "corporate-knowledge-"));
    temporaryDirectories.push(directory);
    const filename = join(directory, "legacy.sqlite");
    const legacy = new Database(filename);
    legacy.exec(`
      CREATE TABLE memory_items (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        session_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        subject_key TEXT,
        tags_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO memory_items VALUES (
        'legacy-memory', 'workspace-checkout', NULL, 'decision',
        'Legacy decision', 'Keep the legacy boundary.',
        'architecture/legacy', '["legacy"]', 'active',
        '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'
      );
    `);
    legacy.close();

    const repository = new SqliteAgentMemoryRepository(filename);
    resources.push(repository);

    const migrated = repository.findById("legacy-memory");
    expect(migrated?.validFrom?.toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(migrated?.expiresAt).toBeUndefined();
    expect(
      repository.findActiveBySubjectKey(
        "workspace-checkout",
        "architecture/legacy",
      )?.id,
    ).toBe("legacy-memory");
  });

  it("rejects compaction across workspaces and invalid budgets", () => {
    const { service } = createMemoryService();
    const memory = service.save({
      workspaceId: "workspace-checkout",
      type: "discovery",
      title: "Checkout discovery",
      content: "A local discovery.",
    });

    expect(() =>
      service.compact({
        workspaceId: "workspace-other",
        memoryIds: [memory.id],
      }),
    ).toThrow("belongs to another workspace");
    expect(() =>
      service.compact({
        workspaceId: "workspace-checkout",
        memoryIds: [memory.id],
        maxChars: 100,
      }),
    ).toThrow("between 200 and 20000");
  });
});

function createMemoryService(
  now?: () => Date,
  lifecycleObserver?: (event: MemoryLifecycleEvent) => void,
) {
  const directory = mkdtempSync(join(tmpdir(), "corporate-knowledge-"));
  temporaryDirectories.push(directory);
  const repository = new SqliteAgentMemoryRepository(
    join(directory, "agent-memory.sqlite"),
  );
  resources.push(repository);
  const service = new MemoryService(
    repository,
    now,
    undefined,
    lifecycleObserver,
  );

  return { repository, service };
}
