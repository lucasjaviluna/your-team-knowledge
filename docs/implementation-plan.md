# Plan de implementación

> Documento vivo. Las etapas y tareas se actualizan al aprobar cambios de alcance o completar hitos.

## Secuencia

```text
Fundación → Agent Memory → Knowledge RAG → Context Orchestrator
     → Governance y evaluación → Adaptadores → Conectores y evolución
```

## Estado global — 2026-10-20

El estado revisado y la cola de continuación están en [current-status.md](current-status.md). Ese documento es la referencia para el siguiente trabajo; este plan conserva el alcance y la secuencia por etapas.

**Objetivo próximo:** migrar Agent Memory a un runtime Go distribuible como binario, preservando los contratos actuales. El alcance, fases y criterios de salida se detallan en [agent-memory-go-migration-plan.md](agent-memory-go-migration-plan.md).

- **Etapas 0–1:** completadas; arquitectura, base TypeScript, CI, migraciones y contratos de distribución están establecidos.
- **Etapa 2 — Agent Memory SQLite:** el runtime TypeScript está completado como producto local instalable y pasa a ser la referencia de compatibilidad para su migración a Go. El objetivo de la migración es una distribución nativa sin Node/npm; no cambia los contratos ni el modelo local-first.
- **Etapa 3 — RAG/Postgres:** vertical avanzado; ingesta Markdown, embeddings E5 provisional, `vector(384)`, HNSW, recuperación híbrida, ACL, provenance y servicios de consulta están implementados. HTTP expone consulta/ingesta documental y contexto. No hay servidor MCP para RAG; decidir si hace falta es una decisión de producto pendiente. El modelo y la dimensión siguen provisionales hasta validarlos con corpus y consultas representativos.
- **Etapa 4 — Context Orchestrator:** primer vertical slice completado; combina memoria SQLite y RAG con límites, selección de fuentes y provenance.
- **Etapas 5–6:** evaluación determinista, controles ACL en retrieval, auditoría, HTTP, cliente TypeScript, adaptadores, instalador Codex y empaquetado/release interno están implementados. Pendientes: identidad corporativa real, validación con datos/servicios representativos y extensiones nativas de runtimes consumidores donde aporten valor.
- **Etapa 7:** pendiente; conectores, sincronización incremental y evolución operativa.

Agent Memory queda cerrado como producto local: el E2E reproducible usa dos clientes MCP independientes y valida bootstrap, recall, escritura idempotente, ownership de sesión, cierre, compactación y reanudación. Los adaptadores nativos de hosts concretos son integraciones externas que consumen el mismo MCP y no bloquean el núcleo.

## Etapa 0 — Arquitectura v0 y reglas del proyecto

**Objetivo:** convertir las decisiones actuales en contratos verificables.

- Completar los límites de cada módulo en `docs/architecture.md`.
- Definir el glosario de `Workspace`, `Actor`, `MemoryItem`, `Document`, `DocumentChunk`, `ContextBundle` y `subjectKey`.
- Crear ADRs para decisiones de almacenamiento, permisos y distribución.
- Definir escenarios de aceptación para el primer vertical slice.
- Mantener la política de documentación viva.

**Resultado:** arquitectura, nombres y fronteras estables.

## Etapa 1 — Base técnica

**Objetivo:** preparar el repositorio para construir y probar módulos aislados.

**Estado:** base inicial completada. Las migraciones ejecutables y sus contratos de orden/nombre se validan con `npm run migrations:check`; CI cubre esta comprobación junto con calidad, pruebas y empaquetado.

- Inicializar el workspace TypeScript, package manager, linting, formato y pruebas.
- Crear módulos `domain`, `application`, `infrastructure`, `api` y `adapters`.
- Configurar variables de entorno y perfiles local/test.
- Añadir PostgreSQL con pgvector para desarrollo local.
- Implementar migraciones separadas para SQLite y PostgreSQL.
- Configurar CI mínima: instalación, lint, tipos y pruebas.

