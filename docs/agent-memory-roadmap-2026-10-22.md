# Estado y hoja de ruta de Agent Memory

**Fecha de revisión:** 2026-10-25

## Alcance

El repositorio mantiene Agent Memory local para sesiones de agentes. RAG,
PostgreSQL/pgvector, embeddings, API documental, HTTP y Context Orchestrator
están fuera del alcance vigente; ver [ADR 0009](adr/0009-agent-memory-only-scope.md).

Este estado separa lo que está implementado, lo cubierto por automatización y
lo validado en uso real. La suite y el corpus sintético no sustituyen evaluación
de calidad en tareas/hosts reales.

## Implementado y comprobado en código

- Runtime Go único con SQLite/FTS5, sesiones, memorias, upsert por
  `subjectKey`, búsqueda lexical, relaciones y lifecycle.
- Once herramientas MCP por `stdio`: sesión/briefing, search/get/save, cierre,
  revisión, corrección versionada, relaciones y consolidación con preview y
  confirmación explícita.
- Filtro de patrones sensibles antes de persistir memorias y handoffs; ownership
  de sesión y aislamiento por proyecto.
- CLI para setup/uninstall, doctor, backup, upgrade, rollback, conformance,
  evaluation y release.
- Configuración de Codex, Claude Code, Pi y OpenCode con alcance y archivos
  documentados en [arquitectura técnica](technical-architecture.md).
- Doctor valida TOML completo de Codex, tipo/acceso de ruta SQLite,
  `quick_check` y ejecutable registrado; existen pruebas de backup WAL y
  rollback desde base heredada.
- Evaluación sintética de recall, precision, latencia local y tamaño de
  briefing; runner de conformance con fixture y reloj deterministas.
- CI para Windows x64, Linux x64 y macOS arm64; empaquetado Ed25519, SHA-256,
  manifiesto, verificación y smoke test del binario antes de publicación en tags.
- Documentación técnica integral en
  [technical-architecture.md](technical-architecture.md).

La CI ejecuta `gofmt`, `go vet ./...`, `go test ./...` y build. El piloto de
uso se confirmó en Windows. La prueba manual Linux queda aplazada y la CI Linux
es el gate aceptado por ahora. La automatización de cada host está probada en
configuración; pruebas en repositorios consumidores dependen de disponibilidad
de esos hosts.

## Brechas actuales

| Área | Estado | Siguiente trabajo |
| --- | --- | --- |
| Release firmado | Código/workflow implementados, primer release aún no activado. | Configurar fuera del repo secreto Ed25519 y variable pública de Actions, verificar huella y crear tag semántico aprobado. |
| Índice FTS legado | Migración crea FTS5 pero no hace backfill de filas previas si la tabla FTS faltaba. | Añadir reconstrucción transaccional y prueba de upgrade/búsqueda sobre fixture legado. |
| Evaluación real | Hay baseline sintética reproducible, no medición de utilidad o calidad con tareas reales. | Evaluar búsqueda/briefing en repos consumidores, registrar relevancia, ruido y latencia. |
| Concurrencia | Transacciones e idempotencia cubiertas en operaciones; no hay caracterización completa de varios procesos y reintentos. | Probar escritores concurrentes, reintentos y recuperación WAL. |
| Plataformas | Windows x64, Linux x64 y macOS arm64 en CI/release. | Añadir arm64 u otros gestores sólo con demanda y soporte. |

## Plan priorizado

### P0 — Ciclo de sesión y seguridad

Completado según el piloto confirmado en Windows. Linux manual aplazado; checks
Linux de CI aceptados para este tramo.

### P1 — Capacidades de memoria

Completado en código y pruebas: briefing inicial compacto, lifecycle, revisión,
corrección con historial, relaciones, consolidación con preview, corpus
sintético y métricas de retrieval. No queda pendiente exponer esas funciones al
agente: las tools correspondientes ya existen.

### P2 — Distribución y soporte

1. Activar primer release firmado una vez que la custodia real esté configurada.
2. Reparar backfill/rebuild FTS para bases legadas sin índice poblado.
3. Evaluar hosts y tareas reales cuando los repositorios consumidores estén
   disponibles.
4. Caracterizar concurrencia/reintentos y ajustar prácticas operativas.

El primer punto está bloqueado por configuración externa de firma. La política
se describe en [release-policy.md](release-policy.md); la clave privada no se
almacena en Git, docs ni conversación.

### P3 — Decisiones opcionales

- Decidir si se necesita memoria compartida personal/global, exportación o
  sincronización. Antes de implementar, definir identidad, permisos, privacidad,
  conflictos y recuperación en un ADR.
- Reconsiderar HTTP/TUI sólo con consumidor concreto. RAG y conocimiento
  documental pertenecen a otro proyecto.

## Referencias de estado

- [Estado actual](current-status.md)
- [Plan de implementación](implementation-plan.md)
- [Arquitectura técnica](technical-architecture.md)
- [Plan de migración Go](agent-memory-go-migration-plan.md)
- Código de core/MCP/setup/release y [CI](../.github/workflows/ci.yml)
