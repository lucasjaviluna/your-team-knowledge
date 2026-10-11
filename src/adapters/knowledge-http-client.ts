import type {
  KnowledgeQueryResponse,
  MarkdownIngestionInput,
  MarkdownIngestionResult,
} from "../application/index.js";
import type { KnowledgeSource } from "../domain/index.js";

export interface KnowledgeHttpClientOptions {
  baseUrl: string;
  getToken?: () => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
}

export interface KnowledgeHttpQueryInput {
  workspaceId: string;
  query: string;
  limit?: number;
}

export class KnowledgeApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Knowledge API request failed with status ${status}.`);
    this.name = "KnowledgeApiError";
  }
}

export class KnowledgeHttpClient {
  private readonly baseUrl: string;
  private readonly getToken: KnowledgeHttpClientOptions["getToken"];
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: KnowledgeHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.getToken = options.getToken;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async query(input: KnowledgeHttpQueryInput): Promise<KnowledgeQueryResponse> {
    return this.post<KnowledgeQueryResponse>("/v1/knowledge/query", input);
  }

  async ingestMarkdown(
    source: KnowledgeSource,
    document: MarkdownIngestionInput,
  ): Promise<MarkdownIngestionResult> {
    return this.post<MarkdownIngestionResult>("/v1/knowledge/documents", {
      source,
      document,
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const token = this.getToken ? await this.getToken() : undefined;
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (token) headers.authorization = `Bearer ${token}`;

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) throw new KnowledgeApiError(response.status, payload);
    return payload as T;
  }
}
