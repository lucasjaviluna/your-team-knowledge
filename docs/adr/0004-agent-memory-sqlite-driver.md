# ADR 0004: Driver SQLite estable para Agent Memory

## Estado

Aceptada.

## Decisión

Agent Memory utiliza `better-sqlite3` detrás de un repositorio de infraestructura.

## Contexto

La API SQLite incluida en la versión de Node usada por el proyecto permanece marcada como experimental. La persistencia local no debe depender de esa condición.

## Consecuencias

- La implementación usa un driver SQLite estable y síncrono.
- El resto de la aplicación depende de `MemoryRepository`, no del driver.
- Se podrá sustituir el driver sin modificar los casos de uso.
