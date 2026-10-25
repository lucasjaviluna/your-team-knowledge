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
MCP stdio + setup Codex
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
disponibilidad, búsqueda, lectura individual, guardado idempotente, sesiones y
revisión. El protocolo define bootstrap, búsqueda previa a decisiones,
persistencia durable y handoff de sesión.

## Runtime y distribución

El runtime Go es la implementación principal y el destino único para Agent
Memory. Mantiene compatibilidad de esquema y comportamiento con el runtime
TypeScript durante la transición. El paquete TypeScript se conserva
temporalmente como compatibilidad y se retirará al completarse la migración.
El comando `ytk-memory` ofrece MCP, comandos administrativos y setup/uninstall
de Codex.

`setup codex` registra un servidor MCP genérico en
`CODEX_HOME/config.toml`; la activación de cada proyecto vive en
`.ytk-memory.json`, `AGENTS.md` y la skill local. La desinstalación conserva el
registro global salvo confirmación explícita o `--remove-global-mcp`.

## Capas

- `src/domain`: entidades y reglas de Agent Memory.
- `src/application/memory`: servicios y contratos independientes del storage.
- `src/infrastructure/sqlite`: persistencia SQLite/FTS5 y mantenimiento.
- `src/adapters` y `src/mcp`: contratos para consumidores y transporte MCP.
- `native/ytk-memory`: runtime Go, CLI y distribución nativa.

Las capas TypeScript se mantienen durante la transición; el estado final de
Agent Memory elimina ese runtime y conserva Go como único runtime.

No existe una API HTTP, una base corporativa ni un orquestador documental en el
alcance vigente. La decisión de retirar RAG y retomarlo en otro proyecto está
en [ADR 0009](adr/0009-agent-memory-only-scope.md).

## Principios

- La memoria curada tiene prioridad sobre registros crudos de herramientas.
- Las búsquedas respetan el proyecto y el lifecycle de cada memoria.
- Las operaciones destructivas requieren una opción explícita.
- Los contratos de dominio no conocen transporte ni detalles de SQLite.
- Toda decisión arquitectónica duradera se registra en `docs/adr/`.
