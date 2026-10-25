# Plan de implementación

Este plan documenta los pasos pendientes del repositorio de referencia de Agent
Memory: madurar el runtime nativo Go y validarlo en repositorios consumidores.

## Completado

- Core SQLite/FTS5 en Go.
- Sesiones, búsqueda, guardado idempotente, relaciones y lifecycle.
- Revisión, retención, backup, upgrade y rollback.
- MCP `stdio` con aislamiento por proyecto.
- Setup/uninstall de Codex y activación local.
- Pruebas y compilación en Windows/Linux desde GitHub Actions.

## Próximo tramo

El estado actual, las mejoras y los criterios de salida están en
[Hoja de ruta de Agent Memory](agent-memory-roadmap-2026-10-22.md).

1. Ejecutar el piloto en repositorios consumidores.
2. Evaluar herramientas, aislamiento, persistencia y recuperación en tareas reales.
3. Endurecer instalación, actualización, diagnóstico y recuperación.
4. Documentar los resultados del piloto y cerrar las brechas funcionales.

## Fuera de alcance

RAG, PostgreSQL/pgvector, embeddings, ingesta documental, API HTTP y
Context Orchestrator se retiraron del repositorio. Ver [ADR 0009](adr/0009-agent-memory-only-scope.md)
para recuperar esa línea de trabajo en un proyecto separado.