**Resultado:** desarrollo y pruebas reproducibles.

## Etapa 2 — Agent Memory local

**Objetivo:** implementar la memoria operativa del agente sobre SQLite.

**Estado:** producto local completado. El servidor MCP resuelve proyecto de forma segura y fija owner de sesión por proceso; el inicializador deja configuración portable e instrucciones neutrales. El CLI administrativo cubre diagnóstico, backup, upgrade y rollback confirmado. CI valida el tarball privado en Windows y Linux.

- Diseñar el esquema de sesiones, memorias, relaciones y resúmenes.
- Implementar `MemoryItem` con tipo, contenido, `subjectKey`, tags, estado y fechas.
- Implementar guardado, búsqueda, recuperación, actualización por `subjectKey` y deduplicación.
- Crear resúmenes de sesión y lifecycle: activa, reemplazada, pendiente de revisión y archivada. **Implementado con fechas de vigencia/revisión, transiciones explícitas, archivado de vencidas y purga controlada.**
- Exponer la interfaz `MemoryProvider`.
- Generalizar la fachada sin nombres de productos externos. **Implementado con `AgentMemoryProvider`, `SqliteAgentMemoryProvider` y `AgentMemoryProtocol`; los adaptadores anteriores quedan como compatibilidad.**
- Exponer Agent Memory mediante MCP nativo. **Implementado por `stdio` con cinco herramientas, validación de entrada, resultados estructurados, scope inmutable por proyecto y smoke E2E con el cliente oficial.**
- Crear pruebas de persistencia, deduplicación y actualización.
- Mejorar recall léxico sin perder precisión. **Implementado con variaciones simples singular/plural y expansión configurable de grupos de sinónimos conservadores, manteniendo semántica `AND`; quedan pendientes stemming semántico y retrieval vectorial.**
- Hacer operativa la compactación desde SQLite. **Implementado con `npm run demo:agent-memory -- --compact-ids ...`, presupuesto configurable, archivado opt-in y regresión de migración desde tablas legacy.**
- Endurecer idempotencia e inspección del lifecycle. **Implementado con clave estable para reutilizar resúmenes y `--inspect-lifecycle true` para consultar conteos por estado y vigencia.**
- Hacer segura la retención de archivadas. **Implementado con plan de purga, lista de candidatos y `dry-run` predeterminado; la eliminación requiere `--purge-dry-run false`.**
- Reforzar la consistencia referencial de relaciones. **Implementado: ambas memorias deben existir, pertenecer al mismo workspace y no estar archivadas; la purga elimina los vínculos de las memorias eliminadas.**
- Validar semántica runtime de relaciones. **Implementado: se rechazan tipos desconocidos y la creación repetida del mismo vínculo es idempotente.**
- Formalizar transiciones de lifecycle. **Implementado: se validan estados runtime, se restringen transiciones inválidas y `archived` queda como estado terminal.**
- Hacer observable el lifecycle para consumidores. **Implementado con `transitionStatus()`, motivos explícitos y observer tipado para eventos `status_changed`; `setStatus()` mantiene compatibilidad.**
- Observar archivado automático y purga. **Implementado con eventos `expired_archived` y `purged`; los dry-runs no generan eventos destructivos.**
- Coordinar la retención desde Agent Memory. **Implementado con `runRetention()`, preview conjunto de candidatos y ejecución explícita mediante `dryRun: false`.**
- Añadir recuperación operativa de Agent Memory. **Implementado con backup nativo SQLite, validación de destino y prueba de restauración desde la copia.**
- Aislar la retención por workspace. **Implementado: `runRetention()` exige `workspaceId` o `allWorkspaces: true` y aplica el filtro en archivado, candidatos y purga.**
- Preparar mantenimiento automatizable. **Implementado en el demo: backup previo opcional y retención coordinada con preview por defecto y scope explícito.**
- Hacer predictivo el preview de retención. **Implementado: el plan incluye también vencidas que quedarían purgables después del archivado proyectado.**
- Verificar mantenimiento desde el consumidor real. **Implementado con `npm run test:maintenance-smoke`: ejerce backup, preview, ejecución y comprobación de restauración/purga mediante el comando CLI.**
- Evitar sobrescritura accidental de backups. **Implementado: los destinos existentes se rechazan por defecto y requieren overwrite explícito.**
- Exponer métricas resumidas de mantenimiento. **Implementado: `runRetention()` devuelve contadores de candidatos, archivado y purga junto con los IDs detallados.**
- Exponer la cola de revisión al consumidor. **Implementado: el demo permite consultar memorias con `reviewAt` vencido mediante `--list-due-for-review true` sin modificar SQLite.**
- Completar y reprogramar revisiones. **Implementado: `completeReview()` exige una próxima fecha futura, reactiva la memoria y emite `review_completed`; el demo lo expone con `--complete-review` y `--next-review-at`.**
- Integrar revisiones con el consumidor real. **Implementado: `PiHarnessMemoryProvider.completeReview()` aplica el proyecto actual, completa sólo revisiones vencidas y devuelve un resultado consumible.**
- Exponer la cola de revisión en pi-harness. **Implementado: `PiHarnessMemoryProvider.listDueForReview()` devuelve entradas acotadas por límite, tamaño y proyecto.**
- Definir el protocolo reusable para agentes consumidores: bootstrap de contexto, búsqueda antes de decisiones, guardado durable, actualización por tema, resumen de sesión y exclusión de secretos/trivialidades. **Implementado en `AgentMemoryProtocol` y documentado en `docs/agent-memory-protocol.md`.**
- Conectar el protocolo a runtimes consumidores mediante una superficie estándar. **Implementado con MCP nativo, setup portable y E2E de dos consumidores independientes que cubre recall, actualización idempotente, ownership de sesión, resumen, compactación y reanudación. El registro nativo de cada proveedor queda fuera del núcleo: cada host MCP consume el mismo `mcp.json`.**
- Preparar la migración a un runtime nativo con una línea base ejecutable. **Completado para la Fase 0: `docs/agent-memory-conformance.md`, un fixture JSON determinista, runners black-box y `npm run test:agent-memory-conformance-adapter` permiten ejecutar y comparar el Core TypeScript con un proceso externo. `npm run test:agent-memory-surface-conformance` cubre MCP, mantenimiento e instalación.**

