# Estado y hoja de ruta de Agent Memory

**Fecha de análisis:** 2026-10-22

## Alcance y criterios de éxito

Un agente debe poder instalar el binario, recuperar conocimiento útil, guardar cambios sin pérdida, cerrar y retomar sesiones, y operar la base con seguridad en las plataformas y hosts soportados. HTTP, cloud y sincronización entre equipos requieren una decisión de producto y arquitectura independiente; el alcance vigente está en [ADR 0009](adr/0009-agent-memory-only-scope.md).

Este análisis distingue **implementado en código**, **cubierto por pruebas automatizadas** y **validado con usuarios y hosts reales**. No hay una medición empírica de calidad de recuperación, latencia o adopción.

## Estado comprobado

- `native/ytk-memory` implementa SQLite/FTS5, sesiones, `subjectKey`, búsqueda léxica, relaciones, revisión, retención y compactación. El guardado rechaza patrones de contenido sensible antes de persistir.
- El MCP Go expone cinco herramientas: `memory_session_start`, `memory_search`, `memory_get`, `memory_save` y `memory_session_finish`. El proceso fija proyecto y propietario de sesión; los tests de superficie verifican aislamiento, doctor, backup, upgrade y rollback.
- El cierre de sesión rechaza contenido sensible antes de cualquier escritura y guarda el resumen y el cierre en una sola transacción. `Save` mantiene la memoria y el índice FTS en una transacción; `Compact` agrupa resumen, relaciones y archivado. Las pruebas inyectan fallos SQLite para comprobar que no queda estado parcial.
- `setup codex` instala activación local y registro MCP global; `uninstall codex` conserva la base. Existe configuración MCP portable para otros hosts, pero todavía no hay setup automatizado ni piloto documentado en un segundo host.
- CI corre en Windows x64 y Linux x64. Construye paquetes nativos, checksum y firma Ed25519 y prueba una instalación limpia. Sin clave persistente configurada, la firma es efímera y **no constituye una cadena de confianza para un release distribuido**.
- TypeScript sigue como canal de compatibilidad. El plan de migración marca las fases 0–4 completas y la fase 5, piloto y transición, pendiente.

Evidencia: [estado actual](current-status.md), [arquitectura](architecture.md), [plan de migración](agent-memory-go-migration-plan.md), `native/ytk-memory/internal/core/store.go`, `native/ytk-memory/internal/surface/server.go`, `native/ytk-memory/internal/setup/codex.go`, `.github/workflows/ci.yml` y `scripts/agent-memory-go-release.mjs`.

## Brechas para el uso real

| Dimensión                  | Estado actual                                                                                                                                                   | Trabajo pendiente                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Recuperación contextual    | Búsqueda por consulta y recuperación opcional al abrir sesión, con límites de resultados y caracteres.                                                          | Evaluar un contexto inicial compacto y medir su utilidad y ruido en tareas reales.                                  |
| Evolución del conocimiento | Upsert por `subjectKey`, relaciones y revisión en core; MCP permite guardar y leer.                                                                             | Exponer corrección, revisión y consulta de relaciones al agente.                                                    |
| Seguridad y consistencia   | Aislamiento por proyecto/proceso, rechazo de patrones sensibles antes de persistir y operaciones compuestas transaccionales en cierre, guardado y compactación. | Ejercitar reintentos y concurrencia durante el piloto, y aplicar el mismo patrón a futuras operaciones compuestas.  |
| Integraciones              | Setup Codex y configuración MCP manual para otros hosts.                                                                                                        | Validar otro host real y automatizar su setup si el piloto demuestra demanda.                                       |
| Distribución               | Artefactos Windows/Linux x64 en CI, checksum, firma y prueba de instalación.                                                                                    | Definir clave confiable estable, política de publicación y soporte, piloto y plataformas adicionales según demanda. |
| Alcance de memoria         | Base local por repositorio, sin sincronización automática.                                                                                                      | Decidir si compartir entre repositorios o equipos aporta al objetivo antes de diseñarlo.                            |

Las prioridades son la fiabilidad del ciclo de sesión, el contexto útil al iniciar, las operaciones de mantenimiento disponibles al agente, la validación en hosts reales y un release instalable con confianza verificable.

## Plan priorizado

### P0 — Cerrar riesgos de datos y demostrar el ciclo real

