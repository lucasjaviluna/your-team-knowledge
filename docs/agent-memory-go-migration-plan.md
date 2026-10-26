# Estado de migración de Agent Memory a Go

## Decisión completada

Agent Memory usa exclusivamente el runtime nativo Go `ytk-memory`. El runtime
TypeScript, Node dependencies, pruebas y utilidades de release/smoke fueron
retirados.

## Capacidades implementadas

- SQLite y FTS5 locales mediante driver pure Go, sin CGo.
- Sesiones, resúmenes, memorias tipadas, `subjectKey`, relaciones, corrección
  versionada, briefing, búsqueda lexical, lifecycle, revisión, retención y
  consolidación con vista previa.
- Once herramientas MCP sobre `stdio`, con proceso fijado a un proyecto.
- CLI de setup/uninstall para Codex, Claude Code, Pi y OpenCode, además de
  doctor, backup, upgrade, rollback, conformance, evaluate y release.
- CI para Windows x64, Linux x64 y macOS arm64.
- Paquetes firmados Ed25519, SHA-256, manifiesto y verificación. El workflow de
  tags construye, smoke-testea y verifica antes de publicar.
- Documentación técnica integral en
  [technical-architecture.md](technical-architecture.md).

## Validación

La CI ejecuta `gofmt`, `go vet ./...`, `go test ./...` y build en las tres
plataformas. El piloto manual se confirmó en Windows; la prueba manual Linux
queda aplazada y el gate Linux de CI es suficiente por ahora. La evaluación
sintética entrega baseline lexical, no resultados de tareas reales.

## Pendiente

1. Validar retrieval y hosts en repositorios consumidores y caracterizar
   concurrencia/reintentos.

Ver [release-policy.md](release-policy.md), [current-status.md](current-status.md)
y la [hoja de ruta](agent-memory-roadmap-2026-10-22.md).
