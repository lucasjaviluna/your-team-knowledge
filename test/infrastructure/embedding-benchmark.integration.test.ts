import { describe, expect, it } from "vitest";

import {
  getEmbeddingBenchmarkThresholdFailures,
  runEmbeddingBenchmark,
} from "../../src/application/index.js";
import { TransformersEmbeddingProvider } from "../../src/infrastructure/embeddings/index.js";
import {
  embeddingBenchmarkCases,
  embeddingBenchmarkDocuments,
} from "../fixtures/embedding-benchmark-dataset.js";

const enabled = process.env.RUN_EMBEDDING_BENCHMARK === "1";
const describeBenchmark = enabled ? describe : describe.skip;

describeBenchmark("embedding model benchmark", () => {
  it("compares the provisional E5 model with multilingual MiniLM", async () => {
    const models = [
      {
        modelId: "Xenova/multilingual-e5-small",
        queryPrefix: "query: ",
        documentPrefix: "passage: ",
      },
      {
        modelId: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
        queryPrefix: "",
        documentPrefix: "",
      },
    ];
    const runs = Math.max(
      1,
      Number(process.env.EMBEDDING_BENCHMARK_RUNS ?? "3"),
    );
    const reports = [];

    for (const model of models) {
      const provider = new TransformersEmbeddingProvider({
        ...model,
        dimensions: 384,
        dtype: "q8",
      });
      const rssBefore = process.memoryUsage().rss;
      const results = [];

      for (let run = 0; run < runs; run += 1) {
        results.push(
          await runEmbeddingBenchmark({
            provider,
            documents: embeddingBenchmarkDocuments,
            cases: embeddingBenchmarkCases,
            k: 3,
          }),
        );
      }

      reports.push({
        modelId: model.modelId,
        runs,
        rssBeforeMb: Number((rssBefore / 1024 / 1024).toFixed(1)),
        rssAfterMb: Number(
          (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
        ),
        rssDeltaMb: Number(
          ((process.memoryUsage().rss - rssBefore) / 1024 / 1024).toFixed(1),
        ),
        results,
        thresholdFailures: results.flatMap((result) =>
          getEmbeddingBenchmarkThresholdFailures(result, {
            minRecallAtK:
              model.modelId === "Xenova/multilingual-e5-small" ? 0.9 : 0.8,
            minCitationPrecisionAt1:
              model.modelId === "Xenova/multilingual-e5-small" ? 0.95 : 0.7,
          }),
        ),
      });
    }

    console.log(JSON.stringify({ embeddingBenchmark: reports }, null, 2));
    expect(reports).toHaveLength(2);
    expect(
      reports.every((report) =>
        report.results.every((result) => result.dimensions === 384),
      ),
    ).toBe(true);
    expect(reports.flatMap((report) => report.thresholdFailures)).toEqual([]);
  }, 180_000);
});
