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
  subjectKey?: string;
}

export interface CompactMemoryResult {
  summary: MemoryItem;
  sources: readonly MemoryItem[];
  archivedSourceIds: readonly string[];
  reused: boolean;
}

export interface MemoryLifecycleSnapshot {
  total: number;
  byStatus: Readonly<Record<MemoryItemStatus, number>>;
  future: number;
  expired: number;
  dueForReview: number;
}

export interface TransitionMemoryStatusInput {
  memoryId: string;
  status: MemoryItemStatus;
  reason?: string;
}

export interface MemoryStatusTransition {
  memory: MemoryItem;
  previousStatus: MemoryItemStatus;
  status: MemoryItemStatus;
  reason: string;
  changed: boolean;
  occurredAt: Date;
}

export interface MemoryStatusChangedEvent {
  type: "status_changed";
  transition: MemoryStatusTransition;
}

export interface MemoryExpiredEvent {
  type: "expired_archived";
  memoryId: string;
  workspaceId: string;
  previousStatus: "active";
  status: "archived";
  reason: "expired";
  occurredAt: Date;
}

export interface MemoryPurgedEvent {
  type: "purged";
  memoryId: string;
  workspaceId: string;
  previousStatus: "archived";
  status: "purged";
  reason: "retention";
  occurredAt: Date;
}

export type MemoryLifecycleEvent =
  MemoryStatusChangedEvent | MemoryExpiredEvent | MemoryPurgedEvent;

export type MemoryLifecycleObserver = (event: MemoryLifecycleEvent) => void;

export interface PurgeArchivedInput {
  before: Date;
  dryRun?: boolean;
}

export interface PurgeArchivedResult {
  before: Date;
  dryRun: boolean;
  candidateIds: readonly string[];
  purgedCount: number;
}

export interface RunMemoryRetentionInput {
  purgeBefore: Date;
  workspaceId?: string;
  allWorkspaces?: boolean;
  dryRun?: boolean;
}

export interface RunMemoryRetentionResult {
  dryRun: boolean;
  workspaceId?: string;
  allWorkspaces: boolean;
  expiredCandidateIds: readonly string[];
  archivedCount: number;
  purgeCandidateIds: readonly string[];
  purgedCount: number;
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
  archiveExpired(asOf: Date, workspaceId?: string): number;
  listExpiredIds(asOf: Date, workspaceId?: string): readonly string[];
  purgeArchived(before: Date, workspaceId?: string): number;
  listArchivedIds(before: Date, workspaceId?: string): readonly string[];
  inspectLifecycle(asOf: Date, workspaceId?: string): MemoryLifecycleSnapshot;
}

export interface ResolvedSearchMemoryInput {
  workspaceId: string;
  query: string;
  limit: number;
  includeNeedsReview: boolean;
  asOf: Date;
}
