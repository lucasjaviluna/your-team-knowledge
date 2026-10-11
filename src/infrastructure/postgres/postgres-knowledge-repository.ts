import { Pool, type PoolClient } from "pg";

import type {
  KnowledgeRepository,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
} from "../../application/index.js";
import type {
  AccessPolicy,
  Document,
  DocumentChunk,
  KnowledgeSource,
} from "../../domain/index.js";

import { buildKnowledgeSearchQuery } from "./query.js";

interface SearchRow {
  document_id: string;
  source_id: string;
  external_id: string;
  workspace_id: string;
  title: string;
  uri: string | null;
  version: string;
  status: Document["status"];
  access_policy: AccessPolicy;
  created_at: Date;
  updated_at: Date;
  chunk_id: string;
  ordinal: number;
  content: string;
  metadata: Record<string, string>;
  source_kind: string;
  source_name: string;
  score: number;
}

export class PostgresKnowledgeRepository implements KnowledgeRepository {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(connectionString: string, pool?: Pool) {
    this.pool = pool ?? new Pool({ connectionString });
    this.ownsPool = !pool;
  }

  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async save(
    source: KnowledgeSource,
    document: Document,
    chunks: readonly DocumentChunk[],
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.saveSource(client, source);
      const documentId = await this.saveDocument(client, document);

      await client.query("DELETE FROM document_chunks WHERE document_id = $1", [
        documentId,
      ]);
      for (const chunk of chunks) {
        await client.query(
          `INSERT INTO document_chunks (id, document_id, ordinal, content, metadata, embedding)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector)`,
          [
            chunk.id,
            documentId,
            chunk.ordinal,
            chunk.content,
            JSON.stringify(chunk.metadata),
            toVectorValue(chunk.embedding),
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async search(
    input: KnowledgeSearchInput,
  ): Promise<readonly KnowledgeSearchResult[]> {
    const query = buildKnowledgeSearchQuery({
      ...input,
      limit: input.limit ?? 20,
    });
    const result = await this.pool.query<SearchRow>(query.text, [
      ...query.values,
    ]);

    return result.rows.map(toSearchResult);
  }

  private async saveSource(
    client: PoolClient,
    source: KnowledgeSource,
  ): Promise<void> {
    await client.query(
      `INSERT INTO knowledge_sources (id, kind, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, name = EXCLUDED.name`,
      [source.id, source.kind, source.name],
    );
  }

  private async saveDocument(
    client: PoolClient,
    document: Document,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO documents (
        id, source_id, external_id, workspace_id, title, uri, version,
        status, access_policy, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
      ON CONFLICT (source_id, external_id, version)
      DO UPDATE SET
        title = EXCLUDED.title,
        uri = EXCLUDED.uri,
        status = EXCLUDED.status,
        access_policy = EXCLUDED.access_policy,
        updated_at = EXCLUDED.updated_at
      RETURNING id`,
      [
        document.id,
        document.sourceId,
        document.externalId,
        document.workspaceId,
        document.title,
        document.uri ?? null,
        document.version,
        document.status,
        JSON.stringify(document.accessPolicy),
        document.createdAt,
        document.updatedAt,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("PostgreSQL did not return the document id.");
    return id;
  }
}

function toVectorValue(
  embedding: readonly number[] | undefined,
): string | null {
  return embedding ? `[${embedding.join(",")}]` : null;
}

function toSearchResult(row: SearchRow): KnowledgeSearchResult {
  return {
    document: {
      id: row.document_id,
      sourceId: row.source_id,
      externalId: row.external_id,
      workspaceId: row.workspace_id,
      title: row.title,
      ...(row.uri ? { uri: row.uri } : {}),
      version: row.version,
      status: row.status,
      accessPolicy: row.access_policy,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    chunk: {
      id: row.chunk_id,
      documentId: row.document_id,
      ordinal: row.ordinal,
      content: row.content,
      metadata: row.metadata,
    },
    source: {
      id: row.source_id,
      kind: row.source_kind,
      name: row.source_name,
    },
    score: row.score,
  };
}
