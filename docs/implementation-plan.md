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
- Release firmado Ed25519 operativo: `v0.1.12` fue empaquetado, verificado y
  publicado tras CI verde; se confirmaron los activos Windows x64, Linux x64 y
  macOS arm64. El job de release compila secuencialmente los tres targets y
  publica el borrador sólo después de verificar los activos y sus firmas.
- Documentación técnica integral en
  [technical-architecture.md](technical-architecture.md).

El piloto de uso se confirmó en Windows. La validación manual en Linux está
aplazada y los checks Linux de CI son el gate aceptado. La validación de
integraciones en cada host real debe hacerse cuando haya repositorios
consumidores disponibles; los tests actuales validan adaptadores y archivos.

## Plan de evolución

La concurrencia multiproceso ya está caracterizada y el usuario informa haber
ejecutado el piloto con resultado preliminar correcto; falta consolidar sus
evidencias en el runbook. PR 06, CLI de lectura, ya se completó. El próximo
incremento independiente es el doctor de solo lectura; las ampliaciones de
lifecycle que requieren hosts reales quedan sujetas a disponibilidad y a los
hallazgos del piloto.

### P0 — Estabilidad y validación

1. **PR 01: concurrencia y reintentos multiproceso — completado.** El runtime
   configura `busy_timeout` de 10 s, transacciones `IMMEDIATE`, activa WAL con
   reintentos acotados y aplica cambios de esquema/backfill FTS5 en una
   transacción. La prueba automatizada usa ocho procesos, 20 guardados nuevos y
   20 upserts concurrentes por proceso, recuperación tras interrupción y backup
   mientras hay una transacción WAL abierta; pasó cinco ejecuciones
   consecutivas en Windows con cero errores `SQLITE_BUSY`/`SQLITE_LOCKED`.
   Ver [ADR 0011](adr/0011-sqlite-multiprocess-concurrency.md).
2. **PR 02: piloto reproducible en consumidores reales.** El usuario informa
   que ya ejecutó el runbook y que el resultado parece correcto. Falta registrar
   los dos repositorios, los dos hosts, versión, corpus, consultas, resultados,
   métricas e incidencias para poder confirmar formalmente la matriz y los
   umbrales. Ver [runbook](agent-memory-pilot-runbook.md); no declarar el PR
   completo hasta consolidar esa evidencia.

El PR 01 y el PR 02 son incrementos revisables por separado. La prueba manual
Linux continúa aplazada; CI Linux sigue siendo el gate automatizado aceptado
para el tramo actual y no se presentará como una prueba de uso con un host real.

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
6. **PR 06: CLI de lectura — completado.** `search`, `list`, `get` y `stats`
   usan los servicios del core, limitan lecturas al proyecto, aplican filtros de
   lifecycle/área y admiten `--json`. No incorporan otro transporte.
7. **PR 07: diagnóstico de solo lectura — completado.** `doctor --read-only`
   abre SQLite con `mode=ro` y `query_only`, compara tablas/columnas/índices/FTS5
   con el schema esperado e informa los cambios e incompatibilidades sin
   ejecutar migraciones.
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
