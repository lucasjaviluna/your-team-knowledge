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
  queryEmbedding?: readonly number[];
  limit?: number;
}

export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  embedQuery(text: string): Promise<readonly number[]>;
  embedDocuments(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]>;
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
