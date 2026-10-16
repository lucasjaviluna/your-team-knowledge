# Reporte de madurez y prioridades — 2026-10-15

## Resumen ejecutivo

El proyecto está en un nivel de **alpha interna avanzada / prototipo integrado**. El núcleo técnico ya demuestra el vertical completo —memoria local, RAG corporativo, orquestación de contexto, permisos iniciales, API y empaquetado— y tiene una matriz de calidad sólida. Todavía no debe considerarse un producto listo para adopción amplia o producción porque faltan la integración agéntica provider-neutral end-to-end, MCP, distribución/instalación estable, identidad corporativa real, operación diagnóstica y conectores.

Estimación orientativa:

- **Avance del roadmap técnico:** 65–70%.
- **Madurez del producto operable:** 40–45%.
- **Nivel equivalente:** TRL 5–6 de 9; funciona en un entorno relevante y tiene verticales integrados, pero aún no está demostrado como sistema productivo sostenido.
- **Paridad con Engram en el núcleo de memoria:** 65–70%.
- **Paridad con Engram como producto instalable para agentes:** 25–35%.

Los porcentajes son una lectura comparativa, no métricas contractuales. El proyecto tiene capacidades corporativas fuera del alcance principal de Engram —RAG, ACL, provenance, auditoría y orquestación—, pero Engram es considerablemente más maduro en distribución, integración con agentes y operación cotidiana.

## Evidencia verificada

### Repositorio local

La matriz ejecutada el 2026-10-15 produjo:

- formato, typecheck, lint y build: aprobados;
- suite: 60 pruebas aprobadas y 3 integraciones opt-in omitidas;
- evaluación dedicada de contexto: 4 pruebas aprobadas;
- contratos de paquete, release y migraciones: aprobados;
- `npm pack --dry-run`: aprobado, 158 archivos y tarball de 57,8 kB;
- consumidor limpio: `stored=true`, `hitCount=1`, `isolatedCount=0`;
- smoke de backup y mantenimiento de Agent Memory: aprobado.

Las tres pruebas omitidas requieren PostgreSQL o ejecución real de embeddings. La memoria registra ejecuciones previas exitosas contra PostgreSQL local, pero no fueron repetidas en esta auditoría.

El repositorio continúa en `0.1.0` y `private: true`. No hay evidencia local de un release público. Git sigue rechazando la inspección del working tree por diferencia de ownership/SID, por lo que este reporte no afirma que todos los cambios estén committeados o publicados.

### Memoria del proyecto

El proyecto tiene 88 entradas activas:

- 81 `SUMMARY`;
- 3 `DECISION`;
- 3 `FIX`;
- 1 `BUG`;
- 0 `TASK_CONTEXT`.

Los planes canónicos son:

1. arquitectura de plataforma de conocimiento independiente;
2. roadmap de implementación por etapas;
3. protocolo de Agent Memory automático y provider-neutral.

Los 81 resúmenes son evidencia histórica de incrementos, no 81 planes independientes. La ausencia de `TASK_CONTEXT` hace que los pendientes actuales estén repartidos entre resúmenes antiguos y el plan vivo. Hay además un riesgo de duplicado reportado por el sistema de memoria. Esto reduce la claridad operativa aunque no afecta el código.

## Madurez por área

| Área                            | Avance estimado | Estado                      | Evidencia                                                                                                                      | Falta principal                                                                                |
| ------------------------------- | --------------: | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Arquitectura y contratos        |             90% | Estable                     | límites de módulos, ADRs, contratos de dominio y documentación viva                                                            | limpiar referencias históricas específicas de consumidores y cerrar contratos provider-neutral |
| Base técnica y CI               |             85% | Sólida                      | TypeScript, Docker, migraciones, CI, checks de paquete/release y build                                                         | release reproducible publicado, matriz multiplataforma y operación de upgrade/rollback         |
| Agent Memory SQLite             |             88% | Producto alpha consumible   | Contrato neutral, MCP, FTS5, `subjectKey`, sesiones, relaciones, compactación, lifecycle, review, retención, backup y métricas | setup automático, diagnóstico, timeline y mejor recall                                         |
| Corporate Knowledge RAG         |             75% | Vertical avanzado           | PostgreSQL/pgvector, Markdown, embeddings, HNSW, híbrido, ACL, citations y provenance                                          | corpus real, proveedor/dimensión definitiva, operación productiva y estrategia MCP             |
| Context Orchestrator            |             70% | Vertical funcional          | intención determinista, selección de fuentes, combinación, presupuesto y evaluación                                            | políticas más ricas, reranking, costes, feedback y pruebas de carga/calidad reales             |
| Permisos, gobierno y evaluación |             65% | Base funcional              | ACL en consulta, auditoría, detección de secretos y datasets de evaluación                                                     | IdP real, RBAC/ABAC completo, retención documental y validación de seguridad productiva        |
| API y adaptadores               |             75% | Consumible internamente     | HTTP, MCP, contrato neutral, cliente TypeScript, exports `/memory` y `/mcp`, smokes de consumidor                              | publicación/versionado, setup automático y compatibilidad validada en más hosts                |
| Conectores corporativos         |             10% | No iniciado sustancialmente | diseño general                                                                                                                 | framework, sync incremental, permisos de origen y primer conector real                         |