1. **Ejecutar la fase 5 del piloto.** Usar el binario empaquetado en dos repositorios consumidores y dos hosts MCP reales, uno Codex y otro host elegido por el equipo. Probar sesión nueva, reinicio del host, recuperación al día siguiente, actualización de un tema, backup, upgrade, rollback y uninstall. Guardar resultados, versiones, plataforma, defectos y tiempos de tarea sin almacenar secretos ni transcripciones.

**Salida P0:** dos repositorios y dos hosts recuperan memoria tras reiniciar, usando artefactos de release. El piloto decide si Go puede pasar a runtime principal sin retirar TypeScript todavía.

### P1 — Capacidades de memoria para el agente

4. **Añadir contexto inicial compacto.** Diseñar `memory_context` o ampliar la respuesta de inicio para ofrecer sesiones recientes, resúmenes y memorias prioritarias dentro de un presupuesto explícito de bytes. Medir utilidad y ruido frente a la búsqueda actual; mantener proyecto y área aislados.
5. **Exponer lifecycle y corrección al agente.** Ofrecer revisión pendiente, marcar revisado, actualizar una memoria por ID con aserción de proyecto y consultar relaciones/versiones. Preservar el contrato de cinco herramientas existente; agregar herramientas nuevas con fixtures de conformidad TypeScript/Go o definir formalmente qué superficie queda sólo en Go.
6. **Evaluar recuperación con tareas representativas.** Crear un corpus pequeño de decisiones, cambios de nombre, versiones contradictorias, términos exactos y paráfrasis. Medir recall@k, precisión del briefing, latencia y tamaño del contexto frente a la línea base de YTK. Priorizar mejoras léxicas/ranking y exposición de relaciones según errores observados; embeddings no entran por defecto.
7. **Resolver conflictos y consolidación con control humano.** Primero mostrar candidatos y relaciones existentes; luego permitir veredictos y consolidación con vista previa y confirmación explícita. Evitar que un upsert o resumen borre evidencia histórica sin versión o rastro de revisión.

**Salida P1:** un agente puede descubrir, corregir, revisar y explicar memorias obsoletas sin usar SQL ni CLI administrativo; el conjunto de evaluación muestra una mejora medible sobre la línea base de YTK.

### P2 — Distribución y soporte sostenibles

8. **Definir el canal de release confiable.** Fijar clave pública y custodia de firma, versión de esquema/protocolo, política de soporte, revocación y procedimiento de actualización/rollback. Publicar sólo desde un job protegido con clave persistente; distinguir explícitamente artefactos de CI con firma efímera. Añadir verificación automatizada del artefacto descargado, hash y firma.
9. **Automatizar un segundo host.** Tras el piloto, implementar `setup`/`uninstall` idempotentes para el host que haya demostrado demanda. Probar configuración ajena preexistente, reinicio, conflicto, rutas con espacios y desinstalación sin borrar la base.
10. **Extender plataformas según demanda real.** Añadir macOS arm64 con runner nativo y prueba del artefacto antes de declararlo soportado; luego considerar Windows/Linux arm64. Los gestores de paquetes quedan detrás del release verificable y la capacidad de soporte.
11. **Endurecer diagnóstico y recuperabilidad.** `doctor` debe detectar configuración TOML dañada, ejecutable registrado que no coincide, permisos/rutas de base, integridad SQLite y versiones incompatibles con instrucciones accionables. Probar backup/restore con una base heredada y con WAL activo.

**Salida P2:** instalación y actualización documentadas desde un canal aprobado, con prueba de confianza y recuperación reproducible, en cada plataforma declarada soportada.

### P3 — Decisiones opcionales de producto

12. **Decidir alcance de memoria compartida.** Evaluar si hace falta memoria personal/global, sincronización entre equipos o exportación portable. Diseñar identidad, permisos, conflictos, privacidad y recuperación antes de implementar. Registrar un ADR si cambia el modelo local por proyecto.
13. **Reconsiderar HTTP/TUI sólo con un consumidor concreto.** ADR 0009 excluye HTTP de este repositorio. Reabrir esa decisión sólo con un caso de uso, límites de seguridad y plan de mantenimiento claros. RAG y conocimiento documental siguen perteneciendo a otro proyecto.

## Verificación de este análisis

Se revisaron código, contratos, CI y documentación vigentes; pasaron `go test ./...` y la prueba `npm run test:agent-memory-go-surface`, que confirmó las cinco herramientas y las operaciones administrativas. El resultado no sustituye el piloto real.
