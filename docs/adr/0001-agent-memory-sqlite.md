# ADR 0001: SQLite para Agent Memory local

## Estado

Aceptada.

## Decisión

Agent Memory persiste localmente en SQLite.

## Consecuencias

- Las sesiones y memorias están disponibles sin red.
- La integración local se distribuye como paquete TypeScript.
- La sincronización compartida no forma parte de la primera versión.
