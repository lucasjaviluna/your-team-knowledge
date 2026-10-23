# Estado histórico\n\n> Este ADR queda supersedido por [ADR 0009](0009-agent-memory-only-scope.md). Se conserva únicamente como contexto para un futuro proyecto RAG.\n\n# ADR 0005: Recuperación híbrida lexical y vectorial

## Estado

Aceptada para la primera implementación de Corporate Knowledge RAG.

## Contexto

La búsqueda documental debe reconocer tanto coincidencias explícitas de términos como similitud semántica. Los permisos deben seguir aplicándose antes de ordenar y devolver resultados.

## Decisión

El repositorio PostgreSQL admite un embedding opcional en la consulta:

- sin embedding: búsqueda full-text con `ts_rank_cd`;
- con embedding: combinación de `ts_rank_cd` y similitud coseno de `pgvector`;
- la rama vectorial exige una similitud coseno mínima de `0.5` para evitar que cualquier chunk con embedding entre como resultado irrelevante;
- los filtros de workspace, actor, equipo y estado activo se ejecutan dentro de la misma consulta SQL;
- el repositorio no genera embeddings: recibe vectores producidos por un `EmbeddingProvider` externo al módulo de infraestructura.

La puntuación inicial usa un peso 0.5 para la señal lexical y 0.5 para la similitud coseno. Es una línea base verificable, no un contrato definitivo de relevancia.

## Consecuencias

- Se puede adoptar búsqueda semántica sin perder consultas exactas.
- Los tests pueden verificar el repositorio con vectores pequeños antes de fijar el modelo productivo.
- Antes de añadir un índice vectorial especializado se debe elegir proveedor y dimensión estable.
- La ponderación y el reranking deberán evaluarse con un dataset representativo en la etapa de calidad.
