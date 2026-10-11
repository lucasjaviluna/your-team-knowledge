export type DocumentStatus = "active" | "superseded" | "needs_review";

export interface AccessPolicy {
  workspaceId: string;
  teamIds?: readonly string[];
  actorIds?: readonly string[];
}

export interface KnowledgeSource {
  id: string;
  kind: string;
  name: string;
}

export interface Document {
  id: string;
  sourceId: string;
  externalId: string;
  workspaceId: string;
  title: string;
  uri?: string;
  version: string;
  status: DocumentStatus;
  accessPolicy: AccessPolicy;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  ordinal: number;
  content: string;
  metadata: Readonly<Record<string, string>>;
  embedding?: readonly number[];
}