## Estado de los planes guardados en memoria

### 1. Arquitectura de plataforma independiente

**Estado: mayormente cumplido.**

Se preservó la separación entre Agent Memory, Corporate Knowledge RAG y Context Orchestrator. La plataforma no depende del runtime de un agente concreto y expone contratos/adaptadores. También existen ACL, auditoría, provenance y detección inicial de contenido sensible.

Pendientes:

- terminar de generalizar nombres y contratos que todavía conservan referencias históricas a un consumidor específico;
- demostrar que otro runtime puede integrarse sin usar esos adaptadores específicos;
- definir la frontera definitiva entre API HTTP, MCP y SDK local.

### 2. Roadmap por etapas

| Etapa                              | Estado consolidado                                                      |
| ---------------------------------- | ----------------------------------------------------------------------- |
| 0 — Arquitectura v0                | Completada para el alcance inicial.                                     |
| 1 — Base técnica                   | Completada para desarrollo interno; falta madurez de release/operación. |
| 2 — Agent Memory                   | Núcleo y lifecycle completados; automatización real y MCP pendientes.   |
| 3 — RAG/Postgres                   | Avanzada; falta cierre productivo, corpus real e integración externa.   |
| 4 — Context Orchestrator           | Primer vertical completado; falta evolución de ranking/políticas.       |
| 5 — Permisos, calidad y evaluación | Parcial avanzada; falta IdP y gobierno productivo.                      |
| 6 — API y adaptadores              | Parcial avanzada; HTTP y paquete existen, MCP/release/setup no.         |
| 7 — Conectores y evolución         | Pendiente casi completa.                                                |

La primera entrega funcional definida en el roadmap existe técnicamente: memoria SQLite, ingesta Markdown, recuperación híbrida y `ContextBundle` unificado. Falta convertir esa demostración en un flujo instalable y operado por agentes reales.

### 3. Protocolo automático de Agent Memory

**Estado: definido y parcialmente implementado.**

El protocolo general para `AGENTS.md` ya describe recuperación, persistencia selectiva, deduplicación, seguridad y resumen sin depender de un proveedor. Existe además una fachada TypeScript de bootstrap/recall, guardado idempotente, cierre y observabilidad.

Pendientes:

- reemplazar o envolver la fachada con un contrato cuyo nombre y tipos sean completamente provider-neutral;
- exponer ese contrato mediante MCP u otra superficie estándar;
- validar el ciclo completo con al menos dos agentes/runtimes distintos;
- comprobar recuperación después de compaction/reset;
- aplicar aprobación y ownership de sesión a las escrituras.

### 4. Plan de distribución y release

**Estado: contrato interno listo; publicación pendiente.**

El paquete tiene exports raíz y `/memory`, peers opcionales, validación de tarball y smoke de consumidor. Continúa privado y no existe una política completa de publicación, canales, upgrades, rollback o soporte.

### 5. Plan de calidad y evaluación

**Estado: sólido para CI interno.**

Hay suites unitarias, integración local, evaluación de contexto y benchmarks opt-in. La brecha está en datos y operación reales: corpus representativo, carga, latencia sostenida, recuperación degradada, fallos de red, upgrades y pruebas multiplataforma.

### 6. Plan de conectores corporativos

**Estado: pendiente.**

