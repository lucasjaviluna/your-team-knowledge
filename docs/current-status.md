# Estado actual y punto de continuación

**Revisado:** 2026-10-26

**Alcance:** Agent Memory y runtime nativo Go.

## Alcance vigente

El repositorio se dedica a memoria durable local de agentes. RAG,
PostgreSQL/pgvector, embeddings, API documental y Context Orchestrator fueron
retirados del alcance; ver [ADR 0009](adr/0009-agent-memory-only-scope.md).

## Implementado

- Core Go con SQLite/FTS5; sesiones, memorias, `subjectKey`, relaciones,
  lifecycle, revisión, retención y consolidación.
- Migración FTS5 para bases heredadas: crea y rellena el índice de forma
  transaccional cuando falta, con rollback si alguna memoria no se puede indexar.
- MCP `stdio` con once herramientas y proceso ligado a un proyecto; briefing
  compacto, búsqueda lexical, corrección versionada y consolidación confirmada.
- Setup/uninstall para Codex, Claude Code, Pi y OpenCode. Codex registra MCP en
  `CODEX_HOME/config.toml` y activa instrucciones por proyecto; los otros hosts
  usan registros de proyecto.
- CLI doctor, backup, upgrade y rollback. Doctor valida TOML Codex, acceso y
  tipo de ruta SQLite, integridad `quick_check` y registro/ejecutable del host.
- CLI de lectura `search`, `list`, `get` y `stats`, con scope de proyecto,
  visibilidad por área y lifecycle; admite salida `--json`.
- Evaluación sintética de retrieval y conformance; salida JSON con métricas
  reproducibles.
- CI en Windows x64, Linux x64 y macOS arm64 con formato, vet, pruebas y build.
- Canal de release firmado operativo: `v0.1.12` publicado tras CI verde; se
  confirmaron los activos de Windows x64, Linux x64 y macOS arm64. El job de
  release compila secuencialmente los tres targets y la publicación verifica
  manifiestos, SHA-256 y firmas Ed25519 antes de publicar el borrador.
- Documentación técnica integral en
  [technical-architecture.md](technical-architecture.md).

El usuario informó que ya ejecutó la comprobación del runbook y que el
resultado parece correcto. Aún falta registrar en el runbook las combinaciones
repo-host, consultas, métricas e incidencias para confirmar formalmente sus
criterios. La validación manual Linux sigue aplazada; la CI Linux se acepta
como gate. El harness sintético no representa una medición real.

## Pendiente

1. **Cerrar el registro del piloto:** incorporar al
   [runbook del piloto](agent-memory-pilot-runbook.md) los dos repositorios,
   los dos hosts, resultados de consultas/tareas, métricas e incidencias; luego
   confirmar si cumple todos los umbrales. No hace falta repetir las pruebas.
2. **Siguiente incremento independiente: PR 08, conservación de JSONC en
   OpenCode.** Claude Code no está disponible para el usuario; su evaluación de
   lifecycle queda diferida. El doctor `--read-only` ya permite inspeccionar
   schema e integridad sin migrar.

La concurrencia local SQLite quedó caracterizada el 2026-10-26: ocho procesos
independientes realizaron guardados y upserts concurrentes sobre una clave
compartida; se verificaron migración simultánea, rollback al interrumpir una
transacción y backup coherente con WAL activo. El escenario multiproceso pasó
cinco ejecuciones consecutivas en Windows: 320 escrituras por ejecución en
2,0–3,8 s, sin errores `SQLITE_BUSY`/`SQLITE_LOCKED`. La política se describe en
[ADR 0011](adr/0011-sqlite-multiprocess-concurrency.md). El usuario informó
que ejecutó el piloto del runbook con resultado preliminar correcto; queda
pendiente consolidar las evidencias antes de declarar satisfechos todos los
criterios.

La CI está definida en `.github/workflows/ci.yml`; la custodia y procedimiento
de firma están en [release-policy.md](release-policy.md). El workflow de
`v0.1.12` empaquetó, verificó y publicó el release firmado correctamente.

## Verificación y referencias

La CI ejecuta `gofmt`, `go vet ./...`, `go test ./...` y build en Windows,
Linux y macOS arm64. Para estado priorizado y criterios, ver
[agent-memory-roadmap](agent-memory-roadmap-2026-10-22.md) y
[implementation-plan](implementation-plan.md). Para el detalle de diseño,
ver [technical-architecture](technical-architecture.md).
