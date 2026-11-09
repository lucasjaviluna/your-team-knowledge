# Estado actual y punto de continuación

**Revisado:** 2026-11-09

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
- MCP `stdio` con catorce herramientas y proceso ligado a un proyecto; briefing
  compacto, búsqueda lexical, corrección versionada y consolidación confirmada.
- Setup/uninstall para Codex, Claude Code, Pi y OpenCode. Codex registra MCP en
  `CODEX_HOME/config.toml` y activa instrucciones por proyecto; los otros hosts
  usan registros de proyecto.
- CLI doctor, backup, upgrade y rollback. Doctor valida TOML Codex, acceso y
  tipo de ruta SQLite, integridad `quick_check` y registro/ejecutable del host.
- Transferencia portable v1 por CLI: exportación seleccionada, preview y
  aplicación confirmada; ver [guía](agent-memory-portable-transfer.md).
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

El último release publicado comprobado es `v0.1.12`; el commit local `2b86fb1`
está ocho commits por delante y sus capacidades nuevas, incluida transferencia
portable, no deben atribuirse a ese release. Al revisar el 2026-11-09, la
[CI de ese commit](https://github.com/lucasjaviluna/your-team-knowledge/actions/runs/42646238871)
estaba en cola; no se afirma que haya pasado. La suite Go, vet y build pasaron
localmente en Windows en la implementación.

El usuario confirmó que el piloto con el binario Go en Codex funciona. La
validación con Codex se considera completada para el alcance que ejecutó el
usuario. Claude Code no está disponible y queda postergado; no se le atribuye
validación real. La validación manual Linux también sigue aplazada; la CI Linux
se acepta como gate. El harness sintético no representa una medición real.

## Pendiente

1. **Completado (v1): timeline de memorias.** `memory_timeline` lista registros
   por última actualización, permite acotar el rango temporal e incluye estados
   históricos. La tabla no conserva todas las transiciones de lifecycle.
2. **Completado (v1): candidatos a conflicto.** Consulta léxica revisable y
   de sólo lectura. La [línea base sintética](agent-memory-conflict-test-report-test2.md)
   registró recall macro de 55,6 % y precisión macro de 22,5 % a k=10;
   no mide calidad real. La cobertura MCP del corpus y algunos controles
   funcionales siguen pendientes.
   **Exportación portable v1:** implementada por CLI con preview e
   importación confirmada; ver [guía](agent-memory-portable-transfer.md).
3. **PR 09: instalación y actualización reproducibles.** Evaluar la instalación
   verificable del release firmado, conservar la clave pública confiable y
   permitir rollback. La integración OpenCode admite JSONC y preserva la
   configuración semántica ajena, pero al modificar el archivo lo reescribe
   como JSON indentado; no preserva comentarios ni formato textual. Claude Code
   real y Linux manual siguen postergados por disponibilidad.

La concurrencia local SQLite quedó caracterizada el 2026-10-26: ocho procesos
independientes realizaron guardados y upserts concurrentes sobre una clave
compartida; se verificaron migración simultánea, rollback al interrumpir una
transacción y backup coherente con WAL activo. El escenario multiproceso pasó
cinco ejecuciones consecutivas en Windows: 320 escrituras por ejecución en
2,0–3,8 s, sin errores `SQLITE_BUSY`/`SQLITE_LOCKED`. La política se describe en
[ADR 0011](adr/0011-sqlite-multiprocess-concurrency.md). El usuario informó
que ejecutó el piloto con Codex y confirmó que funciona. El runbook mantiene
los pasos para reproducir o ampliar la validación; no se exige completar una
matriz con Claude mientras ese host no esté disponible.

La CI está definida en `.github/workflows/ci.yml`; la custodia y procedimiento
de firma están en [release-policy.md](release-policy.md). El workflow de
`v0.1.12` empaquetó, verificó y publicó el release firmado correctamente.

## Verificación y referencias

La CI ejecuta `gofmt`, `go vet ./...`, `go test ./...` y build en Windows,
Linux y macOS arm64. Para estado priorizado y criterios, ver
[agent-memory-roadmap](agent-memory-roadmap-2026-10-22.md) y
[implementation-plan](implementation-plan.md). Para el detalle de diseño,
ver [technical-architecture](technical-architecture.md).
