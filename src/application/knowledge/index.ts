export type {
  EmbeddingProvider,
  KnowledgeRepository,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
} from "./contracts.js";
export type {
  MarkdownIngestionInput,
  MarkdownIngestionResult,
} from "./markdown-ingestor.js";
export { ingestMarkdown } from "./markdown-ingestor.js";
export {
  runEmbeddingBenchmark,
  type EmbeddingBenchmarkCase,
  type EmbeddingBenchmarkDocument,
  type EmbeddingBenchmarkOptions,
  type EmbeddingBenchmarkResult,
} from "./embedding-benchmark.js";
