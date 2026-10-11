import { describe, expect, it } from "vitest";

import {
  TransformersEmbeddingProvider,
  type TransformersEmbeddingExtractor,
} from "../../src/infrastructure/embeddings/index.js";

function mockExtractor(dimensions = 3): {
  extractor: TransformersEmbeddingExtractor;
  calls: string[][];
} {
  const calls: string[][] = [];
  const extractor = (async (texts: string[]) => {
    calls.push(texts);
    return {
      tolist: () =>
        texts.map(() =>
          Array.from({ length: dimensions }, (_, index) => index + 1),
        ),
    };
  }) as unknown as TransformersEmbeddingExtractor;
  return { extractor, calls };
}

describe("TransformersEmbeddingProvider", () => {
  it("adds E5 prefixes and validates the configured dimension", async () => {
    const { extractor, calls } = mockExtractor();
    const provider = new TransformersEmbeddingProvider({
      dimensions: 3,
      extractor,
    });

    await expect(provider.embedQuery("  ¿Qué es RAG? ")).resolves.toEqual([
      1, 2, 3,
    ]);
    await expect(
      provider.embedDocuments(["Un documento", "Otro documento"]),
    ).resolves.toEqual([
      [1, 2, 3],
      [1, 2, 3],
    ]);

    expect(calls).toEqual([
      ["query: ¿Qué es RAG?"],
      ["passage: Un documento", "passage: Otro documento"],
    ]);
  });

  it("does not initialize the model for an empty batch", async () => {
    const { extractor, calls } = mockExtractor();
    const provider = new TransformersEmbeddingProvider({
      dimensions: 3,
      extractor,
    });

    await expect(provider.embedDocuments([])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("rejects empty text and unexpected dimensions", async () => {
    const { extractor } = mockExtractor(2);
    const provider = new TransformersEmbeddingProvider({
      dimensions: 3,
      extractor,
    });

    await expect(provider.embedQuery("  ")).rejects.toThrow(
      "Embedding text is required",
    );
    await expect(provider.embedQuery("texto")).rejects.toThrow(
      "Embedding dimension mismatch",
    );
  });
});
