import type {
  EmbeddingProvider,
  KnowledgeQueryResponse,
  KnowledgeRepository,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
  SourceCitation,
} from "./contracts.js";
import type {
  MarkdownIngestionInput,
  MarkdownIngestionResult,
} from "./markdown-ingestor.js";
import type { KnowledgeSource } from "../../domain/index.js";
import { ingestMarkdownWithEmbeddings } from "./markdown-ingestor.js";
import { detectSensitiveContent } from "../governance.js";

export interface KnowledgeIngestionOptions {
  rejectSensitiveContent?: boolean;
}

export class KnowledgeIngestionService {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly options: KnowledgeIngestionOptions = {},
  ) {}

  async ingestMarkdown(
    source: KnowledgeSource,
    input: MarkdownIngestionInput,
  ): Promise<MarkdownIngestionResult> {
    if (this.options.rejectSensitiveContent !== false) {
      const sensitiveKinds = detectSensitiveContent(
        `${input.title}\n${input.content}`,
      );
      if (sensitiveKinds.length > 0) {
        throw new Error("Sensitive content detected in document.");
      }
    }
    const ingested = await ingestMarkdownWithEmbeddings(
      input,
      this.embeddingProvider,
    );
    await this.repository.save(source, ingested.document, ingested.chunks);
    return ingested;
  }
}

export class KnowledgeQueryService {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async search(input: KnowledgeSearchInput): Promise<KnowledgeQueryResponse> {
    const queryEmbedding = await this.embeddingProvider.embedQuery(input.query);
    const results = await this.repository.search({ ...input, queryEmbedding });

    return {
      results,
      citations: results.map(toSourceCitation),
    };
  }
}

function toSourceCitation(result: KnowledgeSearchResult): SourceCitation {
  return {
    sourceId: result.source.id,
    title: result.document.title,
    ...(result.document.uri ? { uri: result.document.uri } : {}),
    sourceKind: result.source.kind,
    sourceName: result.source.name,
    documentId: result.document.id,
    documentVersion: result.document.version,
    chunkId: result.chunk.id,
    chunkOrdinal: result.chunk.ordinal,
    excerpt: result.chunk.content,
    score: result.score,
  };
}
