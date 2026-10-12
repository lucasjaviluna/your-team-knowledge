# Plan de implementación

> Documento vivo. Las etapas y tareas se actualizan al aprobar cambios de alcance o completar hitos.

## Secuencia

```text
Fundación → Agent Memory → Knowledge RAG → Context Orchestrator
     → Governance y evaluación → Adaptadores → Conectores y evolución
```

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

**Estado:** núcleo inicial completado. La persistencia, búsqueda, actualización por `subjectKey`, lifecycle de sesiones y relaciones entre memorias están implementados y probados. La búsqueda FTS5 incorpora expansión léxica conservadora para singular/plural y el demo de consumidor separa escritura de búsqueda para evitar sobrescrituras accidentales.

- Diseñar el esquema de sesiones, memorias, relaciones y resúmenes.
- Implementar `MemoryItem` con tipo, contenido, `subjectKey`, tags, estado y fechas.
- Implementar guardado, búsqueda, recuperación, actualización por `subjectKey` y deduplicación.
- Crear resúmenes de sesión y lifecycle básico: activa, reemplazada y pendiente de revisión.
- Exponer la interfaz `MemoryProvider`.
- Crear pruebas de persistencia, deduplicación y actualización.
- Mejorar recall léxico sin perder precisión. **Implementado inicialmente para variaciones simples singular/plural; quedan pendientes stemming semántico, sinónimos y retrieval vectorial.**

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
- Exponer una consulta de aplicación que genere el embedding, ejecute retrieval híbrido y devuelva `SourceCitation` con provenance. **Contrato y servicio inicial implementados con `KnowledgeQueryService`; queda pendiente el transporte HTTP/MCP.**

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

- Implementar ACL inicial por actor, equipo y workspace.
- Aplicar controles de acceso dentro de las consultas de RAG.
- Registrar eventos mínimos de auditoría.
- Añadir clasificación y autoridad de fuentes.
- Crear dataset de evaluación con consultas y resultados esperados. **Implementado con casos deterministas de continuidad, documental, mixto y aislamiento por permisos.**
- Medir relevancia, cobertura, citas y filtrado de permisos. **Implementado con el arnés `evaluateContextProvider`, que calcula exactitud de intención, precision/recall de memoria y citas, fugas de contenido prohibido y umbrales configurables para CI mediante `thresholdFailures`; el workflow ejecuta además `npm run test:context-evaluation` como verificación dedicada.**
- Evaluar el recorrido real de composición. **Implementado con `context-evaluation.real-provider.test.ts`: usa SQLite real para Agent Memory, `MemoryService`, `KnowledgeQueryService`, un repositorio documental determinista con ACL y `ContextOrchestrator`.**
- Comparar contra el almacenamiento corporativo real. **Implementado y validado de forma opt-in con `context-evaluation.postgres.integration.test.ts`: usa PostgreSQL/pgvector, ingesta con embeddings de 384 dimensiones, consulta híbrida, filtros ACL y los mismos umbrales; con PostgreSQL local en `55432` la evaluación pasó.**
- Convertir la evaluación del `EmbeddingProvider` en una regresión automatizable. **Implementado de forma opt-in con `test:embedding-benchmark`: la comparación real aplica umbrales de recall@3 y precisión de cita@1 por modelo, además de reportar latencia media y P95.**
- Habilitar una prueba funcional persistente sobre un proyecto real. **Implementado con `npm run demo:agent-memory`, que ejercita SQLite, FTS5, `projectId`/`workspaceId` y recuperación del provider tipo pi-harness sin requerir PostgreSQL ni un modelo.**
- Definir reglas de vigencia, revisión y deprecación.
- Añadir detección de contenido sensible durante la ingesta. **Implementado con patrones conservadores para claves privadas, JWT, claves AWS y asignaciones de credenciales; se ejecuta antes de embeddings/persistencia y también antes de guardar Agent Memory en SQLite.**

**Resultado:** conocimiento relevante sin exposición no autorizada.

## Etapa 6 — API y adaptadores

**Objetivo:** permitir consumo desacoplado desde pi-harness y otros clientes.

**Estado:** contrato de aplicación, transporte HTTP para conocimiento y contexto, autenticación/autorización inicial, auditoría persistente, interfaz de identidad, entrypoint ejecutable, despliegue Docker, cliente TypeScript y adaptador de consumidor tipo pi-harness completados. La distribución local de Agent Memory está validada mediante `@corporate-knowledge/platform/memory`, dependencias RAG opcionales y el smoke `npm run test:consumer`, que se ejecuta también en CI. El contrato de distribución está automatizado con `npm run package:check`, el contrato de release interno con `npm run release:check`, la configuración de arranque está aislada y probada con `loadServerConfig`, `/health` y `/ready` separan liveness de readiness con verificación de PostgreSQL y auditoría, y las requests registran duración junto con `requestId`. CI valida explícitamente formato, typecheck, lint, build, tests, evaluación de contexto, contratos de paquete/release, migraciones, tarball y consumidor; queda pendiente conectar el resolver con el proveedor corporativo real y retirar `private: true` sólo cuando exista una decisión explícita de publicación externa.

- Exponer API interna para memoria, conocimiento y contexto. **`POST /v1/context` y `KnowledgeHttpClient.context()` implementados; el servidor compone Agent Memory SQLite y Knowledge RAG.**
- Publicar contratos de red independientes del lenguaje.
- En pi-harness: crear la extensión nativa que mapee `PiHarnessKnowledgeAdapter.toolDefinitions()` a `pi.registerTool`.
- Mantener el Agent Memory como paquete local con SQLite.
- Exponer un `MemoryProvider` compatible con pi-harness sobre el repositorio SQLite.
- Exponer MCP cuando el núcleo y la API estén estabilizados.
- Conectar `BearerIdentityResolver` con el proveedor de identidad corporativo.

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
