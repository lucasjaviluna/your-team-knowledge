import type {
  MemoryItem,
  MemoryItemStatus,
  MemoryItemType,
  MemoryRelation,
  MemoryRelationType,
  MemorySession,
} from "../../domain/index.js";

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

export interface StartSessionInput {
  workspaceId: string;
}

export interface EndSessionInput {
  sessionId: string;
  summary?: string;
}

export interface AddMemoryRelationInput {
  sourceMemoryId: string;
  targetMemoryId: string;
  relation: MemoryRelationType;
}

export interface MemoryRepository {
  insertSession(session: MemorySession): void;
  findSession(sessionId: string): MemorySession | undefined;
  endSession(sessionId: string, endedAt: Date, summary?: string): void;
  addRelation(relation: MemoryRelation): void;
  listRelations(memoryId: string): readonly MemoryRelation[];
  findActiveBySubjectKey(
    workspaceId: string,
    subjectKey: string,
  ): MemoryItem | undefined;
  insert(item: MemoryItem): void;
  update(item: MemoryItem): void;
  search(input: Required<SearchMemoryInput>): readonly MemoryItem[];
}
