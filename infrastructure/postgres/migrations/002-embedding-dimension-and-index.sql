ALTER TABLE document_chunks
  ALTER COLUMN embedding TYPE vector(384)
  USING embedding::vector(384);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
