import type {
  ContextBundle,
  ContextProvider,
  ContextRequest,
} from "./contracts.js";

export interface ContextEvaluationCase {
  id: string;
  request: ContextRequest;
  expectedIntent: ContextBundle["intent"];
  expectedMemoryIds?: readonly string[];
  expectedDocumentIds?: readonly string[];
  forbiddenMemoryIds?: readonly string[];
  forbiddenDocumentIds?: readonly string[];
}

export interface ContextEvaluationCaseResult {
  id: string;
  passed: boolean;
  intentCorrect: boolean;
  memoryHits: number;
  citationHits: number;
  actualMemoryCount: number;
  actualCitationCount: number;
  memoryRecall: number;
  citationRecall: number;
  memoryPrecision: number;
  citationPrecision: number;
  forbiddenMemoryCount: number;
  forbiddenDocumentCount: number;
}

export interface ContextEvaluationResult {
  cases: readonly ContextEvaluationCaseResult[];
  intentAccuracy: number;
  memoryRecall: number;
  citationRecall: number;
  memoryPrecision: number;
  citationPrecision: number;
  permissionLeakage: number;
  thresholdFailures: readonly string[];
  passed: boolean;
}

export interface ContextEvaluationThresholds {
  intentAccuracy?: number;
  memoryRecall?: number;
  citationRecall?: number;
  memoryPrecision?: number;
  citationPrecision?: number;
  maxPermissionLeakage?: number;
}

export async function evaluateContextProvider(
  provider: ContextProvider,
  cases: readonly ContextEvaluationCase[],
  thresholds: ContextEvaluationThresholds = {},
): Promise<ContextEvaluationResult> {
  if (cases.length === 0) {
    throw new Error("At least one context evaluation case is required.");
  }

  const results: ContextEvaluationCaseResult[] = [];
  for (const evaluationCase of cases) {
    const bundle = await provider.resolve(evaluationCase.request);
    results.push(evaluateCase(evaluationCase, bundle));
  }

  const expectedMemoryCount = cases.reduce(
    (count, item) => count + (item.expectedMemoryIds?.length ?? 0),
    0,
  );
  const expectedDocumentCount = cases.reduce(
    (count, item) => count + (item.expectedDocumentIds?.length ?? 0),
    0,
  );
  const intentCorrectCount = results.filter(
    (item) => item.intentCorrect,
  ).length;
  const permissionLeakage = results.reduce(
    (count, item) =>
      count + item.forbiddenMemoryCount + item.forbiddenDocumentCount,
    0,
  );
  const actualMemoryCount = results.reduce(
    (count, item) => count + item.actualMemoryCount,
    0,
  );
  const actualDocumentCount = results.reduce(
    (count, item) => count + item.actualCitationCount,
    0,
  );

  const metrics = {
    intentAccuracy: intentCorrectCount / cases.length,
    memoryRecall: expectedMemoryCount
      ? results.reduce((total, item) => total + item.memoryHits, 0) /
        expectedMemoryCount
      : 1,
    citationRecall: expectedDocumentCount
      ? results.reduce((total, item) => total + item.citationHits, 0) /
        expectedDocumentCount
      : 1,
    memoryPrecision: actualMemoryCount
      ? results.reduce((total, item) => total + item.memoryHits, 0) /
        actualMemoryCount
      : 1,
    citationPrecision: actualDocumentCount
      ? results.reduce((total, item) => total + item.citationHits, 0) /
        actualDocumentCount
      : 1,
    permissionLeakage,
  };
  const thresholdFailures = findThresholdFailures(metrics, thresholds);

  return {
    cases: results,
    ...metrics,
    thresholdFailures,
    passed:
      results.every((item) => item.passed) && thresholdFailures.length === 0,
  };
}

type EvaluationMetrics = Pick<
  ContextEvaluationResult,
  | "intentAccuracy"
  | "memoryRecall"
  | "citationRecall"
  | "memoryPrecision"
  | "citationPrecision"
  | "permissionLeakage"
>;

function findThresholdFailures(
  metrics: EvaluationMetrics,
  thresholds: ContextEvaluationThresholds,
): readonly string[] {
  const failures: string[] = [];
  const minimums = [
    ["intentAccuracy", thresholds.intentAccuracy, metrics.intentAccuracy],
    ["memoryRecall", thresholds.memoryRecall, metrics.memoryRecall],
    ["citationRecall", thresholds.citationRecall, metrics.citationRecall],
    ["memoryPrecision", thresholds.memoryPrecision, metrics.memoryPrecision],
    [
      "citationPrecision",
      thresholds.citationPrecision,
      metrics.citationPrecision,
    ],
  ] as const;

  for (const [name, threshold, actual] of minimums) {
    if (threshold === undefined) continue;
    validateThreshold(threshold, name);
    if (actual < threshold) failures.push(`${name}=${actual} < ${threshold}`);
  }

  if (thresholds.maxPermissionLeakage !== undefined) {
    validateThreshold(thresholds.maxPermissionLeakage, "maxPermissionLeakage");
    if (metrics.permissionLeakage > thresholds.maxPermissionLeakage) {
      failures.push(
        `permissionLeakage=${metrics.permissionLeakage} > ${thresholds.maxPermissionLeakage}`,
      );
    }
  }

  return failures;
}

function validateThreshold(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between zero and one.`);
  }
}

function evaluateCase(
  evaluationCase: ContextEvaluationCase,
  bundle: ContextBundle,
): ContextEvaluationCaseResult {
  const memoryIds = new Set(bundle.memories.map((entry) => entry.memory.id));
  const documentIds = new Set(
    bundle.citations.map((citation) => citation.documentId),
  );
  const expectedMemoryIds = evaluationCase.expectedMemoryIds ?? [];
  const expectedDocumentIds = evaluationCase.expectedDocumentIds ?? [];
  const forbiddenMemoryCount = countMatches(
    evaluationCase.forbiddenMemoryIds ?? [],
    memoryIds,
  );
  const forbiddenDocumentCount = countMatches(
    evaluationCase.forbiddenDocumentIds ?? [],
    documentIds,
  );
  const memoryHits = countMatches(expectedMemoryIds, memoryIds);
  const documentHits = countMatches(expectedDocumentIds, documentIds);
  const memoryRecall = expectedMemoryIds.length
    ? memoryHits / expectedMemoryIds.length
    : 1;
  const citationRecall = expectedDocumentIds.length
    ? documentHits / expectedDocumentIds.length
    : 1;
  const memoryPrecision = precision(memoryHits, memoryIds.size);
  const citationPrecision = precision(documentHits, documentIds.size);
  const intentCorrect = bundle.intent === evaluationCase.expectedIntent;

  return {
    id: evaluationCase.id,
    intentCorrect,
    memoryHits,
    citationHits: documentHits,
    actualMemoryCount: memoryIds.size,
    actualCitationCount: documentIds.size,
    memoryRecall,
    citationRecall,
    memoryPrecision,
    citationPrecision,
    forbiddenMemoryCount,
    forbiddenDocumentCount,
    passed:
      intentCorrect &&
      memoryRecall === 1 &&
      citationRecall === 1 &&
      memoryPrecision === 1 &&
      citationPrecision === 1 &&
      forbiddenMemoryCount === 0 &&
      forbiddenDocumentCount === 0,
  };
}

function precision(hits: number, actualCount: number): number {
  return actualCount ? hits / actualCount : 1;
}

function countMatches(
  expected: readonly string[],
  actual: Set<string>,
): number {
  return expected.filter((value) => actual.has(value)).length;
}
