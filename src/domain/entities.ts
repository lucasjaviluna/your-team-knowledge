export type WorkspaceType =
  | "software"
  | "product"
  | "business"
  | "design"
  | "research"
  | "operations";

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
  | "decision"
  | "discovery"
  | "pattern"
  | "preference"
  | "summary";

export type MemoryItemStatus = "active" | "superseded" | "needs_review";

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
}

export interface SourceCitation {
  sourceId: string;
  documentId: string;
  chunkId: string;
  title: string;
  uri?: string;
}
