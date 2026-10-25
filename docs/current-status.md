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
- Compilación y pruebas en Windows/Linux desde GitHub Actions.
- Suite de pruebas Go para core, MCP y setup.

## Runtime Go

El usuario confirmó que el piloto del
[runbook](agent-memory-pilot-runbook.md) se completó correctamente en Windows.
La validación manual en Linux queda aplazada; por ahora, que pasen los checks
Linux de GitHub Actions es suficiente. Go es el único runtime de Agent Memory.

El siguiente trabajo es mejorar el binario Go y sus consumidores. La secuencia
de mejoras está en
[la hoja de ruta](agent-memory-roadmap-2026-10-22.md).

## Verificación

La CI ejecuta `gofmt`, `go vet`, `go test` y `go build` sobre el módulo Go. No
requiere Node.js, PostgreSQL, pgvector ni modelos de embeddings.
