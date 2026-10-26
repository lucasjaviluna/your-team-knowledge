# Plan de implementación

**Revisado:** 2026-10-25

Este documento refleja el estado del runtime de Agent Memory y el trabajo que
falta para su distribución y operación sostenibles. El detalle arquitectónico
está en [technical-architecture.md](technical-architecture.md); la secuencia y
criterios de producto están en la [hoja de ruta](agent-memory-roadmap-2026-10-22.md).

## Implementado

- Runtime único en Go con core SQLite/FTS5, sesiones, memorias, `subjectKey`,
  relaciones, lifecycle, revisión, retención y consolidación.
- La migración crea y rellena FTS5 de forma transaccional cuando falta en una
  base heredada; una falla de backfill revierte el índice completo.
- Once herramientas MCP por `stdio`, con proceso fijado a proyecto, owner de
  sesión, briefing inicial, búsqueda lexical y confirmación previa a consolidar.
- CLI `doctor`, backup, upgrade y rollback; el doctor diagnostica TOML de
  Codex, ruta/acceso SQLite y ejecutable MCP registrado. Hay cobertura de
  recuperación de base heredada.
- Setup/uninstall de Codex, Claude Code, Pi y OpenCode, con archivos
  administrados y preservación de configuración ajena.
- Evaluación sintética de retrieval y runner de conformance.
- CI de Go en Windows x64, Linux x64 y macOS arm64 con `gofmt`, `go vet`,
  `go test` y build.
- Release firmado Ed25519 operativo: `v0.1.5` fue empaquetado, verificado y
  publicado tras CI verde en Windows x64, Linux x64 y macOS arm64.
- Documentación técnica integral en
  [technical-architecture.md](technical-architecture.md).

El piloto de uso se confirmó en Windows. La validación manual en Linux está
aplazada y los checks Linux de CI son el gate aceptado. La validación de
integraciones en cada host real debe hacerse cuando haya repositorios
consumidores disponibles; los tests actuales validan adaptadores y archivos.

## Pendiente, en orden

1. **Ampliar validación con consumidores reales.** Probar hosts usados por el
   equipo y tareas reales, medir utilidad/ruido de briefing y búsqueda, y
   documentar hallazgos. El corpus sintético sólo entrega una línea base
   reproducible; no es evaluación externa.
2. **Ejercitar concurrencia y reintentos.** Medir comportamiento con varios
   procesos SQLite locales e idempotencia de las operaciones compuestas antes
   de recomendar un patrón de uso concurrente.

## Decisiones opcionales de producto

- Evaluar memoria personal/global, intercambio entre repositorios o
  sincronización entre equipos sólo con un caso de uso. Definir identidad,
  permisos, privacidad, conflictos y recuperación en un ADR.
- HTTP, TUI, RAG, PostgreSQL/pgvector, embeddings e ingesta documental están
  fuera de este repo según [ADR 0009](adr/0009-agent-memory-only-scope.md).
