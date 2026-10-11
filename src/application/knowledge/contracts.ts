import type {
  Document,
  DocumentChunk,
  KnowledgeSource,
} from "../../domain/index.js";

export interface KnowledgeSearchInput {
  workspaceId: string;
  actorId: string;
  teamIds: readonly string[];
  query: string;
  limit?: number;
}

export interface KnowledgeSearchResult {
  document: Document;
  chunk: DocumentChunk;
  source: KnowledgeSource;
  score: number;
}

export interface KnowledgeRepository {
  save(
    source: KnowledgeSource,
    document: Document,
    chunks: readonly DocumentChunk[],
  ): Promise<void>;
  search(
    input: KnowledgeSearchInput,
  ): Promise<readonly KnowledgeSearchResult[]>;
  close(): Promise<void>;
}
