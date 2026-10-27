# Estado y hoja de ruta de Agent Memory

**Fecha de revisión:** 2026-10-26

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
| Release firmado | Operativo: `v0.1.12` publicado tras CI verde; activos confirmados en Windows, Linux y macOS. | Rotar la clave sólo según [release-policy.md](release-policy.md) y conservar la custodia fuera del repositorio. |
| Índice FTS legado | Resuelto: la apertura crea y rellena FTS5 de forma transaccional si la tabla falta. | Mantener la prueba de migración y búsqueda al cambiar el esquema. |
| Evaluación real | El usuario informa que ejecutó el runbook con resultado preliminar correcto; aún no se registraron las evidencias ni métricas. | Completar la matriz repo-host y registrar relevancia, ruido, latencia, aislamiento y persistencia para cerrar el piloto. |
| Concurrencia | WAL, timeout, transacciones `IMMEDIATE` y migración transaccional implementados. Prueba de ocho procesos y lector simultáneo pasó cinco veces en Windows sin `SQLITE_BUSY`/`SQLITE_LOCKED`. | Mantener la regresión y comprobarla en CI de las plataformas soportadas. |
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

### P2 — Madurez operativa pendiente

1. **Completado:** caracterizar concurrencia multiproceso, recuperación WAL,
   backup e integridad SQLite/FTS5 con una carga reproducible; ver
   [ADR 0011](adr/0011-sqlite-multiprocess-concurrency.md).
2. **En cierre:** consolidar la evidencia del piloto de dos repositorios y dos
   hosts, que el usuario informa haber ejecutado con resultado preliminar
   correcto.
3. **Diferido:** revisar omisiones del lifecycle de Claude Code cuando haya un
   host disponible; probar mecanismos del host sólo si se observaron omisiones.
4. **Siguiente incremento independiente:** doctor de solo lectura para que el
   diagnóstico no abra SQLite mediante `core.Open`. Luego validar en uso real
   Codex, Claude Code, Pi y OpenCode; quedan además la preservación de JSONC y
   la instalación/upgrade reproducibles.

La secuencia, los criterios de aceptación y las propuestas condicionadas se
detallan en el [plan de implementación](implementation-plan.md). Ninguna de
estas tareas pendientes se presenta como capacidad ya validada.

El release firmado quedó operativo con `v0.1.12`. La política de custodia y
rotación se describe en [release-policy.md](release-policy.md); la clave privada
no se almacena en Git, docs ni conversación.

### P3 — Decisiones opcionales

- Diseñar timeline, detección de conflictos y exportación portable sólo cuando
  existan casos de uso observados y un contrato de compatibilidad.
- Decidir si se necesita TUI, memoria compartida personal/global o
  sincronización. Antes de implementar memoria compartida, definir identidad,
  permisos, privacidad, conflictos y recuperación en un ADR.
- Reconsiderar HTTP sólo con consumidor concreto. RAG y conocimiento
  documental pertenecen a otro proyecto.

## Referencias de estado

- [Estado actual](current-status.md)
- [Plan de implementación](implementation-plan.md)
- [Arquitectura técnica](technical-architecture.md)
- [Plan de migración Go](agent-memory-go-migration-plan.md)
- Código de core/MCP/setup/release y [CI](../.github/workflows/ci.yml)
