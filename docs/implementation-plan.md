# Plan de implementación

El objetivo vigente es madurar Agent Memory y alcanzar paridad funcional con
Engram mediante el runtime nativo Go.

## Completado

- Core SQLite/FTS5 compatible con el runtime TypeScript.
- Sesiones, búsqueda, guardado idempotente, relaciones y lifecycle.
- Revisión, retención, backup, upgrade y rollback.
- MCP `stdio` con aislamiento por proyecto.
- Setup/uninstall de Codex y activación local.
- Conformance, empaquetado y releases Windows/Linux.

## Próximo tramo

1. Ejecutar el piloto en repositorios consumidores.
2. Comparar herramientas, aislamiento, persistencia y recuperación contra Engram.
3. Endurecer instalación, actualización, diagnóstico y recuperación.
4. Documentar las diferencias restantes y cerrar la paridad funcional.

## Fuera de alcance

RAG, PostgreSQL/pgvector, embeddings, ingesta documental, API HTTP y
Context Orchestrator se retiraron del repositorio. Ver [ADR 0009](adr/0009-agent-memory-only-scope.md)
para recuperar esa línea de trabajo en un proyecto separado.