**Resultado:** un agente preserva y recupera contexto local entre sesiones.

## Etapa 3 — Corporate Knowledge RAG

**Objetivo:** indexar y recuperar conocimiento documental corporativo.

**Estado:** en curso avanzado. Están implementados los contratos documentales, la ingesta Markdown con chunking, el esquema PostgreSQL, el repositorio de persistencia y la recuperación full-text/vectorial/híbrida con filtros de acceso. La dimensión provisional quedó fijada en `vector(384)` y se añadió un índice HNSW.

- Diseñar tablas para fuentes, documentos, versiones, chunks, embeddings, metadatos y políticas de acceso.
- Implementar la ingesta inicial de documentos Markdown locales.
- Normalizar contenido y extraer metadatos mínimos.
- Implementar chunking configurable.
- Definir un `EmbeddingProvider` desacoplado del proveedor concreto. **Contrato y adaptador inicial implementados; E5 queda como proveedor provisional tras el benchmark ampliado.**
- Implementar búsqueda full-text y vectorial. **Completado en el repositorio inicial.**
- Combinar ambas mediante recuperación híbrida. **Completado con ponderación lexical/coseno 0.5/0.5 como línea base.**
- Integrar un `EmbeddingProvider` concreto y definir la dimensión estable de embeddings. **E5 queda como referencia provisional; `vector(384)` está aplicado en la migración 002 con índice HNSW y la integración real PostgreSQL pasa.**
- Enriquecer la ingesta Markdown con embeddings antes de persistir. **Implementado mediante `ingestMarkdownWithEmbeddings`.**
- Coordinar ingesta, embeddings y persistencia mediante una fachada de aplicación. **Implementado con `KnowledgeIngestionService`.**
- Exponer una consulta de aplicación que genere el embedding, ejecute retrieval híbrido y devuelva `SourceCitation` con provenance. **Implementado con `KnowledgeQueryService` y expuesto por HTTP. No existe transporte MCP para RAG; su necesidad sigue por decidir.**

