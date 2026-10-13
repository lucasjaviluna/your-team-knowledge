import { createHash, randomUUID } from "node:crypto";

import type {
  MemoryItem,
  MemoryRelation,
  MemoryRelationType,
  MemorySession,
} from "../../domain/index.js";

import type {
  MemoryRepository,
  AddMemoryRelationInput,
  CompactMemoryInput,
  CompactMemoryResult,
  EndSessionInput,
  SaveMemoryInput,
  SearchMemoryInput,
  StartSessionInput,
  MemoryLifecycleSnapshot,
  MemoryLifecycleObserver,
  MemoryStatusTransition,
  PurgeArchivedInput,
  PurgeArchivedResult,
  RunMemoryRetentionInput,
  RunMemoryRetentionResult,
  TransitionMemoryStatusInput,
} from "./contracts.js";
import { detectSensitiveContent } from "../governance.js";

export class MemoryService {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID,
    private readonly lifecycleObserver?: MemoryLifecycleObserver,
  ) {}

  save(input: SaveMemoryInput): MemoryItem {
    const workspaceId = requireText(input.workspaceId, "workspaceId");
    const title = requireText(input.title, "title");
    const content = requireText(input.content, "content");
    if (detectSensitiveContent(`${title}\n${content}`).length > 0) {
      throw new Error("Sensitive content detected in memory.");
    }
    const subjectKey = optionalText(input.subjectKey);
    const now = this.now();
    const requestedStatus = requireMemoryStatus(input.status ?? "active");
    const existing = subjectKey
      ? this.repository.findActiveBySubjectKey(workspaceId, subjectKey, now)
      : undefined;
    const expiresAt = input.expiresAt ?? existing?.expiresAt;
    const reviewAt = input.reviewAt ?? existing?.reviewAt;
    const archivedAt =
      input.status === "archived" || existing?.status === "archived"
        ? (existing?.archivedAt ?? now)
        : undefined;

    const item: MemoryItem = {
      id: existing?.id ?? this.idGenerator(),
      workspaceId,
      ...(input.sessionId
        ? { sessionId: requireText(input.sessionId, "sessionId") }
        : {}),
      type: input.type,
      title,
      content,
      ...(subjectKey ? { subjectKey } : {}),
      tags: normalizeTags(input.tags),
      status: requestedStatus,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      validFrom: input.validFrom ?? existing?.validFrom ?? now,
      ...(expiresAt ? { expiresAt } : {}),
      ...(reviewAt ? { reviewAt } : {}),
      ...(archivedAt ? { archivedAt } : {}),
    };

    validateLifecycle(item);

    if (existing) {
      this.repository.update(item);
    } else {
      this.repository.insert(item);
    }

    return item;
  }

  search(input: SearchMemoryInput): readonly MemoryItem[] {
    const query = requireText(input.query, "query");

    return this.repository.search({
      workspaceId: requireText(input.workspaceId, "workspaceId"),
      query,
      limit: input.limit ?? 20,
      includeNeedsReview: input.includeNeedsReview ?? false,
      asOf: input.asOf ?? this.now(),
    });
  }

  compact(input: CompactMemoryInput): CompactMemoryResult {
    const workspaceId = requireText(input.workspaceId, "workspaceId");
    const memoryIds = [
      ...new Set(input.memoryIds.map((id) => id.trim())),
    ].filter(Boolean);
    const maxChars = input.maxChars ?? 2_000;

    if (memoryIds.length === 0) {
      throw new Error("memoryIds must contain at least one memory id.");
    }
    if (!Number.isInteger(maxChars) || maxChars < 200 || maxChars > 20_000) {
      throw new Error("maxChars must be an integer between 200 and 20000.");
    }

    const sources = memoryIds.map((memoryId) => {
      const item = this.repository.findById(requireText(memoryId, "memoryId"));
      if (!item) {
        throw new Error(`Memory '${memoryId}' was not found.`);
      }
      if (item.workspaceId !== workspaceId) {
        throw new Error(`Memory '${memoryId}' belongs to another workspace.`);
      }
      if (item.status === "archived") {
        throw new Error(
          `Memory '${memoryId}' is archived and cannot be compacted.`,
        );
      }
      return item;
    });

    const title =
      input.title?.trim() || `Resumen compacto (${sources.length} memorias)`;
    const subjectKey =
      input.subjectKey?.trim() ||
      `compaction/${createHash("sha256")
        .update(`${workspaceId}\n${title}\n${[...memoryIds].sort().join(",")}`)
        .digest("hex")
        .slice(0, 24)}`;
    const existingSummary = this.repository.findActiveBySubjectKey(
      workspaceId,
      subjectKey,
      this.now(),
    );
    const content = buildCompactContent(sources, maxChars);
    const summary = this.save({
      workspaceId,
      type: "summary",
      title,
      content,
      subjectKey,
      tags: [
        "compacted",
        ...sources.flatMap((source) => source.tags),
        ...(input.tags ?? []),
      ],
    });

    for (const source of sources) {
      this.addRelation({
        sourceMemoryId: summary.id,
        targetMemoryId: source.id,
        relation: "related",
      });
    }

    const archivedSourceIds: string[] = [];
    if (input.archiveSources ?? false) {
      for (const source of sources) {
        this.setStatus(source.id, "archived");
        archivedSourceIds.push(source.id);
      }
    }

    return {
      summary,
      sources,
      archivedSourceIds,
      reused: Boolean(existingSummary),
    };
  }

  inspectLifecycle(workspaceId?: string): MemoryLifecycleSnapshot {
    return this.repository.inspectLifecycle(this.now(), workspaceId);
  }

  setStatus(memoryId: string, status: MemoryItem["status"]): MemoryItem {
    return this.transitionStatus({ memoryId, status }).memory;
  }

  transitionStatus(input: TransitionMemoryStatusInput): MemoryStatusTransition {
    const normalizedId = requireText(input.memoryId, "memoryId");
    const item = this.repository.findById(normalizedId);

    if (!item) {
      throw new Error(`Memory '${normalizedId}' was not found.`);
    }

    const nextStatus = requireMemoryStatus(input.status);
    assertStatusTransition(item.status, nextStatus);
    const now = this.now();
    const updated: MemoryItem = {
      ...item,
      status: nextStatus,
      updatedAt: now,
      ...(nextStatus === "archived"
        ? { archivedAt: item.archivedAt ?? now }
        : {}),
    };
    validateLifecycle(updated);
    this.repository.update(updated);
    const transition: MemoryStatusTransition = {
      memory: updated,
      previousStatus: item.status,
      status: nextStatus,
      reason:
        optionalText(input.reason) ??
        `status transition: ${item.status} -> ${nextStatus}`,
      changed: item.status !== nextStatus,
      occurredAt: now,
    };
    this.lifecycleObserver?.({ type: "status_changed", transition });
    return transition;
  }

  listDueForReview(workspaceId?: string): readonly MemoryItem[] {
    return this.repository.listDueForReview(this.now(), workspaceId);
  }

  archiveExpired(workspaceId?: string): number {
    const occurredAt = this.now();
    const candidateIds = this.repository.listExpiredIds(
      occurredAt,
      workspaceId,
    );
    const archivedCount = this.repository.archiveExpired(
      occurredAt,
      workspaceId,
    );

    for (const memoryId of candidateIds) {
      const memory = this.repository.findById(memoryId);
      if (memory?.status === "archived") {
        this.lifecycleObserver?.({
          type: "expired_archived",
          memoryId,
          workspaceId: memory.workspaceId,
          previousStatus: "active",
          status: "archived",
          reason: "expired",
          occurredAt,
        });
      }
    }

    return archivedCount;
  }

  purgeArchived(before: Date, workspaceId?: string): number {
    if (Number.isNaN(before.getTime())) {
      throw new Error("before must be a valid date.");
    }

    const occurredAt = this.now();
    const candidateIds = this.repository.listArchivedIds(before, workspaceId);
    const candidates = candidateIds
      .map((memoryId) => this.repository.findById(memoryId))
      .filter((memory): memory is MemoryItem => Boolean(memory));
    const purgedCount = this.repository.purgeArchived(before, workspaceId);

    for (const memory of candidates) {
      if (!this.repository.findById(memory.id)) {
        this.lifecycleObserver?.({
          type: "purged",
          memoryId: memory.id,
          workspaceId: memory.workspaceId,
          previousStatus: "archived",
          status: "purged",
          reason: "retention",
          occurredAt,
        });
      }
    }

    return purgedCount;
  }

  purgeArchivedWithPlan(input: PurgeArchivedInput): PurgeArchivedResult {
    if (Number.isNaN(input.before.getTime())) {
      throw new Error("before must be a valid date.");
    }

    const candidateIds = this.repository.listArchivedIds(input.before);
    const dryRun = input.dryRun ?? true;
    const purgedCount = dryRun ? 0 : this.purgeArchived(input.before);

    return { before: input.before, dryRun, candidateIds, purgedCount };
  }

  runRetention(input: RunMemoryRetentionInput): RunMemoryRetentionResult {
    if (Number.isNaN(input.purgeBefore.getTime())) {
      throw new Error("purgeBefore must be a valid date.");
    }

    const workspaceId = optionalText(input.workspaceId);
    const allWorkspaces = input.allWorkspaces === true;
    if ((workspaceId ? 1 : 0) + (allWorkspaces ? 1 : 0) !== 1) {
      throw new Error(
        "Retention requires workspaceId or an explicit allWorkspaces: true.",
      );
    }

    const dryRun = input.dryRun ?? true;
    const asOf = this.now();
    const expiredCandidateIds = this.repository.listExpiredIds(
      asOf,
      workspaceId,
    );
    const existingPurgeCandidateIds = this.repository.listArchivedIds(
      input.purgeBefore,
      workspaceId,
    );
    const projectedPurgeCandidateIds = [
      ...existingPurgeCandidateIds,
      ...(input.purgeBefore > asOf ? expiredCandidateIds : []),
    ].filter((id, index, ids) => ids.indexOf(id) === index);
    if (dryRun) {
      return {
        dryRun: true,
        ...(workspaceId ? { workspaceId } : {}),
        allWorkspaces,
        expiredCandidateIds,
        archivedCount: 0,
        purgeCandidateIds: projectedPurgeCandidateIds,
        purgedCount: 0,
      };
    }

    const archivedCount = this.archiveExpired(workspaceId);
    const purgeCandidateIds = this.repository.listArchivedIds(
      input.purgeBefore,
      workspaceId,
    );
    const purgedCount = this.purgeArchived(input.purgeBefore, workspaceId);

    return {
      dryRun: false,
      ...(workspaceId ? { workspaceId } : {}),
      allWorkspaces,
      expiredCandidateIds,
      archivedCount,
      purgeCandidateIds,
      purgedCount,
    };
  }

  startSession(input: StartSessionInput): MemorySession {
    const session: MemorySession = {
      id: this.idGenerator(),
      workspaceId: requireText(input.workspaceId, "workspaceId"),
      startedAt: this.now(),
    };
    this.repository.insertSession(session);
    return session;
  }

  endSession(input: EndSessionInput): MemorySession {
    const sessionId = requireText(input.sessionId, "sessionId");
    const existing = this.repository.findSession(sessionId);

    if (!existing) {
      throw new Error(`Session '${sessionId}' was not found.`);
    }

    const endedAt = this.now();
    this.repository.endSession(sessionId, endedAt, optionalText(input.summary));

    return {
      ...existing,
      ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
      endedAt,
    };
  }

  addRelation(input: AddMemoryRelationInput): MemoryRelation {
    const sourceMemoryId = requireText(input.sourceMemoryId, "sourceMemoryId");
    const targetMemoryId = requireText(input.targetMemoryId, "targetMemoryId");
    const source = this.repository.findById(sourceMemoryId);
    const target = this.repository.findById(targetMemoryId);

    if (!source || !target) {
      throw new Error("Both memories must exist before creating a relation.");
    }
    if (source.workspaceId !== target.workspaceId) {
      throw new Error("Related memories must belong to the same workspace.");
    }
    if (source.status === "archived" || target.status === "archived") {
      throw new Error("Archived memories cannot participate in new relations.");
    }

    const relation: MemoryRelation = {
      sourceMemoryId,
      targetMemoryId,
      relation: requireRelationType(input.relation),
      createdAt: this.now(),
    };

    if (relation.sourceMemoryId === relation.targetMemoryId) {
      throw new Error("A memory cannot relate to itself.");
    }

    const existing = this.repository
      .listRelations(sourceMemoryId)
      .find(
        (candidate) =>
          candidate.targetMemoryId === targetMemoryId &&
          candidate.relation === relation.relation,
      );
    if (existing) {
      return existing;
    }

    this.repository.addRelation(relation);
    return relation;
  }

  listRelations(memoryId: string): readonly MemoryRelation[] {
    return this.repository.listRelations(requireText(memoryId, "memoryId"));
  }
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${name} is required.`);
  }

  return normalized;
}

function requireRelationType(value: unknown): MemoryRelationType {
  if (
    value !== "related" &&
    value !== "supports" &&
    value !== "conflicts_with" &&
    value !== "supersedes"
  ) {
    throw new Error(`Unsupported memory relation type: '${String(value)}'.`);
  }

  return value;
}

function requireMemoryStatus(value: unknown): MemoryItem["status"] {
  if (
    value !== "active" &&
    value !== "needs_review" &&
    value !== "superseded" &&
    value !== "archived"
  ) {
    throw new Error(`Unsupported memory status: '${String(value)}'.`);
  }

  return value;
}

function assertStatusTransition(
  current: MemoryItem["status"],
  next: MemoryItem["status"],
): void {
  const allowed: Record<MemoryItem["status"], readonly MemoryItem["status"][]> =
    {
      active: ["active", "needs_review", "superseded", "archived"],
      needs_review: ["needs_review", "active", "superseded", "archived"],
      superseded: ["superseded", "archived"],
      archived: ["archived"],
    };

  if (!allowed[current].includes(next)) {
    throw new Error(
      `Memory status cannot transition from '${current}' to '${next}'.`,
    );
  }
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeTags(tags: readonly string[] | undefined): readonly string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function validateLifecycle(item: MemoryItem): void {
  const validFrom = item.validFrom ?? item.createdAt;

  if (Number.isNaN(validFrom.getTime())) {
    throw new Error("validFrom must be a valid date.");
  }

  if (item.expiresAt && Number.isNaN(item.expiresAt.getTime())) {
    throw new Error("expiresAt must be a valid date.");
  }

  if (item.reviewAt && Number.isNaN(item.reviewAt.getTime())) {
    throw new Error("reviewAt must be a valid date.");
  }

  if (item.expiresAt && item.expiresAt <= validFrom) {
    throw new Error("expiresAt must be after validFrom.");
  }

  if (item.reviewAt && item.reviewAt < validFrom) {
    throw new Error("reviewAt must be on or after validFrom.");
  }
}

function buildCompactContent(
  sources: readonly MemoryItem[],
  maxChars: number,
): string {
  const header = `Resumen automático de ${sources.length} memorias. Fuentes: ${sources.map((source) => source.id).join(", ")}.`;
  const lines = [header];

  for (const source of sources) {
    const line = `- ${source.title}: ${source.content}`;
    const candidate = `${lines.join("\n")}\n${line}`;
    if (candidate.length <= maxChars) {
      lines.push(line);
      continue;
    }

    const remaining = maxChars - lines.join("\n").length - 5;
    if (remaining > 20) {
      lines.push(`${line.slice(0, remaining)}…`);
    }
    break;
  }

  return lines.join("\n").slice(0, maxChars);
}
