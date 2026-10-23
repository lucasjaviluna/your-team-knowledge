# Estado actual y punto de continuación

**Revisado:** 2026-10-22
**Alcance:** referencia de Agent Memory y runtime nativo Go.

## Decisión vigente

El repositorio queda dedicado a sesiones agenticas con Agent Memory. RAG,
PostgreSQL/pgvector, embeddings, API documental y Context Orchestrator fueron
retirados del alcance vigente. La decisión y el contexto para retomarlos en un
proyecto separado están en [ADR 0009](adr/0009-agent-memory-only-scope.md).

## Implementado

- Core SQLite/FTS5 y lifecycle de memorias.
- Sesiones, resúmenes, relaciones, revisión y retención.
- MCP `stdio` con aislamiento por proyecto.
- CLI `doctor`, backup, upgrade y rollback.
- Setup/uninstall de Codex con MCP global y activación local.
- Paquetes nativos Windows/Linux, checksum, firma y prueba de instalación limpia.
- Fixture de conformance compartido entre TypeScript y Go.

## Siguiente trabajo

Ejecutar el piloto del binario Go en repositorios consumidores y validar su
funcionamiento en hosts MCP reales. El plan operativo está en
[agent-memory-go-migration-plan.md](agent-memory-go-migration-plan.md).
El análisis del estado actual y la secuencia de mejoras están en
[agent-memory-roadmap-2026-10-22.md](agent-memory-roadmap-2026-10-22.md).

## Verificación

La CI debe ejecutar únicamente checks de Agent Memory: formato, typecheck,
lint, build, tests, contratos de paquete/release, smoke MCP, conformance Go,
setup, release nativo y `go test ./...`. No requiere PostgreSQL, pgvector ni
modelos de embeddings.