**Resultado:** consultas documentales relevantes, trazables y con fuentes.

## Etapa 4 — Context Orchestrator

**Objetivo:** producir contexto unificado sin exponer detalles de almacenamiento al consumidor.

**Estado:** primer vertical slice implementado: `ContextRequest`, `ContextBundle`, `ContextProvider.resolve()` y `ContextOrchestrator` combinan Agent Memory y RAG, permiten seleccionar fuentes y aplican límite de caracteres con provenance documental.

- Definir `ContextRequest` con actor, rol, workspace, intención, tarea y límites de contexto. **Implementado inicialmente con workspace, actor, equipos, consulta, límites y selección de fuentes.**
- Definir `ContextBundle` con memorias, documentos, fuentes, políticas y razones de inclusión. **Implementado con memorias, citas documentales, texto unificado, razones y estado de truncamiento.**
- Implementar detección inicial de consultas de continuidad, documentales y mixtas. **Implementado con clasificación determinista multilingüe y exposición de la intención en `ContextBundle`.**
- Seleccionar Agent Memory, RAG o ambas fuentes según la solicitud. **Implementado mediante intención inferida y `includeMemory`/`includeKnowledge` como override.**
- Fusionar, ordenar y limitar resultados. **Implementado con consulta paralela, pesos configurables por fuente, `maxChars` y `maxTokens` estimado.**
- Exponer `ContextProvider.resolve()`. **Implementado por `ContextOrchestrator`.**

**Resultado:** una única llamada prepara contexto útil y trazable para un agente.

## Etapa 5 — Permisos, calidad y evaluación

**Objetivo:** verificar seguridad y calidad antes de integrar fuentes corporativas.

**Estado:** base técnica implementada: ACL en la consulta, auditoría HTTP, detección de contenido sensible antes de persistencia/embeddings y evaluación determinista de contexto. Falta validación operativa con identidad corporativa y corpus representativo; la vigencia/revisión de documentos corporativos es más limitada que el lifecycle de Agent Memory.

- Implementar ACL inicial por actor, equipo y workspace. **Implementado en el contrato y el retrieval.**
- Aplicar controles de acceso dentro de las consultas de RAG. **Implementado dentro de SQL.**
- Registrar eventos mínimos de auditoría. **Implementado mediante `AuditSink` y `PostgresAuditLog`.**
- Añadir clasificación y autoridad de fuentes. **El contrato de fuente y provenance existen; no hay un modelo completo de gobierno/autoridad documental.**
- Crear dataset de evaluación con consultas y resultados esperados. **Implementado con casos deterministas de continuidad, documental, mixto y aislamiento por permisos.**
- Medir relevancia, cobertura, citas y filtrado de permisos. **Implementado con el arnés `evaluateContextProvider`, que calcula exactitud de intención, precision/recall de memoria y citas, fugas de contenido prohibido y umbrales configurables para CI mediante `thresholdFailures`; el workflow ejecuta además `npm run test:context-evaluation` como verificación dedicada.**
- Evaluar el recorrido real de composición. **Implementado con `context-evaluation.real-provider.test.ts`: usa SQLite real para Agent Memory, `MemoryService`, `KnowledgeQueryService`, un repositorio documental determinista con ACL y `ContextOrchestrator`.**
- Comparar contra el almacenamiento corporativo real. **Implementado y validado de forma opt-in con `context-evaluation.postgres.integration.test.ts`: usa PostgreSQL/pgvector, ingesta con embeddings de 384 dimensiones, consulta híbrida, filtros ACL y los mismos umbrales; con PostgreSQL local en `55432` la evaluación pasó.**
- Convertir la evaluación del `EmbeddingProvider` en una regresión automatizable. **Implementado de forma opt-in con `test:embedding-benchmark`: la comparación real aplica umbrales de recall@3 y precisión de cita@1 por modelo, además de reportar latencia media y P95.**
- Habilitar una prueba funcional persistente sobre un proyecto real. **Implementado con `npm run demo:agent-memory`, que ejercita SQLite, FTS5, `projectId`/`workspaceId` y recuperación del provider tipo pi-harness sin requerir PostgreSQL ni un modelo.**
- Definir reglas de vigencia, revisión y deprecación para documentos corporativos. **Pendiente de completar; no confundir con el lifecycle ya implementado para Agent Memory.**
- Añadir detección de contenido sensible durante la ingesta. **Implementado con patrones conservadores para claves privadas, JWT, claves AWS y asignaciones de credenciales; se ejecuta antes de embeddings/persistencia y también antes de guardar Agent Memory en SQLite.**

