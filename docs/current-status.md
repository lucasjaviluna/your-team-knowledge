# Estado actual y punto de continuación

**Revisado:** 2026-10-25
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

## Transición a Go

El usuario confirmó que el piloto del
[runbook](agent-memory-pilot-runbook.md) se completó correctamente en Windows.
La validación manual en Linux queda aplazada; por ahora, que pasen los checks
Linux de GitHub Actions es suficiente. Go queda como runtime principal de
Agent Memory. El paquete TypeScript se conserva temporalmente como
compatibilidad durante la transición, con el objetivo final de retirar su
runtime y dejar sólo Go.

El siguiente trabajo es completar la transición de consumidores al binario Go
y retirar el runtime TypeScript al cerrar el periodo de compatibilidad. El plan
está en [migración y distribución](agent-memory-go-migration-plan.md); la
secuencia de mejoras está en
[la hoja de ruta](agent-memory-roadmap-2026-10-22.md).

## Verificación

La CI debe ejecutar únicamente checks de Agent Memory: formato, typecheck,
lint, build, tests, contratos de paquete/release, smoke MCP, conformance Go,
setup, release nativo y `go test ./...`. No requiere PostgreSQL, pgvector ni
modelos de embeddings.
