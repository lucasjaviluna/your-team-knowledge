import { describe, expect, it } from "vitest";

import { runEmbeddingBenchmark } from "../../src/application/index.js";
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
    const results = [];

    for (const model of models) {
      const provider = new TransformersEmbeddingProvider({
        ...model,
        dimensions: 384,
        dtype: "q8",
      });
      results.push(
        await runEmbeddingBenchmark({
          provider,
          documents: embeddingBenchmarkDocuments,
          cases: embeddingBenchmarkCases,
          k: 3,
        }),
      );
    }

    console.log(JSON.stringify({ embeddingBenchmark: results }, null, 2));
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.dimensions === 384)).toBe(true);
  }, 120_000);
});
