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
- Briefing inicial compacto de memorias activas en `memory_session_start`, con límites configurables y prioridad explícita.
- Herramientas MCP para listar/completar revisiones, corregir memorias con historial de versiones, consultar relaciones y consolidar memorias con vista previa y confirmación explícita.
- CLI `doctor`, backup, upgrade y rollback.
- Setup/uninstall de Codex con MCP global y activación local.
- Compilación y pruebas en Windows/Linux desde GitHub Actions.
- Suite de pruebas Go para core, MCP y setup.

## Runtime Go

El usuario confirmó que el piloto del
[runbook](agent-memory-pilot-runbook.md) se completó correctamente en Windows.
La validación manual en Linux queda aplazada; por ahora, que pasen los checks
Linux de GitHub Actions es suficiente. Go es el único runtime de Agent Memory.

El canal de release confiable está implementado inicialmente: el binario Go
genera artefactos reproducibles con manifiesto, SHA-256 y firma Ed25519, y
ofrece verificación antes de instalar. Quedan pendientes la custodia real de
la clave, la política de rotación/revocación y ejecutar el primer tag aprobado.
La secuencia de mejoras está en
[la hoja de ruta](agent-memory-roadmap-2026-10-22.md).

Claude Code, Pi y OpenCode son hosts automatizados por proyecto: Claude usa
`.mcp.json`/`CLAUDE.md`, Pi usa `.pi/mcp.json`/`AGENTS.md`, y OpenCode usa
`opencode.json[c]`/`AGENTS.md`. Se preservan configuraciones ajenas y no se toca
el registro global de Codex. La secuencia de hosts priorizada quedó completa.

## Verificación

La CI ejecuta `gofmt`, `go vet`, `go test` y `go build` sobre el módulo Go. No
requiere Node.js, PostgreSQL, pgvector ni modelos de embeddings.

El briefing, lifecycle y la evaluación de recuperación están implementados en
código. El corpus sintético y el comando `ytk-memory evaluate` aportan métricas
reproducibles de recall, precisión, latencia local y tamaño de contexto.
