# Estado y hoja de ruta de Agent Memory

**Fecha de análisis:** 2026-10-25

## Alcance y criterios de éxito

Un agente debe poder instalar el binario, recuperar conocimiento útil, guardar cambios sin pérdida, cerrar y retomar sesiones, y operar la base con seguridad en las plataformas y hosts soportados. HTTP, cloud y sincronización entre equipos requieren una decisión de producto y arquitectura independiente; el alcance vigente está en [ADR 0009](adr/0009-agent-memory-only-scope.md).

Este análisis distingue **implementado en código**, **cubierto por pruebas automatizadas** y **validado con usuarios y hosts reales**. No hay una medición empírica de calidad de recuperación, latencia o adopción.

## Estado comprobado

- `native/ytk-memory` implementa SQLite/FTS5, sesiones, `subjectKey`, búsqueda léxica, relaciones, revisión, retención y compactación. El guardado rechaza patrones de contenido sensible antes de persistir.
- El MCP Go conserva las cinco herramientas base y añade revisión, corrección y consulta de relaciones/versiones. El proceso fija proyecto y propietario de sesión; los tests de superficie verifican aislamiento, doctor, backup, upgrade y rollback.
- El cierre de sesión rechaza contenido sensible antes de cualquier escritura y guarda el resumen y el cierre en una sola transacción. `Save` mantiene la memoria y el índice FTS en una transacción; `Compact` agrupa resumen, relaciones y archivado. Las pruebas inyectan fallos SQLite para comprobar que no queda estado parcial.
- `setup codex` instala activación local y registro MCP global; `uninstall codex` conserva la base. El usuario confirmó que el piloto del runbook se completó correctamente en Windows; la validación manual en Linux queda aplazada y pasar los checks Linux de GitHub Actions es suficiente por ahora.
- CI corre en Windows x64 y Linux x64. Formatea, analiza, prueba y compila el módulo Go. La automatización de artefactos firmados queda como trabajo posterior.
- Go es el único runtime de Agent Memory.

Evidencia: [estado actual](current-status.md), [arquitectura](architecture.md), [plan de migración](agent-memory-go-migration-plan.md), `native/ytk-memory/internal/core/store.go`, `native/ytk-memory/internal/surface/server.go`, `native/ytk-memory/internal/setup/codex.go` y `.github/workflows/ci.yml`.

## Brechas para el uso real

| Dimensión                  | Estado actual                                                                                                                                                   | Trabajo pendiente                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Recuperación contextual    | Búsqueda por consulta y recuperación opcional al abrir sesión, con límites de resultados y caracteres.                                                          | Evaluar un contexto inicial compacto y medir su utilidad y ruido en tareas reales.                                  |
| Evolución del conocimiento | Upsert por `subjectKey`, relaciones y revisión en core; MCP permite guardar y leer.                                                                             | Exponer corrección, revisión y consulta de relaciones al agente.                                                    |
| Seguridad y consistencia   | Aislamiento por proyecto/proceso, rechazo de patrones sensibles antes de persistir y operaciones compuestas transaccionales en cierre, guardado y compactación. | Ejercitar reintentos y concurrencia durante el piloto, y aplicar el mismo patrón a futuras operaciones compuestas.  |
| Integraciones              | Setup Codex y configuración MCP manual para otros hosts.                                                                                                        | Validar otro host real y automatizar su setup si el piloto demuestra demanda.                                       |
| Distribución               | CI compila y prueba en Windows/Linux x64.                                                                                                                        | Definir empaquetado Go, clave confiable estable, política de publicación y soporte.                                |
| Alcance de memoria         | Base local por repositorio, sin sincronización automática.                                                                                                      | Decidir si compartir entre repositorios o equipos aporta al objetivo antes de diseñarlo.                            |

Las prioridades son la fiabilidad del ciclo de sesión, el contexto útil al iniciar, las operaciones de mantenimiento disponibles al agente, la validación en hosts reales y un release instalable con confianza verificable.

## Plan priorizado

### P0 — Cerrar riesgos de datos y demostrar el ciclo real

1. **Fase 5 — completada según confirmación del usuario.** El runbook se ejecutó correctamente en Windows. La prueba manual en Linux queda aplazada y los checks Linux de GitHub Actions son suficientes por ahora.

**Salida P0:** completada según la confirmación del usuario. Go es el único runtime.

### P1 — Capacidades de memoria para el agente

