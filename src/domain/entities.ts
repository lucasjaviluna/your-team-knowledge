export type WorkspaceType =
  "software" | "product" | "business" | "design" | "research" | "operations";

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  type: WorkspaceType;
}

export interface Actor {
  id: string;
  organizationId: string;
  roles: readonly string[];
  teamIds: readonly string[];
}

export type MemoryItemType =
  "decision" | "discovery" | "pattern" | "preference" | "summary";

export type MemoryItemStatus =
  "active" | "superseded" | "needs_review" | "archived";

export interface MemoryItem {
  id: string;
  workspaceId: string;
  sessionId?: string;
  type: MemoryItemType;
  title: string;
  content: string;
  subjectKey?: string;
  tags: readonly string[];
  status: MemoryItemStatus;
  createdAt: Date;
  updatedAt: Date;
  validFrom?: Date;
  expiresAt?: Date;
  reviewAt?: Date;
  archivedAt?: Date;
}

export interface MemorySession {
  id: string;
  workspaceId: string;
  ownerId?: string;
  startedAt: Date;
  endedAt?: Date;
  summary?: string;
}

export type MemoryRelationType =
  "related" | "supports" | "conflicts_with" | "supersedes";

export interface MemoryRelation {
  sourceMemoryId: string;
  targetMemoryId: string;
  relation: MemoryRelationType;
  createdAt: Date;
}
