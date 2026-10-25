import { randomUUID } from "node:crypto";
import type { MemoryService } from "../application/index.js";
import type {
  MemoryItem,
  MemoryItemStatus,
  MemoryItemType,
} from "../domain/index.js";

export interface AgentMemoryContext {
  projectId: string;
  area?: string;
  sessionOwnerId?: string;
}

export interface AgentMemoryEntry {
  id: string;
  projectId: string;
  type: MemoryItemType;
  title: string;
  content: string;
  source: string;
  area?: string;
  tags: string[];
  status: MemoryItemStatus;
  createdAt: string;
  updatedAt: string;
  score?: number;
}

export interface AgentMemorySearchRequest {
  query: string;
  area?: string;
  limit?: number;
  maxChars?: number;
}

export interface AgentMemorySearchResult {
  entries: AgentMemoryEntry[];
  warnings?: string[];
}

export interface AgentMemorySaveRequest {
  subjectKey?: string;
  title: string;
  content: string;
  source?: string;
  area?: string;
  tags?: readonly string[];
  type: MemoryItemType;
  sessionId?: string;
}

export interface AgentMemorySaveResult {
  stored: boolean;
  entryId?: string;
  reason?: "duplicate" | "rejected" | "unavailable";
}

export interface AgentMemoryReviewRequest {
  memoryId: string;
  nextReviewAt: string;
  reason?: string;
}

export interface AgentMemoryReviewResult {
  reviewed: boolean;
  entryId?: string;
  nextReviewAt?: string;
  reason?: "not_due";
}

export interface AgentMemorySessionFinishRequest {
  sessionId: string;
  summary?: string;
}

export interface AgentMemorySessionResult {
  sessionId: string;
}

/** Provider-neutral contract used by agent runtimes and transports. */
export interface AgentMemoryProvider {
  readonly id: string;
  isAvailable(context: AgentMemoryContext): Promise<boolean>;
  search(
    request: AgentMemorySearchRequest,
    context: AgentMemoryContext,
  ): Promise<AgentMemorySearchResult>;
  get(
    memoryId: string,
    context: AgentMemoryContext,
    maxChars?: number,
  ): Promise<AgentMemoryEntry | undefined>;
  save(
    request: AgentMemorySaveRequest,
    context: AgentMemoryContext,
  ): Promise<AgentMemorySaveResult>;
  startSession(context: AgentMemoryContext): Promise<AgentMemorySessionResult>;
  finishSession(
    request: AgentMemorySessionFinishRequest,
    context: AgentMemoryContext,
  ): Promise<AgentMemorySessionResult>;
  listDueForReview(
    request: { limit?: number; maxChars?: number },
    context: AgentMemoryContext,
  ): Promise<AgentMemorySearchResult>;
  completeReview(
    request: AgentMemoryReviewRequest,
    context: AgentMemoryContext,
  ): Promise<AgentMemoryReviewResult>;
}

/** SQLite-backed implementation of the provider-neutral contract. */
export class SqliteAgentMemoryProvider implements AgentMemoryProvider {
  readonly id = "agent-memory-sqlite";

  private readonly sessionOwnerId: string;

  constructor(
    protected readonly memory: MemoryService,
    sessionOwnerId = randomUUID(),
  ) {
    this.sessionOwnerId = sessionOwnerId;
  }

  async isAvailable(context: AgentMemoryContext): Promise<boolean> {
    void context;
    return true;
  }

  async search(
    request: AgentMemorySearchRequest,
    context: AgentMemoryContext,
  ): Promise<AgentMemorySearchResult> {
    const requestedLimit = request.limit ?? 20;
    const area = request.area ?? context.area;
    const items = this.memory.search({
      workspaceId: context.projectId,
      query: request.query,
      limit: area ? Math.max(requestedLimit, 100) : requestedLimit,
    });
    return {
      entries: items
        .filter((item) => isVisibleInArea(item, area))
        .slice(0, requestedLimit)
        .map((item) =>
          toAgentMemoryEntry(item, request.maxChars ?? 4_000, area),
        ),
    };
  }

