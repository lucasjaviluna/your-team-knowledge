# ADR 0009: Agent Memory como único alcance del repositorio

- **Estado:** aceptada
- **Fecha:** 2026-10-22
- **Decisores:** equipo del producto

## Contexto

El repositorio nació como una plataforma que combinaba Agent Memory local,
Corporate Knowledge RAG y un orquestador de contexto. La implementación RAG
creció alrededor de PostgreSQL/pgvector, embeddings, ingesta documental, API
HTTP y adaptadores de conocimiento. Sin embargo, el objetivo inmediato del
producto es madurar las sesiones agenticas con el runtime nativo Go y validar
su uso en repositorios consumidores.

Mantener ambos productos en el mismo núcleo aumenta el costo de build, las
dependencias opcionales, la superficie de despliegue y la cantidad de contratos
que deben evolucionar juntos. También desvía la validación del ciclo que hoy
define el producto: sesiones, memoria durable, búsqueda local, lifecycle,
aislamiento por proyecto y MCP.

## Decisión

Este repositorio queda dedicado exclusivamente a **Agent Memory** para sesiones
agenticas, con foco en el binario nativo Go `ytk-memory` y sus integraciones de
consumidor. Se retiran del código, dependencias, CI y documentación operativa
del repositorio:

- PostgreSQL, pgvector y migraciones documentales.
- Embeddings, chunking e ingesta Markdown para conocimiento corporativo.
- Recuperación RAG, citas documentales y `ContextOrchestrator`.
- API HTTP, auditoría y adaptadores de conocimiento corporativo.
- Benchmarks, fixtures y pruebas específicas de RAG.

Agent Memory conserva SQLite/FTS5, sesiones, búsqueda local, relaciones,
lifecycle, retención, backup/upgrade/rollback, MCP, setup de Codex y contratos
de consumidor. El almacenamiento sigue siendo local y no se introduce una
dependencia de red para el ciclo principal.

## Repositorio futuro de RAG

La idea de Corporate Knowledge RAG no se descarta. Para retomarla se debe crear
un repositorio/proyecto separado y llevar este documento como contexto. Ese
proyecto podrá definir de forma independiente su modelo documental, proveedor
de embeddings, PostgreSQL/pgvector, ACL, provenance, API y evaluación. No debe
reintroducir esas responsabilidades como dependencias opcionales de Agent
Memory.

## Consecuencias

- El paquete Node queda reducido a contratos y compatibilidad de Agent Memory
  durante la transición; el camino principal de distribución es el binario Go.
- Los ADR y documentos históricos de RAG se conservan como registro de por qué
  se tomó la decisión, pero quedan fuera del alcance vigente.
- Los consumidores que necesiten conocimiento documental deberán depender del
  futuro proyecto RAG y combinarlo externamente con Agent Memory.
- La CI deja de requerir PostgreSQL, pgvector, Transformers.js o modelos de
  embeddings.

## Criterio de finalización

No debe existir código compilable, dependencia runtime, comando de CI ni guía de
uso vigente que presente RAG como parte de este producto. Las únicas menciones
permitidas son referencias históricas o este ADR para facilitar la recuperación
del trabajo en otro repositorio.
