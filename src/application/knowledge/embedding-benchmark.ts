import type { EmbeddingProvider } from "./contracts.js";

export interface EmbeddingBenchmarkDocument {
  id: string;
  content: string;
}

export interface EmbeddingBenchmarkCase {
  id: string;
  query: string;
  relevantDocumentIds: readonly string[];
}

export interface EmbeddingBenchmarkOptions {
  provider: EmbeddingProvider;
  documents: readonly EmbeddingBenchmarkDocument[];
  cases: readonly EmbeddingBenchmarkCase[];
  k?: number;
}

export interface EmbeddingBenchmarkResult {
  modelId: string;
  dimensions: number;
  k: number;
  recallAtK: number;
  citationPrecisionAt1: number;
  documentEmbeddingLatencyMs: number;
  meanQueryLatencyMs: number;
  p95QueryLatencyMs: number;
  cases: readonly {
    id: string;
    rankedDocumentIds: readonly string[];
    relevantDocumentIds: readonly string[];
  }[];
}

export interface EmbeddingBenchmarkThresholds {
  minRecallAtK?: number;
  minCitationPrecisionAt1?: number;
  maxMeanQueryLatencyMs?: number;
  maxP95QueryLatencyMs?: number;
}

export interface EmbeddingBenchmarkThresholdFailure {
  metric: keyof EmbeddingBenchmarkThresholds;
  actual: number;
  expected: number;
}

export function getEmbeddingBenchmarkThresholdFailures(
  result: EmbeddingBenchmarkResult,
  thresholds: EmbeddingBenchmarkThresholds,
): readonly EmbeddingBenchmarkThresholdFailure[] {
  const failures: EmbeddingBenchmarkThresholdFailure[] = [];
  const checks = [
    ["minRecallAtK", result.recallAtK, thresholds.minRecallAtK, "min"],
    [
      "minCitationPrecisionAt1",
      result.citationPrecisionAt1,
      thresholds.minCitationPrecisionAt1,
      "min",
    ],
    [
      "maxMeanQueryLatencyMs",
      result.meanQueryLatencyMs,
      thresholds.maxMeanQueryLatencyMs,
      "max",
    ],
    [
      "maxP95QueryLatencyMs",
      result.p95QueryLatencyMs,
      thresholds.maxP95QueryLatencyMs,
      "max",
    ],
  ] as const;

  for (const [metric, actual, expected, direction] of checks) {
    if (expected === undefined) continue;
    const passed =
      direction === "min" ? actual >= expected : actual <= expected;
    if (!passed) failures.push({ metric, actual, expected });
  }
  return failures;
}

export async function runEmbeddingBenchmark(
  options: EmbeddingBenchmarkOptions,
): Promise<EmbeddingBenchmarkResult> {
  const k = options.k ?? 3;
  if (!Number.isInteger(k) || k < 1) {
    throw new Error("Benchmark k must be a positive integer.");
  }
  if (options.documents.length === 0 || options.cases.length === 0) {
    throw new Error("Benchmark requires documents and query cases.");
  }

  const documentStart = performance.now();
  const documentEmbeddings = await options.provider.embedDocuments(
    options.documents.map((document) => document.content),
  );
  const documentEmbeddingLatencyMs = performance.now() - documentStart;
  if (documentEmbeddings.length !== options.documents.length) {
    throw new Error(
      "Embedding provider returned an unexpected document count.",
    );
  }

  const queryLatencies: number[] = [];
  const cases = [];
  let totalRecallHits = 0;
  let totalRelevantDocuments = 0;
  let citationHits = 0;

  for (const benchmarkCase of options.cases) {
    const queryStart = performance.now();
    const queryEmbedding = await options.provider.embedQuery(
      benchmarkCase.query,
    );
    queryLatencies.push(performance.now() - queryStart);
    const ranked = options.documents
      .map((document, index) => ({
        document,
        score: cosineSimilarity(
          queryEmbedding,
          documentEmbeddings[index] ?? [],
        ),
      }))
      .sort((left, right) => {
        const scoreDifference = right.score - left.score;
        return (
          scoreDifference || left.document.id.localeCompare(right.document.id)
        );
      });
    const rankedDocumentIds = ranked
      .slice(0, k)
      .map(({ document }) => document.id);
    const relevant = new Set(benchmarkCase.relevantDocumentIds);
    const hits = rankedDocumentIds.filter((id) => relevant.has(id)).length;
    totalRecallHits += hits;
    totalRelevantDocuments += relevant.size;
    if (rankedDocumentIds[0] && relevant.has(rankedDocumentIds[0])) {
      citationHits += 1;
    }
    cases.push({
      id: benchmarkCase.id,
      rankedDocumentIds,
      relevantDocumentIds: benchmarkCase.relevantDocumentIds,
    });
  }

  return {
    modelId: options.provider.modelId,
    dimensions: options.provider.dimensions,
    k,
    recallAtK: totalRelevantDocuments
      ? totalRecallHits / totalRelevantDocuments
      : 0,
    citationPrecisionAt1: citationHits / options.cases.length,
    documentEmbeddingLatencyMs,
    meanQueryLatencyMs: mean(queryLatencies),
    p95QueryLatencyMs: percentile(queryLatencies, 0.95),
    cases,
  };
}

function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length !== right.length || left.length === 0) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue ** 2;
    rightNorm += rightValue ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return -1;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(percentileValue * sorted.length) - 1,
  );
  return sorted[index] ?? 0;
}
