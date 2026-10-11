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

/** Implements pi-harness' provider-neutral MemoryProvider contract over SQLite. */
export class PiHarnessMemoryProvider {
  readonly id = "agent-memory-sqlite";

  constructor(private readonly memory: MemoryService) {}

  async isAvailable(): Promise<boolean> {
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
    const entries = items.map((item) => ({
      id: item.id,
      projectId: item.workspaceId,
      title: item.title,
      content: limitText(item.content, query.maxChars),
      source: "agent-memory:sqlite",
      ...((context.area ?? query.area)
        ? { area: context.area ?? query.area }
        : {}),
      tags: [...item.tags],
    }));
    return { entries };
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
