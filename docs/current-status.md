# Estado actual y punto de continuación

**Revisado:** 2026-10-25

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
- Evaluación sintética de retrieval y conformance; salida JSON con métricas
  reproducibles.
- CI en Windows x64, Linux x64 y macOS arm64 con formato, vet, pruebas y build.
- Canal de release firmado operativo: `v0.1.5` publicado tras CI verde en
  Windows x64, Linux x64 y macOS arm64. Genera paquetes, manifiesto, SHA-256,
  firma Ed25519, verificación de artefactos y smoke test por tag.
- Documentación técnica integral en
  [technical-architecture.md](technical-architecture.md).

El usuario confirmó el piloto en Windows. La validación manual Linux está
aplazada; la CI Linux se acepta como gate. El harness sintético no representa
una medición de relevancia o adopción en tareas reales.

## Pendiente

1. **Validar en consumidores reales:** medir calidad del briefing/búsqueda y
   comprobar cada host cuando haya repositorios disponibles.
2. **Caracterizar concurrencia y reintentos** con más de un proceso SQLite.

La CI está definida en `.github/workflows/ci.yml`; la custodia y procedimiento
de firma están en [release-policy.md](release-policy.md). El workflow de
`v0.1.5` empaquetó, verificó y publicó el release firmado correctamente.

## Verificación y referencias

La CI ejecuta `gofmt`, `go vet ./...`, `go test ./...` y build en Windows,
Linux y macOS arm64. Para estado priorizado y criterios, ver
[agent-memory-roadmap](agent-memory-roadmap-2026-10-22.md) y
[implementation-plan](implementation-plan.md). Para el detalle de diseño,
ver [technical-architecture](technical-architecture.md).
