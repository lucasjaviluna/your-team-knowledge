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
  validFrom?: Date;
  expiresAt?: Date;
  reviewAt?: Date;
}

export interface SearchMemoryInput {
  workspaceId: string;
  query: string;
  limit?: number;
  includeNeedsReview?: boolean;
  asOf?: Date;
}

export interface CompactMemoryInput {
  workspaceId: string;
  memoryIds: readonly string[];
  title?: string;
  maxChars?: number;
  archiveSources?: boolean;
  tags?: readonly string[];
}

export interface CompactMemoryResult {
  summary: MemoryItem;
  sources: readonly MemoryItem[];
  archivedSourceIds: readonly string[];
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
    asOf?: Date,
  ): MemoryItem | undefined;
  findById(memoryId: string): MemoryItem | undefined;
  insert(item: MemoryItem): void;
  update(item: MemoryItem): void;
  search(input: ResolvedSearchMemoryInput): readonly MemoryItem[];
  listDueForReview(asOf: Date, workspaceId?: string): readonly MemoryItem[];
  archiveExpired(asOf: Date): number;
  purgeArchived(before: Date): number;
}

export interface ResolvedSearchMemoryInput {
  workspaceId: string;
  query: string;
  limit: number;
  includeNeedsReview: boolean;
  asOf: Date;
}
