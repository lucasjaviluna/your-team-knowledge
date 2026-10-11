import type { KnowledgeSearchInput } from "../../application/index.js";

export interface SqlQuery {
  text: string;
  values: readonly unknown[];
}

export function buildKnowledgeSearchQuery(
  input: Required<
    Pick<
      KnowledgeSearchInput,
      "workspaceId" | "actorId" | "teamIds" | "query" | "limit"
    >
  > &
    Pick<KnowledgeSearchInput, "queryEmbedding">,
): SqlQuery {
  return {
    text: `
      WITH search_query AS (
        SELECT plainto_tsquery('simple', $4) AS query
      )
      SELECT
        d.id AS document_id,
        d.source_id,
        d.external_id,
        d.workspace_id,
        d.title,
        d.uri,
        d.version,
        d.status,
        d.access_policy,
        d.created_at,
        d.updated_at,
        dc.id AS chunk_id,
        dc.ordinal,
        dc.content,
        dc.metadata,
        s.kind AS source_kind,
        s.name AS source_name,
        CASE
          WHEN $5::vector(384) IS NULL THEN
            ts_rank_cd(to_tsvector('simple', dc.content), search_query.query)
          ELSE
            0.5 * ts_rank_cd(to_tsvector('simple', dc.content), search_query.query)
            + 0.5 * COALESCE(1 - (dc.embedding <=> $5::vector(384)), 0)
        END AS score
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      JOIN knowledge_sources s ON s.id = d.source_id
      CROSS JOIN search_query
      WHERE d.workspace_id = $1
        AND d.status = 'active'
        AND (
          (
            jsonb_array_length(COALESCE(d.access_policy->'actorIds', '[]'::jsonb)) = 0
            AND jsonb_array_length(COALESCE(d.access_policy->'teamIds', '[]'::jsonb)) = 0
          )
          OR COALESCE(d.access_policy->'actorIds', '[]'::jsonb) ? $2
          OR COALESCE(d.access_policy->'teamIds', '[]'::jsonb) ?| $3::text[]
        )
        AND (
          to_tsvector('simple', dc.content) @@ search_query.query
          OR ($5::vector(384) IS NOT NULL AND dc.embedding IS NOT NULL)
        )
      ORDER BY score DESC, dc.ordinal ASC
      LIMIT $6`,
    values: [
      input.workspaceId,
      input.actorId,
      input.teamIds,
      input.query,
      toVectorValue(input.queryEmbedding),
      input.limit,
    ],
  };
}

function toVectorValue(
  embedding: readonly number[] | undefined,
): string | null {
  return embedding ? `[${embedding.join(",")}]` : null;
}
