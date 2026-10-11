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
  memoryRecall: number;
  citationRecall: number;
  forbiddenMemoryCount: number;
  forbiddenDocumentCount: number;
}

export interface ContextEvaluationResult {
  cases: readonly ContextEvaluationCaseResult[];
  intentAccuracy: number;
  memoryRecall: number;
  citationRecall: number;
  permissionLeakage: number;
  passed: boolean;
}

export async function evaluateContextProvider(
  provider: ContextProvider,
  cases: readonly ContextEvaluationCase[],
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

  return {
    cases: results,
    intentAccuracy: intentCorrectCount / cases.length,
    memoryRecall: expectedMemoryCount
      ? results.reduce((total, item) => total + item.memoryHits, 0) /
        expectedMemoryCount
      : 1,
    citationRecall: expectedDocumentCount
      ? results.reduce((total, item) => total + item.citationHits, 0) /
        expectedDocumentCount
      : 1,
    permissionLeakage,
    passed: results.every((item) => item.passed),
  };
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
  const intentCorrect = bundle.intent === evaluationCase.expectedIntent;

  return {
    id: evaluationCase.id,
    intentCorrect,
    memoryHits,
    citationHits: documentHits,
    memoryRecall,
    citationRecall,
    forbiddenMemoryCount,
    forbiddenDocumentCount,
    passed:
      intentCorrect &&
      memoryRecall === 1 &&
      citationRecall === 1 &&
      forbiddenMemoryCount === 0 &&
      forbiddenDocumentCount === 0,
  };
}

function countMatches(
  expected: readonly string[],
  actual: Set<string>,
): number {
  return expected.filter((value) => actual.has(value)).length;
}
