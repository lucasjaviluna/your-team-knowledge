CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id),
  external_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  uri TEXT,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded', 'needs_review')),
  access_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (source_id, external_id, version)
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, ordinal)
);

CREATE INDEX IF NOT EXISTS documents_workspace_status_idx
  ON documents (workspace_id, status);

CREATE INDEX IF NOT EXISTS document_chunks_document_ordinal_idx
  ON document_chunks (document_id, ordinal);

CREATE INDEX IF NOT EXISTS document_chunks_content_fts_idx
  ON document_chunks USING GIN (to_tsvector('simple', content));
