import type {
  KnowledgeClient,
  KnowledgeHttpQueryInput,
} from "./knowledge-http-client.js";
import type {
  KnowledgeQueryResponse,
  MarkdownIngestionInput,
  MarkdownIngestionResult,
} from "../application/index.js";
import type { KnowledgeSource } from "../domain/index.js";

export interface PiHarnessToolDefinition {
  name: "search_corporate_knowledge" | "ingest_corporate_document";
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
}

/** Consumer-facing facade for pi-harness-style agents. */
export class PiHarnessKnowledgeAdapter {
  constructor(private readonly client: KnowledgeClient) {}

  async searchCorporateKnowledge(
    input: KnowledgeHttpQueryInput,
  ): Promise<KnowledgeQueryResponse> {
    return this.client.query(input);
  }

  async ingestCorporateDocument(
    source: KnowledgeSource,
    document: MarkdownIngestionInput,
  ): Promise<MarkdownIngestionResult> {
    return this.client.ingestMarkdown(source, document);
  }

  toolDefinitions(): readonly PiHarnessToolDefinition[] {
    return [
      {
        name: "search_corporate_knowledge",
        description:
          "Search authorized corporate knowledge and return traceable citations.",
        inputSchema: {
          type: "object",
          required: ["workspaceId", "query"],
          properties: {
            workspaceId: { type: "string" },
            query: { type: "string" },
            limit: { type: "integer", minimum: 1 },
          },
          additionalProperties: false,
        },
      },
      {
        name: "ingest_corporate_document",
        description:
          "Ingest a document into authorized corporate knowledge with provenance.",
        inputSchema: {
          type: "object",
          required: ["source", "document"],
          properties: {
            source: { type: "object" },
            document: { type: "object" },
          },
          additionalProperties: false,
        },
      },
    ];
  }
}
