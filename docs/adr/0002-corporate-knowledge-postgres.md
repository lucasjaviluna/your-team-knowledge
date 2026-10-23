# Estado histórico\n\n> Este ADR queda supersedido por [ADR 0009](0009-agent-memory-only-scope.md). Se conserva únicamente como contexto para un futuro proyecto RAG.\n\n# ADR 0002: PostgreSQL y pgvector para Corporate Knowledge RAG

## Estado

Aceptada.

## Decisión

Corporate Knowledge RAG usa PostgreSQL, pgvector y búsqueda full-text de PostgreSQL.

## Consecuencias

- Documentos, metadatos, permisos, auditoría y vectores comparten una base transaccional.
- El retrieval combinará búsqueda lexical y vectorial.
- El servicio se ejecuta centralmente y se consume mediante contratos de red independientes del lenguaje.
