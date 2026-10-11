import type { MemoryItem, MemoryItemStatus, MemoryItemType } from "../../domain/index.js";

export interface SaveMemoryInput {
  workspaceId: string;
  sessionId?: string;
  type: MemoryItemType;
  title: string;
  content: string;
  subjectKey?: string;
  tags?: readonly string[];
  status?: MemoryItemStatus;
}

export interface SearchMemoryInput {
  workspaceId: string;
  query: string;
  limit?: number;
}

export interface MemoryRepository {
  findActiveBySubjectKey(
    workspaceId: string,
    subjectKey: string,
  ): MemoryItem | undefined;
  insert(item: MemoryItem): void;
  update(item: MemoryItem): void;
  search(input: Required<SearchMemoryInput>): readonly MemoryItem[];
}
