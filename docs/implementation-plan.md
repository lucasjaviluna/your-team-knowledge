# Plan de implementación

**Revisado:** 2026-10-26

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

## Plan de evolución

El trabajo inmediato es demostrar consistencia con varios procesos antes de
atribuir a un host los fallos de recuperación. Después se mide el uso real con
el [runbook del piloto](agent-memory-pilot-runbook.md). Las ampliaciones de
superficie se deciden con esas evidencias; las tools MCP existentes ya cubren
el ciclo básico y no necesitan duplicarse.

### P0 — Estabilidad y validación

1. **PR 01: concurrencia y reintentos multiproceso.** Ejecutar dos o más
   procesos independientes sobre la misma SQLite. Cubrir lectores y escritores
   simultáneos, guardados repetidos con el mismo `subjectKey`, cierre de sesión,
   transacciones interrumpidas, backup con WAL activo y reapertura después de un
   fallo. Registrar `SQLITE_BUSY`, latencia, duplicados, consistencia entre
   `memory_items` y FTS5 y recuperación. Definir `busy_timeout`, límites de
   reintento e idempotencia sólo después de medirlos. Criterio: sin corrupción,
   pérdida de escrituras confirmadas, duplicados activos indebidos ni índices
   parciales bajo una carga reproducible; los conflictos esperables deben
   devolver errores accionables.
2. **PR 02: piloto reproducible en consumidores reales.** Usar dos repositorios
   y dos hosts; medir relevancia, ruido, latencia y aplicación correcta de
   memorias en tareas reales. Comprobar reinicio, aislamiento, actualización,
   backup, upgrade y rollback. En hosts que tengan compactación de contexto,
   medir también si se recupera el conocimiento necesario al reanudar. Registrar
   versión, corpus, consultas, resultados e incidencias sin secretos. Criterio:
   superar la matriz y los umbrales fijados antes de ejecutar el
   [runbook](agent-memory-pilot-runbook.md).

Ambos PR deben ser revisables por separado. La prueba manual Linux continúa
aplazada; CI Linux sigue siendo el gate automatizado aceptado para el tramo
actual y no se presentará como una prueba de uso con un host real.

### P1 — Uso agéntico y operación

3. **PR 03: lifecycle de Claude Code.** Medir si el host omite inicio,
   recuperación o handoff durante tareas reales. Si ocurre, probar hooks
   específicos que llamen al MCP existente y comparar su efecto con la línea
   base. Mantener las reglas de memoria en el core.
4. **PR 04: lifecycle opcional de Pi.** Aplicar el mismo criterio de medición;
   añadir una integración específica sólo si mejora la persistencia o la
   recuperación sin generar duplicados.
5. **PR 05: pruebas de los cuatro hosts.** Ejecutar setup, doctor, sesión,
   búsqueda, guardado, reinicio y uninstall en Codex, Claude Code, Pi y
   OpenCode reales, preservando configuración ajena.
6. **PR 06: CLI de lectura.** Exponer `search`, `list`, `get` y `stats` mediante
   los servicios del core, con el mismo aislamiento y filtros lifecycle que
   MCP. Esto permite inspección local sin incorporar otro transporte.
7. **PR 07: diagnóstico de solo lectura.** Añadir un modo `doctor --read-only`
   que inspeccione configuración, integridad y compatibilidad sin llamar a una
   apertura que migre la base. Informar qué cambiaría un upgrade.
8. **PR 08: conservación de JSONC en OpenCode.** Evitar que setup/uninstall
   descarten comentarios o formato ajenos; probar archivos reales con JSONC y
   configuración de otros servidores.
9. **PR 09: instalación y actualización reproducibles.** Evaluar un canal
   verificable por plataforma que instale el release firmado, conserve la clave
   pública confiable y permita volver a una versión anterior. Probar upgrades
   entre releases con bases representativas antes de recomendarlo.

Los PR 03 y 04 dependen de los hallazgos del piloto. El orden de los PR 06–09
puede ajustarse por incidencias reales, conservando sus criterios de seguridad
y compatibilidad.

### P2 — Capacidades condicionadas a casos de uso

10. **Timeline y conflictos.** Diseñar navegación temporal, detección de
    decisiones contradictorias o sugerencias de `subjectKey` sólo para casos
    observados en el piloto. Antes de añadir tools MCP, comprobar si bastan
    consultas del core y una interfaz de lectura.
11. **Exportación portable versionada.** Definir formato, identidad de memorias,
    validación de importación y compatibilidad antes de mover datos entre
    máquinas. No implica sincronización automática.

### P3 — Opciones exploratorias

12. **Interfaz visual local.** Considerar una TUI sobre el core y la CLI de
    lectura si la inspección manual demuestra demanda sostenida.
13. **Memoria compartida o sincronización.** Evaluar identidad, permisos,
    privacidad, conflictos y recuperación en un ADR antes de implementar.

HTTP, RAG, PostgreSQL/pgvector, embeddings e ingesta documental siguen fuera
de este repositorio según [ADR 0009](adr/0009-agent-memory-only-scope.md). Una
API adicional requiere primero un consumidor concreto y un análisis de su
superficie de seguridad.

## Gates para declarar mayor madurez operativa

- Integridad SQLite/FTS5, aislamiento por proyecto e idempotencia bajo la carga
  multiproceso definida en PR 01.
- Recuperación útil entre sesiones y, donde aplique, después de compactación,
  respaldada por consultas y tareas reales del PR 02.
- Cuatro hosts comprobados en uso real antes de anunciar ese alcance; builds y
  firmas válidos en todas las plataformas que anuncie el release.
- Upgrade/rollback sin pérdida de datos, diagnóstico accionable y métricas de
  recuperación reproducibles sin regresiones significativas.

El corpus sintético permanece como prueba de regresión. Su resultado no se
presentará como medición de calidad en tareas reales.
