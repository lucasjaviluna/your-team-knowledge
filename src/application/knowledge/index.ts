export type {
  EmbeddingProvider,
  KnowledgeRepository,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
  KnowledgeQueryResponse,
} from "./contracts.js";
export type {
  MarkdownIngestionInput,
  MarkdownIngestionResult,
} from "./markdown-ingestor.js";
export {
  ingestMarkdown,
  ingestMarkdownWithEmbeddings,
} from "./markdown-ingestor.js";
export {
  KnowledgeIngestionService,
  KnowledgeQueryService,
} from "./knowledge-services.js";
export {
  runEmbeddingBenchmark,
  type EmbeddingBenchmarkCase,
  type EmbeddingBenchmarkDocument,
  type EmbeddingBenchmarkOptions,
  type EmbeddingBenchmarkResult,
} from "./embedding-benchmark.js";
