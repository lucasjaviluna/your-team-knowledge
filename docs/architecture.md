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

Las relaciones entre memorias requieren extremos existentes, del mismo workspace y no archivados. Sus tipos válidos son `related`, `supports`, `conflicts_with` y `supersedes`; repetir el mismo vínculo es idempotente. La purga de memorias archivadas elimina también sus relaciones para evitar vínculos huérfanos.

Persistencia local-first con SQLite para:

- sesiones y resúmenes;
- working memory;
- observaciones curadas, decisiones y descubrimientos;
- `subjectKey`, deduplicación y relaciones;
- funcionamiento rápido y sin dependencia de red durante la sesión.

La primera versión no sincroniza automáticamente esta memoria. Más adelante, una memoria que deba compartirse podrá proyectarse a un almacenamiento corporativo bajo reglas explícitas.

La implementación inicial usa un repositorio SQLite local detrás del contrato `MemoryRepository`. Permite guardar, actualizar por `subjectKey`, buscar memorias vigentes mediante full-text search, cerrar sesiones con resumen y registrar relaciones entre memorias. La búsqueda incorpora una expansión léxica conservadora y configurable mediante grupos de sinónimos, manteniendo `AND` entre conceptos para controlar falsos positivos. `MemoryService.compact()` crea resúmenes deterministas con un presupuesto `maxChars`, incluye los IDs de las fuentes, registra relaciones y reutiliza el mismo resumen cuando se repite la misma selección de fuentes. Sólo archiva las fuentes cuando el consumidor lo solicita explícitamente. El demo permite compactar, inspeccionar el lifecycle por proyecto y planificar una purga de archivadas en modo simulación; la eliminación exige una opción explícita. Cada memoria puede declarar `validFrom`, `expiresAt` y `reviewAt`; las búsquedas excluyen estados no recuperables, memorias futuras, vencidas y pendientes de revisión salvo que se solicite explícitamente incluir estas últimas. El servicio también permite transicionar estados, archivar vencidas, listar memorias que requieren revisión y purgar archivadas mediante una operación transaccional. Las bases SQLite anteriores al lifecycle reciben las columnas faltantes al abrirse y conservan sus memorias existentes.

El RAG usa contratos de documentos/chunks, un ingestor Markdown y persistencia PostgreSQL transaccional. La consulta mantiene los filtros de acceso dentro de SQL y soporta dos modos: full-text cuando solo se recibe texto, y vectorial/híbrido cuando también se recibe un embedding. La puntuación híbrida combina relevancia lexical y similitud coseno; la rama vectorial exige una similitud mínima de 0.5 para evitar resultados desconectados de la consulta. El contrato `EmbeddingProvider` desacopla la generación de vectores del repositorio; la primera implementación local usa Transformers.js/ONNX con el modelo provisional `Xenova/multilingual-e5-small`.

La capa de aplicación expone `KnowledgeIngestionService` para coordinar ingesta, generación de embeddings y persistencia, y `KnowledgeQueryService` para generar el embedding de consulta, recuperar resultados y proyectarlos a citas trazables. La ingesta rechaza patrones de credenciales antes de generar embeddings o persistir contenido; la política puede desactivarse sólo mediante una opción explícita del servicio. `MemoryService` aplica la misma barrera antes de escribir Agent Memory en SQLite. Los consumidores no necesitan conocer PostgreSQL ni el formato interno de pgvector.

Para consumidores con memoria provider-neutral, `PiHarnessMemoryProvider` adapta `MemoryService`/SQLite a las operaciones `isAvailable`, `search` y `store`. El `projectId` externo se trata como `workspaceId` local y el límite de caracteres se aplica antes de entregar contexto al agente.

El paquete expone `KnowledgeHttpClient` y `PiHarnessKnowledgeAdapter` para consumidores externos. El adaptador traduce operaciones de búsqueda/ingesta y definiciones de herramientas, conservando las citas y dejando la integración con el registro nativo del consumidor como una capa final.

La extensión nativa que llama a `pi.registerTool` vive en pi-harness, no en esta plataforma: pertenece al borde de ejecución del agente y depende de la API y políticas de aprobación de Pi. Esta plataforma solo publica el SDK/adaptadores que esa extensión consume.

### Corporate Knowledge RAG

Persistencia centralizada con PostgreSQL, `pgvector` y búsqueda full-text para:

- documentos, versiones y chunks;
- embeddings y recuperación híbrida;
- ACL, clasificación, auditoría y retención;
- provenance: fuente, autor, versión, fechas, autoridad y clasificación.

Los permisos se validan dentro de la consulta, antes de recuperar o entregar contenido al modelo. La implementación provisional usa embeddings de 384 dimensiones con `Xenova/multilingual-e5-small`. PostgreSQL fija `vector(384)` y utiliza un índice HNSW con distancia coseno; cualquier cambio de proveedor o dimensión debe pasar por un benchmark y una migración explícita.

### Context Orchestrator

Recibe un `ContextRequest` con actor, workspace, consulta, límites y selección opcional de fuentes. `ContextOrchestrator` clasifica inicialmente la intención como `continuity`, `documentary` o `mixed`; con esa clasificación evita consultar una fuente innecesaria y deja los flags explícitos como override. Cuando corresponde, consulta Agent Memory y RAG en paralelo, fusiona resultados mediante pesos configurables por fuente, conserva las `SourceCitation` del conocimiento documental y aplica un presupuesto de caracteres o tokens antes de entregar el texto al consumidor. Cada memoria incluye una razón inicial (`query-match`) para hacer explícita su inclusión.

El arnés de evaluación `evaluateContextProvider` permite ejecutar el mismo dataset contra cualquier implementación de `ContextProvider`. Los casos declaran intención esperada, IDs que deben recuperarse y contenido prohibido; las métricas son exactitud de intención, precision/recall de memoria y citas, y conteo de fugas por permisos. La precisión penaliza resultados extra no esperados, mientras que la fuga de permisos se reporta por separado. El arnés acepta umbrales opcionales y expone `thresholdFailures` para hacer fallar CI con un diagnóstico concreto. El dataset determinista vive en `test/fixtures/context-evaluation-dataset.ts`; se ejecuta como suite normal y mediante el paso dedicado `npm run test:context-evaluation` del workflow.

La evaluación integrada `context-evaluation.real-provider.test.ts` comprueba el mismo contrato sobre la composición real de aplicación: SQLite persistente para Agent Memory, `MemoryService`, `KnowledgeQueryService`, `ContextOrchestrator` y un repositorio documental reproducible con políticas de acceso. La prueba no sustituye la integración opt-in contra PostgreSQL; cubre el comportamiento del orquestador sin hacer depender el CI básico de servicios externos.

La evaluación `context-evaluation.postgres.integration.test.ts` repite el contrato contra `PostgresKnowledgeRepository` y pgvector cuando `DATABASE_URL` está disponible. Es opt-in para conservar un CI básico rápido y reproducible, pero valida la ruta de ingesta, embeddings, recuperación híbrida y ACL en el almacenamiento corporativo real.

### Transporte HTTP

La API HTTP inicial se implementa con `node:http` y funciona como adaptador delgado sobre los servicios de aplicación. Expone health check, consulta documental e ingesta Markdown; no contiene reglas de ranking ni generación de embeddings. El borde resuelve el principal autenticado, aplica autorización por workspace y registra eventos mediante `AuditSink`; la integración futura con identidad corporativa reemplazará el autenticador estático.

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