**Resultado:** conocimiento relevante sin exposición no autorizada.

## Etapa 6 — API y adaptadores

**Objetivo:** permitir consumo desacoplado desde pi-harness y otros clientes.

**Estado:** API HTTP de conocimiento/contexto, autenticación/autorización inicial, auditoría persistente, interfaz `BearerIdentityResolver`, entrypoint, Docker, cliente TypeScript y adaptador de herramientas para pi-harness implementados. Agent Memory se distribuye como paquete privado; el instalador configura Codex y el proyecto incluye CLI `doctor`, backup, upgrade y rollback. CI declara matriz Ubuntu/Windows y ejecuta typecheck, lint, build, tests, smokes, contratos de empaquetado y release interno. No se ha verificado en esta revisión el estado de ejecuciones remotas de CI. Quedan pendientes un resolver de identidad conectado a un IdP real y las extensiones nativas en runtimes consumidores cuando sean necesarias. `private: true` refleja la decisión actual de distribución interna.

- Exponer API interna para memoria, conocimiento y contexto. **`POST /v1/context` y `KnowledgeHttpClient.context()` implementados; el servidor compone Agent Memory SQLite y Knowledge RAG.**
- Contratos TypeScript de aplicación/cliente y rutas HTTP implementados; no se ha establecido aquí una API de red versionada como contrato multiplataforma completo.
- El adaptador `PiHarnessKnowledgeAdapter` define herramientas para el consumidor, pero el registro nativo mediante `pi.registerTool` vive en el repositorio pi-harness y no está incluido aquí.
- La integración provider-neutral de Agent Memory sobre MCP está implementada; los hosts pueden usar el mismo servidor MCP. Los registros/hooks nativos adicionales son integración externa.
- Agent Memory local con SQLite y el provider de pi-harness están implementados.
- MCP disponible para Agent Memory; no para RAG/conocimiento documental.
- `BearerIdentityResolver` existe como contrato, pero falta una implementación conectada a un proveedor de identidad corporativo.

**Resultado:** los consumidores usan el mismo servicio sin conocer sus almacenamientos internos.

## Etapa 7 — Conectores y evolución corporativa

**Objetivo:** ampliar fuentes y capacidades sin alterar el núcleo.

- Crear un framework de conectores y sincronización incremental.
- Incorporar fuentes por prioridad de valor.
- Extraer y aplicar permisos de cada fuente.
- Añadir versionado, eliminación lógica y retención.
- Incorporar relaciones complejas entre conocimientos.
- Mejorar reranking, observabilidad y costos operativos.

**Resultado:** plataforma multi-fuente y multirol preparada para operación corporativa.

## Primera entrega funcional

La primera entrega incluye las etapas 1 a 4:

1. Agent Memory SQLite funcional.
2. Ingesta de Markdown en PostgreSQL.
3. Recuperación híbrida documental.
4. `ContextBundle` unificado.

El escenario demostrable es una consulta de desarrollo que recupera una memoria local y documentación autorizada, devolviendo contexto con sus fuentes.
