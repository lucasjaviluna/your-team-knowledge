import type { MemoryService } from "../application/index.js";
import type { MemoryItemType } from "../domain/index.js";

export interface PiHarnessMemoryEntry {
  id: string;
  projectId: string;
  title: string;
  content: string;
  source: string;
  area?: string;
  tags: string[];
  score?: number;
}

export interface PiHarnessMemoryQuery {
  query: string;
  area?: string;
  limit: number;
  maxChars: number;
}

export interface PiHarnessMemorySearchResult {
  entries: PiHarnessMemoryEntry[];
  warnings?: string[];
}

export interface PiHarnessMemoryReviewQuery {
  limit: number;
  maxChars: number;
}

export interface PiHarnessMemoryWriteRequest {
  idempotencyKey?: string;
  title: string;
  content: string;
  source: string;
  area?: string;
  tags: string[];
}

export interface PiHarnessMemoryContext {
  projectId: string;
  area?: string;
}

export interface PiHarnessMemoryReviewRequest {
  memoryId: string;
  nextReviewAt: string;
  reason?: string;
}

export interface PiHarnessMemoryReviewResult {
  reviewed: boolean;
  entryId?: string;
  nextReviewAt?: string;
  reason?: "not_due";
}

/** Implements pi-harness' provider-neutral MemoryProvider contract over SQLite. */
export class PiHarnessMemoryProvider {
  readonly id = "agent-memory-sqlite";

  constructor(private readonly memory: MemoryService) {}

  async isAvailable(context: PiHarnessMemoryContext): Promise<boolean> {
    void context;
    return true;
  }

  async search(
    query: PiHarnessMemoryQuery,
    context: PiHarnessMemoryContext,
  ): Promise<PiHarnessMemorySearchResult> {
    const items = this.memory.search({
      workspaceId: context.projectId,
      query: query.query,
      limit: query.limit,
    });
    const entries = items.map((item) =>
      toProviderEntry(item, context, query.maxChars, query.area),
    );
    return { entries };
  }

  async listDueForReview(
    query: PiHarnessMemoryReviewQuery,
    context: PiHarnessMemoryContext,
  ): Promise<PiHarnessMemorySearchResult> {
    const items = this.memory
      .listDueForReview(context.projectId)
      .slice(0, query.limit);
    return {
      entries: items.map((item) =>
        toProviderEntry(item, context, query.maxChars),
      ),
    };
  }

  async store(
    entry: PiHarnessMemoryWriteRequest,
    context: PiHarnessMemoryContext,
  ): Promise<{
    stored: boolean;
    entryId?: string;
    reason?: "duplicate" | "rejected" | "unavailable";
  }> {
    const item = this.memory.save({
      workspaceId: context.projectId,
      type: inferMemoryType(entry.tags),
      title: entry.title,
      content: entry.content,
      ...(entry.idempotencyKey ? { subjectKey: entry.idempotencyKey } : {}),
      tags: [
        ...entry.tags,
        entry.source ? `source:${entry.source}` : "",
        ...(entry.area ? [`area:${entry.area}`] : []),
      ],
    });
    return { stored: true, entryId: item.id };
  }

  async completeReview(
    request: PiHarnessMemoryReviewRequest,
    context: PiHarnessMemoryContext,
  ): Promise<PiHarnessMemoryReviewResult> {
    const due = this.memory
      .listDueForReview(context.projectId)
      .some((item) => item.id === request.memoryId);
    if (!due) {
      return { reviewed: false, reason: "not_due" };
    }

    const completion = this.memory.completeReview({
      memoryId: request.memoryId,
      nextReviewAt: new Date(request.nextReviewAt),
      ...(request.reason ? { reason: request.reason } : {}),
    });
    return {
      reviewed: true,
      entryId: completion.memory.id,
      nextReviewAt: completion.reviewAt.toISOString(),
    };
  }
}

function toProviderEntry(
  item: {
    id: string;
    workspaceId: string;
    title: string;
    content: string;
    tags: readonly string[];
  },
  context: PiHarnessMemoryContext,
  maxChars: number,
  requestedArea?: string,
): PiHarnessMemoryEntry {
  const area = context.area ?? requestedArea;
  return {
    id: item.id,
    projectId: item.workspaceId,
    title: item.title,
    content: limitText(item.content, maxChars),
    source: "agent-memory:sqlite",
    ...(area ? { area } : {}),
    tags: [...item.tags],
  };
}

function inferMemoryType(tags: readonly string[]): MemoryItemType {
  const type = tags.find((tag) =>
    ["decision", "discovery", "pattern", "preference", "summary"].includes(tag),
  );
  return (type as MemoryItemType | undefined) ?? "discovery";
}

function limitText(value: string, maxChars: number): string {
  if (!Number.isInteger(maxChars) || maxChars < 1) return value;
  return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
}
