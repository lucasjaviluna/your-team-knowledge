# Arquitectura

> Documento vivo. Debe actualizarse junto con cada decisión de arquitectura o cambio significativo de implementación.

La secuencia de construcción está definida en [implementation-plan.md](implementation-plan.md).

## Propósito

La plataforma ofrece contexto confiable a agentes y aplicaciones mediante dos subsistemas complementarios:

- **Agent Memory**: contexto operativo local del agente.
- **Corporate Knowledge RAG**: conocimiento documental corporativo con permisos y trazabilidad.

Un **Context Orchestrator** combina ambas fuentes según la tarea, el usuario, el rol y el workspace.

## Límites de responsabilidad

```text
Consumer / agent
       |
       v
Context Orchestrator
   |                 |
   v                 v
Agent Memory    Corporate Knowledge RAG
   |                 |
SQLite local    PostgreSQL + pgvector
```

### Agent Memory

Persistencia local-first con SQLite para:

- sesiones y resúmenes;
- working memory;
- observaciones curadas, decisiones y descubrimientos;
- `subjectKey`, deduplicación y relaciones;
- funcionamiento rápido y sin dependencia de red durante la sesión.

La primera versión no sincroniza automáticamente esta memoria. Más adelante, una memoria que deba compartirse podrá proyectarse a un almacenamiento corporativo bajo reglas explícitas.

La implementación inicial usa un repositorio SQLite local detrás del contrato `MemoryRepository`. Permite guardar, actualizar por `subjectKey`, buscar memorias activas mediante full-text search, cerrar sesiones con resumen y registrar relaciones entre memorias.

El RAG inicia con contratos de documentos/chunks, un ingestor Markdown y un esquema PostgreSQL que reserva vectores para embeddings futuros.

### Corporate Knowledge RAG

Persistencia centralizada con PostgreSQL, `pgvector` y búsqueda full-text para:

- documentos, versiones y chunks;
- embeddings y recuperación híbrida;
- ACL, clasificación, auditoría y retención;
- provenance: fuente, autor, versión, fechas, autoridad y clasificación.

Los permisos se validan antes de recuperar o entregar contenido al modelo.

### Context Orchestrator

Recibe un `ContextRequest` con actor, rol, workspace, intención y tarea. Decide qué fuentes consultar y devuelve un `ContextBundle` con contexto ordenado, fuentes y justificación de inclusión.

## Entidades fundacionales

- `Workspace`
- `Actor` y `AccessPolicy`
- `MemoryItem`
- `Document`
- `DocumentChunk`
- `KnowledgeRelation`
- `ContextRequest`
- `ContextBundle`
- `SourceCitation`

## Alcance del primer vertical slice

1. Guardar y buscar un `MemoryItem` local.
2. Ingerir un documento Markdown y generar chunks.
3. Ejecutar recuperación documental con filtros de acceso básicos.
4. Combinar memoria y documentos en un `ContextBundle`.
5. Devolver citas con provenance.

No forman parte de este primer slice: conectores externos, sincronización de memoria, MCP, relaciones complejas, ni un motor de reranking avanzado.

## Principios

- Las memorias curadas tienen prioridad sobre registros crudos de herramientas.
- El conocimiento corporativo requiere permisos, fuente y vigencia verificables.
- El núcleo no se acopla a un agente, una interfaz, una base de embeddings ni un proveedor externo.
- Las decisiones de arquitectura se registran aquí y se implementan mediante contratos explícitos.