4. **Añadir contexto inicial compacto — implementado, pendiente de verificación.** `memory_session_start` sin consulta devuelve memorias activas con prioridad explícita, resúmenes recientes y un presupuesto total configurable; conserva aislamiento de proyecto y área.
5. **Exponer lifecycle y corrección al agente — implementado, pendiente de verificación.** Se añadieron `memory_review_list`, `memory_review_complete`, `memory_correct` y `memory_relations`, conservando las cinco herramientas originales. La corrección crea una versión nueva, marca la anterior como `superseded` y registra `supersedes` atómicamente.
6. **Evaluar recuperación con tareas representativas — implementado.** El corpus sintético versionado cubre decisiones, cambio de nombre, información contradictoria, términos exactos y paráfrasis. `ytk-memory evaluate` informa recall@k, precisión de búsqueda y briefing, latencia local y tamaño del contexto. Los resultados establecen la línea base léxica para priorizar ranking y relaciones según errores observados; embeddings no entran por defecto.
7. **Resolver conflictos y consolidación con control humano — implementado.** `memory_relations` muestra candidatos y relaciones existentes; `memory_consolidation_preview` presenta las fuentes, resumen y archivos propuestos sin escribir. `memory_consolidate` exige `confirm: true`; conserva las fuentes por defecto y sólo las archiva bajo esa confirmación. `memory_correct` mantiene el veredicto de una versión canónica con trazabilidad `supersedes`.

**Salida P1:** completada en código y pruebas. Un agente puede descubrir, corregir, revisar, consolidar bajo confirmación y explicar memorias obsoletas sin usar SQL ni CLI administrativo; el conjunto de evaluación muestra la línea base de YTK.

### P2 — Distribución y soporte sostenibles

8. **Definir el canal de release confiable — implementado, pendiente de activación.** `ytk-memory release package` genera ZIP/tar.gz reproducible, manifiesto con versión de esquema/protocolo, SHA-256 y firma Ed25519. `release verify` valida el artefacto antes de instalar. La CI de tags exige clave privada persistente como secreto, comprueba la clave pública esperada, verifica las firmas antes de publicar y distingue `--ephemeral-key` de un release aprobado. La política de custodia, rotación y revocación está en `docs/release-policy.md`. Queda configurar el material de firma real y ejecutar el primer tag aprobado.
9. **Automatizar hosts adicionales — implementado para Claude Code, Pi y OpenCode.** `setup claude` gestiona `.mcp.json`/`CLAUDE.md`; `setup pi` gestiona `.pi/mcp.json`/`AGENTS.md` y requiere confiar el proyecto antes de `/reload`; `setup opencode` gestiona el MCP local de `opencode.json`/`opencode.jsonc` y agrega instrucciones a `AGENTS.md`. Los adaptadores preservan configuración ajena, rechazan colisiones no administradas y conservan la base. `doctor --host <claude|pi|opencode>` valida registro y ejecutable.
10. **Extender plataformas según demanda real.** Añadir macOS arm64 con runner nativo y prueba del artefacto antes de declararlo soportado; luego considerar Windows/Linux arm64. Los gestores de paquetes quedan detrás del release verificable y la capacidad de soporte.
11. **Endurecer diagnóstico y recuperabilidad.** `doctor` debe detectar configuración TOML dañada, ejecutable registrado que no coincide, permisos/rutas de base, integridad SQLite y versiones incompatibles con instrucciones accionables. Probar backup/restore con una base heredada y con WAL activo.

**Salida P2:** instalación y actualización documentadas desde un canal aprobado, con prueba de confianza y recuperación reproducible, en cada plataforma declarada soportada.

### P3 — Decisiones opcionales de producto

12. **Decidir alcance de memoria compartida.** Evaluar si hace falta memoria personal/global, sincronización entre equipos o exportación portable. Diseñar identidad, permisos, conflictos, privacidad y recuperación antes de implementar. Registrar un ADR si cambia el modelo local por proyecto.
13. **Reconsiderar HTTP/TUI sólo con un consumidor concreto.** ADR 0009 excluye HTTP de este repositorio. Reabrir esa decisión sólo con un caso de uso, límites de seguridad y plan de mantenimiento claros. RAG y conocimiento documental siguen perteneciendo a otro proyecto.

## Verificación de este análisis

Se revisaron código, contratos, CI y documentación vigentes; `go test ./...` cubre core, MCP, setup y operaciones administrativas. El resultado no sustituye el piloto real.
