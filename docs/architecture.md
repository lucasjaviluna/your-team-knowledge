# Arquitectura

> Documento vivo. El alcance vigente está registrado en [ADR 0009](adr/0009-agent-memory-only-scope.md).

## Propósito

El repositorio implementa **Agent Memory** para sesiones agenticas locales. El
producto conserva contexto durable, permite recuperarlo durante una sesión y lo
expone mediante MCP y contratos de consumidor. El runtime principal es el
binario nativo Go `native/ytk-memory`.

## Límites

```text
Consumer / agent
       |
       v
MCP stdio + setup de hosts
       |
       v
Agent Memory Core
       |
       v
SQLite + FTS5 local
```

El núcleo no depende de red, PostgreSQL, embeddings ni proveedores de modelos.
Cada proceso MCP queda fijado a un proyecto y no puede cambiar su scope por
parámetros. La configuración local del proyecto es necesaria antes de abrir la
base SQLite.

## Agent Memory

Agent Memory cubre sesiones y resúmenes, working memory, observaciones
curadas, decisiones, descubrimientos, preferencias, relaciones, deduplicación
por `subjectKey`, búsqueda léxica FTS5, lifecycle, revisión, retención,
backup, upgrade y rollback. SQLite es local-first y no requiere servicios
externos.

El contrato provider-neutral separa al consumidor del almacenamiento. Incluye
disponibilidad, listado acotado, búsqueda, lectura individual, guardado
idempotente, sesiones y revisión. El protocolo define bootstrap, búsqueda
previa a decisiones, persistencia durable y handoff de sesión.

## Runtime y distribución

El runtime Go es la única implementación de Agent Memory. El comando
`ytk-memory` ofrece MCP, comandos administrativos y setup/uninstall de Codex,
Claude Code, Pi y OpenCode.

`setup codex` registra un servidor MCP genérico en
`CODEX_HOME/config.toml`; la activación de cada proyecto vive en
`.ytk-memory.json`, `AGENTS.md` y la skill local. La desinstalación conserva el
registro global salvo confirmación explícita o `--remove-global-mcp`.

## Capas

- `native/ytk-memory/internal/core`: entidades, reglas y persistencia SQLite/FTS5.
- `native/ytk-memory/internal/surface`: transporte MCP por `stdio`.
- `native/ytk-memory/internal/setup`: configuración de consumidores MCP.
- `native/ytk-memory/cmd/ytk-memory`: CLI y distribución nativa.

No existe una API HTTP, una base corporativa ni un orquestador documental en el
alcance vigente. La decisión de retirar RAG y retomarlo en otro proyecto está
en [ADR 0009](adr/0009-agent-memory-only-scope.md).

## Principios

- La memoria curada tiene prioridad sobre registros crudos de herramientas.
- Las búsquedas respetan el proyecto y el lifecycle de cada memoria.
- Las operaciones destructivas requieren una opción explícita.
- SQLite usa WAL, timeout por conexión y transacciones de escritura inmediatas;
  las migraciones y el backfill FTS5 se confirman juntos. Ver
  [ADR 0011](adr/0011-sqlite-multiprocess-concurrency.md).
- Los contratos de dominio no conocen transporte ni detalles de SQLite.
- Toda decisión arquitectónica duradera se registra en `docs/adr/`.