No hay framework operativo de conectores, sincronización incremental, cursor/checkpoint, propagación de ACL de fuente ni conectores reales.

## Paridad con Engram

La referencia usada es `Gentleman-Programming/engram`, versión estable v3.4.0 al momento del reporte. Engram se presenta como un binario Go único con SQLite/FTS5, MCP, HTTP, CLI y TUI; soporta setup para múltiples agentes, memoria por proyecto, Git Sync y Cloud opcional. También expone herramientas de revisión, comparación, diagnóstico y manejo de sesiones.

| Capacidad                               | Este proyecto                                 | Engram                                 | Lectura                                                             |
| --------------------------------------- | --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| SQLite local + FTS5                     | Sí                                            | Sí                                     | Paridad básica.                                                     |
| Aislamiento por proyecto/workspace      | Sí, explícito                                 | Sí, resolución automática y explícita  | Parcial; falta resolución robusta y UX.                             |
| Sesiones y resúmenes                    | Sí                                            | Sí                                     | Cercano en núcleo; Engram tiene integración operativa más profunda. |
| Actualización idempotente por tema      | Sí, `subjectKey`                              | Sí, `topic_key`                        | Paridad conceptual.                                                 |
| Lifecycle, review, retención y backup   | Sí                                            | Sí                                     | Área fuerte del proyecto; paridad aproximada en núcleo.             |
| MCP nativo                              | No                                            | Sí                                     | Brecha crítica.                                                     |
| HTTP de memoria                         | No completo; HTTP de conocimiento/contexto sí | Sí                                     | Cobertura diferente.                                                |
| CLI de producto                         | Demo y mantenimiento                          | CLI completa                           | Brecha alta.                                                        |
| TUI                                     | No                                            | Sí                                     | Brecha alta de operabilidad.                                        |
| Setup para múltiples agentes            | No                                            | 14 targets + MCP manual                | Brecha crítica de adopción.                                         |
| Diagnóstico/doctor/compatibilidad       | Checks de CI                                  | Doctor y compatibilidad operativa      | Brecha alta.                                                        |
| Timeline/get progresivo                 | Limitado                                      | Sí                                     | Brecha media.                                                       |
| Conflictos, compare/judge               | Relaciones básicas                            | Sí                                     | Brecha media/alta.                                                  |
| Git Sync / Cloud opcional               | No                                            | Sí                                     | Brecha alta, aunque no necesaria para el primer MVP.                |
| Release multiplataforma                 | Paquete Node privado                          | Binarios estables y canales de release | Brecha alta.                                                        |
| RAG corporativo con pgvector            | Sí                                            | No es su foco principal                | Capacidad diferencial a favor.                                      |
| ACL, provenance y auditoría corporativa | Sí, primer vertical                           | Menor alcance corporativo local        | Capacidad diferencial a favor.                                      |
| Orquestación memoria + documentos       | Sí                                            | No es su foco principal                | Capacidad diferencial a favor.                                      |

Conclusión de paridad: no conviene intentar copiar toda la superficie de Engram antes de validar el caso corporativo diferencial. Sí conviene alcanzar paridad en el camino crítico del agente: instalación, detección de proyecto, MCP, contexto inicial, búsqueda/guardado, resumen, diagnóstico y recuperación tras compaction.

## Riesgos principales

1. **Producto sin camino de adopción:** el núcleo es amplio, pero un agente genérico aún no puede instalarlo y usarlo con una orden simple.
2. **Plan disperso:** los pendientes históricos viven en 81 resúmenes y no hay `TASK_CONTEXT` activo.
3. **Contratos todavía específicos:** el protocolo textual es genérico, pero la fachada implementada conserva nombres específicos de un consumidor.
4. **Validación externa insuficiente:** las integraciones PostgreSQL/embeddings son opt-in y no corrieron en esta auditoría.
5. **Identidad provisional:** falta conectar un IdP real y endurecer ownership/autorización de sesiones y mutaciones.
6. **Sin release operativo:** `private: true`, sin instalador, upgrade, rollback o soporte de versiones.
7. **Documentación con drift:** algunas líneas aún describen HTTP como pendiente aunque ya existe, y mezclan pendientes históricos con estado actual.

## Próximos pasos ordenados por prioridad

### P0 — Convertir el núcleo en un producto usable por agentes

