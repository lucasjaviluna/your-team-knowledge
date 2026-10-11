import { describe, expect, it } from "vitest";

import {
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
});
