import { describe, expect, it } from "vitest";

import {
  getEmbeddingBenchmarkThresholdFailures,
  runEmbeddingBenchmark,
  type EmbeddingProvider,
} from "../../src/application/index.js";

const documents = [
  { id: "deployments", content: "despliegues aprobación producción" },
  { id: "access", content: "acceso permisos equipos workspace" },
  { id: "sqlite", content: "memoria local sqlite sesiones" },
];

const cases = [
  {
    id: "deployment-query",
    query: "aprobar despliegue",
    relevantDocumentIds: ["deployments"],
  },
  {
    id: "memory-query",
    query: "sesión memoria local",
    relevantDocumentIds: ["sqlite"],
  },
];

describe("runEmbeddingBenchmark", () => {
  it("calculates recall, citation precision and latency metrics", async () => {
    const provider: EmbeddingProvider = {
      modelId: "test-provider",
      dimensions: 3,
      embedQuery: async (query) =>
        query.includes("despliegue") ? [1, 0, 0] : [0, 0, 1],
      embedDocuments: async () => [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    };

    const result = await runEmbeddingBenchmark({
      provider,
      documents,
      cases,
      k: 1,
    });

    expect(result.recallAtK).toBe(1);
    expect(result.citationPrecisionAt1).toBe(1);
    expect(result.cases).toHaveLength(2);
    expect(result.meanQueryLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.p95QueryLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports quality gate failures without hiding the measured values", () => {
    const failures = getEmbeddingBenchmarkThresholdFailures(
      {
        modelId: "test-provider",
        dimensions: 3,
        k: 1,
        recallAtK: 0.75,
        citationPrecisionAt1: 0.5,
        documentEmbeddingLatencyMs: 10,
        meanQueryLatencyMs: 12,
        p95QueryLatencyMs: 20,
        cases: [],
      },
      {
        minRecallAtK: 0.8,
        minCitationPrecisionAt1: 0.7,
        maxMeanQueryLatencyMs: 10,
        maxP95QueryLatencyMs: 15,
      },
    );

    expect(failures).toEqual([
      { metric: "minRecallAtK", actual: 0.75, expected: 0.8 },
      {
        metric: "minCitationPrecisionAt1",
        actual: 0.5,
        expected: 0.7,
      },
      { metric: "maxMeanQueryLatencyMs", actual: 12, expected: 10 },
      { metric: "maxP95QueryLatencyMs", actual: 20, expected: 15 },
    ]);
  });
});