1. **Definir el contrato provider-neutral de Agent Memory. — Completado.** `AgentMemoryProvider`, `SqliteAgentMemoryProvider` y `AgentMemoryProtocol` fijan proyecto, búsqueda, get, save/update, revisión y lifecycle de sesión sin depender de un runtime.
2. **Implementar MCP nativo sobre ese contrato. — Completado.** El servidor `stdio` expone cinco herramientas validadas, resultados estructurados y aislamiento inmutable por proyecto; un smoke E2E usa el cliente oficial.
3. **Validar el protocolo end-to-end con agentes reales.** Probar bootstrap, decisión, update idempotente, bug/fix, resumen, reanudación y compaction con al menos dos runtimes/proveedores.
4. **Endurecer identidad de proyecto y ownership de sesión.** Resolver proyecto desde configuración/cwd/git, bloquear mutaciones cross-project y registrar la sesión propietaria.
5. **Crear un release instalable interno.** Decidir registry/canal, retirar `private` sólo si corresponde, documentar instalación, upgrade, backup y rollback; ejecutar una matriz Windows/Linux.

### P1 — Cerrar madurez operativa y corporativa

6. **Añadir diagnóstico y compatibilidad.** Comando/endpoint read-only tipo `doctor`, verificación de esquema, permisos, base, versión, migraciones y capacidades activas.
7. **Mejorar recuperación de memoria.** Get completo, timeline de sesión, filtros, búsqueda semántica opcional y evaluación específica de recall/precision de memoria.
8. **Añadir gestión de conflictos y evolución.** Comparar, marcar conflicto/supersedes y revisar conocimiento vencido con operaciones auditables.
9. **Conectar identidad corporativa real.** Implementar `BearerIdentityResolver`, probar aislamiento multiusuario y completar RBAC/ABAC donde sea necesario.
10. **Cerrar RAG productivo.** Validar un corpus real, fijar modelo/dimensión, medir calidad/latencia/coste y probar las integraciones PostgreSQL en CI o en un job periódico controlado.
11. **Fortalecer el Context Orchestrator.** Reranking, políticas por rol/tarea, feedback de utilidad, presupuestos reales de tokens y observabilidad de selección.

### P2 — Expandir alcance sin diluir el camino crítico

12. **Implementar el framework de conectores.** Contrato de source, checkpoint, sync incremental, borrado lógico, versionado y ACL de origen.
13. **Construir un primer conector de alto valor.** Elegir una fuente real y llevarla hasta consulta autorizada con provenance y refresh incremental.
14. **Añadir una UI operativa mínima.** TUI o panel para inspeccionar, corregir, revisar y diagnosticar memoria; no es requisito para el primer piloto MCP.
15. **Evaluar sincronización compartida.** Git sync, servidor compartido o réplica corporativa sólo después de validar el flujo local y el modelo de permisos.

### P3 — Higiene de gobierno

16. **Consolidar la memoria del proyecto.** Crear un `TASK_CONTEXT` canónico con pendientes actuales y actualizar la decisión/roadmap en lugar de seguir acumulando planes en resúmenes.
17. **Corregir drift documental.** Alinear `implementation-plan.md`, arquitectura, API y protocolo con el estado real.
18. **Resolver la inspección Git local.** Corregir de forma explícita y segura la discrepancia de ownership/SID para poder auditar cambios, commits y releases.

## Criterio de salida para el próximo nivel de madurez

El proyecto puede considerarse **beta interna** cuando cumpla simultáneamente:

- instalación reproducible en Windows y Linux;
- MCP provider-neutral funcional;
- piloto end-to-end con dos agentes;
- aislamiento y ownership de proyecto/sesión probado;
- backup, upgrade y rollback documentados;
- integración PostgreSQL/embeddings ejecutada en una pipeline controlada;
- IdP o autenticación equivalente validada;
- roadmap y memoria con un único estado canónico de trabajo pendiente.

## Fuentes externas de comparación

- Engram README y capacidades: <https://github.com/Gentleman-Programming/engram>
- Engram releases: <https://github.com/Gentleman-Programming/engram/releases>
- Engram arquitectura: <https://github.com/Gentleman-Programming/engram/blob/main/docs/ARCHITECTURE.md>
- Engram documentación completa: <https://github.com/Gentleman-Programming/engram/blob/main/DOCS.md>
