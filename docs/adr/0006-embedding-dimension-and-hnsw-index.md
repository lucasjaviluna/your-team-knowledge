# ADR 0006: Dimensión provisional de embeddings e índice vectorial

## Estado

Aceptada provisionalmente.

## Contexto

El repositorio PostgreSQL necesita una dimensión estable para validar los vectores y elegir un índice pgvector. El benchmark ampliado comparó dos modelos multilingües de 384 dimensiones y favoreció a `Xenova/multilingual-e5-small` en cobertura y precisión de cita.

## Decisión

- Usar provisionalmente `Xenova/multilingual-e5-small` con embeddings de 384 dimensiones.
- Declarar la columna como `vector(384)` en PostgreSQL.
- Crear un índice HNSW con `vector_cosine_ops` para chunks con embedding.
- Generar embeddings durante la ingesta mediante `EmbeddingProvider` antes de llamar a `KnowledgeRepository.save`.
- Mantener la decisión revisable cuando existan documentos y consultas reales representativos.

## Consecuencias

- PostgreSQL rechaza vectores con dimensión incorrecta en la frontera de persistencia.
- La búsqueda vectorial puede usar el índice HNSW a medida que crece el corpus.
- Cambiar de proveedor o dimensión requiere benchmark, migración y regeneración de embeddings.
