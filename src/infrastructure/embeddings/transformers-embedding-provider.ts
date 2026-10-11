import { pipeline, type DataType } from "@huggingface/transformers";

import type { EmbeddingProvider } from "../../application/index.js";

type FeatureExtractor = Awaited<
  ReturnType<typeof pipeline<"feature-extraction">>
>;

export type TransformersEmbeddingExtractor = FeatureExtractor;

const DEFAULT_MODEL_ID = "Xenova/multilingual-e5-small";
const DEFAULT_DIMENSIONS = 384;

export interface TransformersEmbeddingProviderOptions {
  modelId?: string;
  dimensions?: number;
  queryPrefix?: string;
  documentPrefix?: string;
  dtype?: DataType;
  cacheDir?: string;
  localFilesOnly?: boolean;
  extractor?: FeatureExtractor;
}

export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;

  private readonly queryPrefix: string;
  private readonly documentPrefix: string;
  private readonly dtype: DataType | undefined;
  private readonly cacheDir: string | undefined;
  private readonly localFilesOnly: boolean;
  private extractor: FeatureExtractor | undefined;
  private loading: Promise<FeatureExtractor> | undefined;

  constructor(options: TransformersEmbeddingProviderOptions = {}) {
    this.modelId = options.modelId ?? DEFAULT_MODEL_ID;
    this.dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;
    this.queryPrefix = options.queryPrefix ?? "query: ";
    this.documentPrefix = options.documentPrefix ?? "passage: ";
    this.dtype = options.dtype;
    this.cacheDir = options.cacheDir;
    this.localFilesOnly = options.localFilesOnly ?? false;
    this.extractor = options.extractor;

    if (!Number.isInteger(this.dimensions) || this.dimensions < 1) {
      throw new Error("Embedding dimensions must be a positive integer.");
    }
  }

  async embedQuery(text: string): Promise<readonly number[]> {
    const [embedding] = await this.embed([
      `${this.queryPrefix}${requireText(text)}`,
    ]);
    if (!embedding)
      throw new Error("Embedding provider returned no query vector.");
    return embedding;
  }

  async embedDocuments(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    if (texts.length === 0) return [];
    return this.embed(
      texts.map((text) => `${this.documentPrefix}${requireText(text)}`),
    );
  }

  private async embed(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    const extractor = await this.getExtractor();
    const output = await extractor([...texts], {
      pooling: "mean",
      normalize: true,
    });
    const values = output.tolist();

    if (!Array.isArray(values) || !values.every(Array.isArray)) {
      throw new Error(
        "Embedding provider returned an unexpected tensor shape.",
      );
    }

    return values.map((value) => {
      const vector = value.map((component) => {
        if (typeof component !== "number" || !Number.isFinite(component)) {
          throw new Error(
            "Embedding provider returned a non-numeric component.",
          );
        }
        return component;
      });
      if (vector.length !== this.dimensions) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.dimensions}, received ${vector.length}.`,
        );
      }
      return vector;
    });
  }

  private async getExtractor(): Promise<FeatureExtractor> {
    if (this.extractor) return this.extractor;
    this.loading ??= this.loadExtractor();
    this.extractor = await this.loading;
    return this.extractor;
  }

  private async loadExtractor(): Promise<FeatureExtractor> {
    return pipeline("feature-extraction", this.modelId, {
      ...(this.dtype ? { dtype: this.dtype } : {}),
      ...(this.cacheDir ? { cache_dir: this.cacheDir } : {}),
      local_files_only: this.localFilesOnly,
    });
  }
}

function requireText(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Embedding text is required.");
  return normalized;
}
