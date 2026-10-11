import { randomUUID } from "node:crypto";

import type { MemoryItem } from "../../domain/index.js";

import type {
  MemoryRepository,
  SaveMemoryInput,
  SearchMemoryInput,
} from "./contracts.js";

export class MemoryService {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID,
  ) {}

  save(input: SaveMemoryInput): MemoryItem {
    const workspaceId = requireText(input.workspaceId, "workspaceId");
    const title = requireText(input.title, "title");
    const content = requireText(input.content, "content");
    const subjectKey = optionalText(input.subjectKey);
    const now = this.now();
    const existing = subjectKey
      ? this.repository.findActiveBySubjectKey(workspaceId, subjectKey)
      : undefined;

    const item: MemoryItem = {
      id: existing?.id ?? this.idGenerator(),
      workspaceId,
      ...(input.sessionId ? { sessionId: requireText(input.sessionId, "sessionId") } : {}),
      type: input.type,
      title,
      content,
      ...(subjectKey ? { subjectKey } : {}),
      tags: normalizeTags(input.tags),
      status: input.status ?? "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

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
    });
  }
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${name} is required.`);
  }

  return normalized;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeTags(tags: readonly string[] | undefined): readonly string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}
