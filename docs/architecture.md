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

Las transiciones de lifecycle se validan en la capa de aplicación: `active` puede pasar a revisión, reemplazada o archivada; `needs_review` puede volver a activa, reemplazada o archivada; `superseded` sólo puede permanecer así o archivarse; `archived` es terminal.

`MemoryService.transitionStatus()` devuelve la transición estructurada —estado anterior, nuevo estado, motivo, timestamp e indicador de cambio— y puede notificar un observer con eventos `status_changed`. `setStatus()` se conserva como atajo compatible cuando sólo se necesita la memoria actualizada.

El mismo observer recibe eventos `expired_archived` cuando `archiveExpired()` archiva memorias vencidas y `purged` cuando una purga elimina memorias archivadas. La simulación (`dry-run`) no emite eventos destructivos.

`MemoryService.runRetention()` coordina ambos pasos: en modo simulación devuelve candidatos de expiración y el conjunto de memorias que quedarían purgadas después del archivado proyectado, sin modificar SQLite; con `dryRun: false` archiva vencidas, purga según `purgeBefore` y conserva la observabilidad de cada operación. La retención exige `workspaceId` para aislar una base compartida; el alcance global sólo se habilita con `allWorkspaces: true` de forma explícita.

El resultado de `runRetention()` también incluye `metrics` con cantidades resumidas de candidatos vencidos, archivados, candidatos de purga y elementos purgados. Los IDs detallados se mantienen para auditoría y los contadores permiten a automatizadores consumir el resultado sin recalcularlo.

La cola de revisión se puede consultar sin modificar SQLite mediante `MemoryService.listDueForReview(workspaceId)`; el demo la expone con `--list-due-for-review true`. Una revisión se completa con `completeReview({ memoryId, nextReviewAt, reason })`: exige una fecha futura, vuelve la memoria `active`, reprograma `reviewAt` y emite un evento `review_completed` después de persistir.

Persistencia local-first con SQLite para:

- sesiones y resúmenes;
- working memory;
- observaciones curadas, decisiones y descubrimientos;
- `subjectKey`, deduplicación y relaciones;
- funcionamiento rápido y sin dependencia de red durante la sesión.

La primera versión no sincroniza automáticamente esta memoria. Más adelante, una memoria que deba compartirse podrá proyectarse a un almacenamiento corporativo bajo reglas explícitas.

#### Evolución a runtime nativo

El runtime TypeScript actual es la implementación de referencia durante la transición. Agent Memory evolucionará a un binario local en Go para que los repositorios consumidores no necesiten Node.js ni npm. El alcance de esa migración termina en Agent Memory: SQLite/FTS5, lifecycle, MCP, setup y mantenimiento. Corporate Knowledge RAG, su API HTTP y sus adaptadores siguen en TypeScript.

SQLite existente, el protocolo MCP, los archivos de configuración del proyecto y las reglas de dominio son contratos compatibles entre ambos runtimes. La decisión y el plan de transición se registran en [ADR 0007](adr/0007-agent-memory-native-go-runtime.md) y en el [plan de migración](agent-memory-go-migration-plan.md).

La implementación inicial usa un repositorio SQLite local detrás del contrato `MemoryRepository`. Permite guardar, actualizar por `subjectKey`, buscar memorias vigentes mediante full-text search, cerrar sesiones con resumen y registrar relaciones entre memorias. La búsqueda incorpora una expansión léxica conservadora y configurable mediante grupos de sinónimos, manteniendo `AND` entre conceptos para controlar falsos positivos. `MemoryService.compact()` crea resúmenes deterministas con un presupuesto `maxChars`, incluye los IDs de las fuentes, registra relaciones y reutiliza el mismo resumen cuando se repite la misma selección de fuentes. Sólo archiva las fuentes cuando el consumidor lo solicita explícitamente. El demo permite compactar, inspeccionar el lifecycle por proyecto y planificar una purga de archivadas en modo simulación; la eliminación exige una opción explícita. Cada memoria puede declarar `validFrom`, `expiresAt` y `reviewAt`; las búsquedas excluyen estados no recuperables, memorias futuras, vencidas y pendientes de revisión salvo que se solicite explícitamente incluir estas últimas. El servicio también permite transicionar estados, archivar vencidas, listar memorias que requieren revisión y purgar archivadas mediante una operación transaccional. `SqliteAgentMemoryRepository.backup()` genera una copia consistente mediante el backup nativo de SQLite, rechaza destinos vacíos, iguales al origen o ya existentes salvo que se indique `overwrite: true`, y permite restaurar la copia abriéndola como otra base. Las bases SQLite anteriores al lifecycle reciben las columnas faltantes al abrirse y conservan sus memorias existentes.

El RAG usa contratos de documentos/chunks, un ingestor Markdown y persistencia PostgreSQL transaccional. La consulta mantiene los filtros de acceso dentro de SQL y soporta dos modos: full-text cuando solo se recibe texto, y vectorial/híbrido cuando también se recibe un embedding. La puntuación híbrida combina relevancia lexical y similitud coseno; la rama vectorial exige una similitud mínima de 0.5 para evitar resultados desconectados de la consulta. El contrato `EmbeddingProvider` desacopla la generación de vectores del repositorio; la primera implementación local usa Transformers.js/ONNX con el modelo provisional `Xenova/multilingual-e5-small`.

La capa de aplicación expone `KnowledgeIngestionService` para coordinar ingesta, generación de embeddings y persistencia, y `KnowledgeQueryService` para generar el embedding de consulta, recuperar resultados y proyectarlos a citas trazables. La ingesta rechaza patrones de credenciales antes de generar embeddings o persistir contenido; la política puede desactivarse sólo mediante una opción explícita del servicio. `MemoryService` aplica la misma barrera antes de escribir Agent Memory en SQLite. Los consumidores no necesitan conocer PostgreSQL ni el formato interno de pgvector.

El contrato provider-neutral `AgentMemoryProvider` separa al consumidor del almacenamiento y del transporte. Incluye disponibilidad, búsqueda, lectura individual, guardado idempotente, sesiones y revisión. `SqliteAgentMemoryProvider` lo implementa sobre `MemoryService`; el `projectId` externo se trata como `workspaceId` local y cada lectura valida ese alcance. `AgentMemoryProtocol` agrega el ciclo de bootstrap, persistencia durable y resumen de sesión sin depender de un runtime concreto.

El servidor MCP es un adaptador sobre ese contrato. Cada proceso queda fijado a un único `projectId` al iniciar y sus herramientas no aceptan otro proyecto, de modo que un cliente no puede cambiar el scope por parámetros. Los adaptadores con nombres de consumidores concretos se conservan únicamente por compatibilidad y quedan fuera del contrato neutral.

El inicializador separa la resolución común de proyecto, base y ejecutable de adaptadores de instalación por cliente. El primer adaptador configura Codex mediante bloques propios en `.codex/config.toml` y `AGENTS.md`; los demás clientes pueden añadirse sin cambiar el contrato MCP ni el almacenamiento. Los cambios se planifican antes de escribir y se revierten si una escritura falla.

Cada cliente nuevo implementa `AgentInstallerAdapter` en `src/installer/` y se registra por nombre en el CLI. Su adaptador define únicamente los archivos y bloques específicos del host; la resolución del proyecto y la aplicación de cambios siguen en el núcleo común.

El alcance de las instrucciones es parte del contexto común del instalador:
`local`, `global` o `both`. La configuración MCP y sus rutas quedan en el
checkout; las instrucciones globales no incluyen proyecto ni rutas locales y
deben ser condicionales a la disponibilidad de las herramientas del host.

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
