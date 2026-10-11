import type { KnowledgeSearchInput } from "../../application/index.js";

export interface SqlQuery {
  text: string;
  values: readonly unknown[];
}

export function buildKnowledgeSearchQuery(
  input: Required<KnowledgeSearchInput>,
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
        ts_rank_cd(to_tsvector('simple', dc.content), search_query.query) AS score
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
        AND to_tsvector('simple', dc.content) @@ search_query.query
      ORDER BY score DESC, dc.ordinal ASC
      LIMIT $5`,
    values: [
      input.workspaceId,
      input.actorId,
      input.teamIds,
      input.query,
      input.limit,
    ],
  };
}