  async get(
    memoryId: string,
    context: AgentMemoryContext,
    maxChars = 20_000,
  ): Promise<AgentMemoryEntry | undefined> {
    const item = this.memory.get(memoryId, context.projectId);
    return item && isVisibleInArea(item, context.area)
      ? toAgentMemoryEntry(item, maxChars, context.area)
      : undefined;
  }

  async save(
    request: AgentMemorySaveRequest,
    context: AgentMemoryContext,
  ): Promise<AgentMemorySaveResult> {
    const item = this.memory.save({
      workspaceId: context.projectId,
      type: request.type,
      title: request.title,
      content: request.content,
      ...(request.subjectKey ? { subjectKey: request.subjectKey } : {}),
      ...(request.sessionId ? { sessionId: request.sessionId } : {}),
      ...(request.sessionId ? { ownerId: this.owner(context) } : {}),
      tags: normalizeTags([
        ...(request.tags ?? []),
        request.source ? `source:${request.source}` : "",
        request.area ? `area:${request.area}` : "",
      ]),
    });
    return { stored: true, entryId: item.id };
  }

  async startSession(
    context: AgentMemoryContext,
  ): Promise<AgentMemorySessionResult> {
    const session = this.memory.startSession({
      workspaceId: context.projectId,
      ownerId: this.owner(context),
    });
    return { sessionId: session.id };
  }

  async finishSession(
    request: AgentMemorySessionFinishRequest,
    context: AgentMemoryContext,
  ): Promise<AgentMemorySessionResult> {
    const session = this.memory.endSessionForWorkspace(
      {
        sessionId: request.sessionId,
        ...(request.summary ? { summary: request.summary } : {}),
        ownerId: this.owner(context),
      },
      context.projectId,
    );
    return { sessionId: session.id };
  }

  async listDueForReview(
    request: { limit?: number; maxChars?: number },
    context: AgentMemoryContext,
  ): Promise<AgentMemorySearchResult> {
    return {
      entries: this.memory
        .listDueForReview(context.projectId)
        .filter((item) => isVisibleInArea(item, context.area))
        .slice(0, request.limit ?? 20)
        .map((item) =>
          toAgentMemoryEntry(item, request.maxChars ?? 4_000, context.area),
        ),
    };
  }

  async completeReview(
    request: AgentMemoryReviewRequest,
    context: AgentMemoryContext,
  ): Promise<AgentMemoryReviewResult> {
    const due = this.memory
      .listDueForReview(context.projectId)
      .some((item) => item.id === request.memoryId);
    if (!due) return { reviewed: false, reason: "not_due" };

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

  private owner(context: AgentMemoryContext): string {
    return context.sessionOwnerId ?? this.sessionOwnerId;
  }
}

function toAgentMemoryEntry(
  item: MemoryItem,
  maxChars: number,
  fallbackArea?: string,
): AgentMemoryEntry {
  const area = tagValue(item.tags, "area") ?? fallbackArea;
  const source = tagValue(item.tags, "source") ?? "agent-memory:sqlite";
  return {
    id: item.id,
    projectId: item.workspaceId,
    type: item.type,
    title: item.title,
    content: limitText(item.content, maxChars),
    source,
    ...(area ? { area } : {}),
    tags: [...item.tags],
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function tagValue(tags: readonly string[], prefix: string): string | undefined {
  return tags
    .find((tag) => tag.startsWith(`${prefix}:`))
    ?.slice(prefix.length + 1);
}

function isVisibleInArea(item: MemoryItem, area: string | undefined): boolean {
  if (!area) return true;
  const storedArea = tagValue(item.tags, "area");
  return !storedArea || storedArea === area;
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function limitText(value: string, maxChars: number): string {
  if (!Number.isInteger(maxChars) || maxChars < 1) return value;
  return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
}
