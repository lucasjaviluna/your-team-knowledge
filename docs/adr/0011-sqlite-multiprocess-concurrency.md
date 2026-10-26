# ADR 0011: coordinación de escrituras SQLite entre procesos

- **Estado:** aceptado
- **Fecha:** 2026-10-26

## Contexto

Cada host MCP puede abrir el mismo archivo local del proyecto en un proceso
distinto. SQLite en modo WAL permite que lectores y un escritor trabajen a la
vez, pero mantiene un solo escritor activo. Las transacciones diferidas pueden
leer antes de adquirir el turno de escritura; dos procesos que hacen upsert por
`subjectKey` podrían competir después de esa lectura. Además, inicializar una
base nueva o migrar una legacy requiere coordinar cambios de esquema y FTS5.

## Decisión

- Activar `foreign_keys` por conexión y configurar un `busy_timeout` de 10 000
  ms en el DSN de `modernc.org/sqlite`.
- Usar transacciones `IMMEDIATE` para adquirir el turno de escritura al
  comenzar una transacción.
- Activar WAL antes de iniciar la migración y reintentar errores `SQLITE_BUSY`
  o `SQLITE_LOCKED` durante esa activación, con seis intentos y backoff
  exponencial acotado.
- Ejecutar la migración completa —tablas, índices, columnas y creación/backfill
  de FTS5— dentro de una sola transacción `IMMEDIATE`.
- No reintentar automáticamente el cuerpo de una operación después de que
  haya comenzado. El timeout permite esperar a un escritor; si se agota, se
  propaga el error. `subjectKey` mantiene idempotente el upsert correspondiente.

## Consecuencias

- Los procesos que abren la misma base serializan la migración y la creación
  inicial del índice FTS5.
- La contención normal espera hasta 10 segundos antes de fallar; el sistema
  continúa teniendo un solo escritor a la vez.
- WAL sigue permitiendo lectores concurrentes y snapshots coherentes para
  backup.
- Los fallos de escritura fuera del upsert por `subjectKey` requieren que el
  consumidor examine el error antes de decidir si vuelve a intentarlos.

## Evidencia

`internal/core/concurrency_test.go` inicia ocho procesos independientes, cada
uno con 20 escrituras nuevas y 20 upserts a una clave compartida. Comprueba una
sola memoria activa para esa clave, un lector concurrente, recuperación tras
salida durante una transacción abierta, integridad SQLite/FTS5 y backup durante
una escritura WAL sin confirmar. En el entorno local Windows, el escenario
multiproceso completó 320 escrituras en 2,0–3,8 s por ejecución y no devolvió
errores `SQLITE_BUSY`/`SQLITE_LOCKED` en cinco ejecuciones consecutivas. Esto es
una prueba de regresión local, no un benchmark de hardware ni una garantía de
rendimiento para discos de red.
