# Estado actual y punto de continuación

**Revisado:** 2026-10-21
**Alcance:** inspección local de documentación, código, scripts y workflow de CI. La última ejecución remota fue confirmada como verde por el equipo; no se consultó su detalle desde este checkout. La guía operativa nueva está en [agent-memory-installation.md](agent-memory-installation.md) y la documentación visual en [agent-memory.html](agent-memory.html). Git quedó habilitado para este checkout después de configurar su ruta como segura.

Este es el punto canónico para retomar trabajo. El [plan de implementación](implementation-plan.md) describe el alcance por etapas; este documento registra qué está comprobado, qué falta y cuál es el siguiente paso.

## Objetivo próximo

Ejecutar el piloto de Agent Memory nativo en repositorios consumidores y hosts MCP reales. Las Fases 0, 1, 2, 3 y 4 están cerradas: `native/ytk-memory` contiene el Core SQLite sin cgo, el servidor MCP `stdio`, ownership de sesiones, comandos operativos, setup/uninstall seguro para Codex y empaquetado nativo Windows/Linux. El fixture compartido pasa en ambos runtimes. TypeScript sigue intacto y activo hasta completar la transición y el piloto de la Fase 5. La decisión arquitectónica está en [ADR 0007](adr/0007-agent-memory-native-go-runtime.md) y la experiencia objetivo para repositorios consumidores en la [guía de consumo nativo](agent-memory-native-consumer-guide.md).

## Resumen

El repositorio contiene un vertical funcional de plataforma interna: Agent Memory local, RAG documental con PostgreSQL/pgvector, composición de contexto y API HTTP. Agent Memory tiene un flujo MCP y herramientas de instalación/administración. El RAG se consume por HTTP; no se encontró un servidor MCP para conocimiento documental.

El estado es **alpha interna**. La implementación y los contratos están bastante desarrollados, pero faltan una validación con corpus corporativo representativo, identidad conectada a un IdP y evidencia de operación sostenida. El paquete sigue en `0.1.0` y `private: true`.

## Implementado y comprobado en el repositorio

- **Agent Memory:** SQLite, contrato `AgentMemoryProvider`, protocolo de sesión, MCP `stdio`, aislamiento por proyecto, guardado idempotente, lifecycle/revisión/retención y CLI `doctor`, backup, upgrade y rollback.
- **Runtime Go nativo de Agent Memory:** Core SQLite sin cgo; cinco herramientas MCP compatibles; `doctor`, backup, upgrade y rollback; prueba E2E de dos procesos consumidores y fixture Core compartido. La Fase 4 añade paquetes Windows/Linux, manifiestos, SHA-256, firma Ed25519 y validación de instalación limpia.
- **Setup nativo Codex:** `setup codex`, `--dry-run`, alcances local/global/ambos y desinstalación selectiva. Preserva TOML y Markdown preexistentes, genera la base SQLite y permite a `doctor` comprobar el registro MCP nativo.
- **Instalación:** inicializador con adaptador Codex, configuración MCP local, instrucciones/skill y operaciones repetibles con `dry-run`/desinstalación.
- **RAG:** ingesta Markdown, `EmbeddingProvider`, PostgreSQL/pgvector, retrieval lexical/vectorial/híbrido, ACL dentro de la consulta y citas/provenance. `Xenova/multilingual-e5-small` y 384 dimensiones siguen siendo provisionales.
- **Contexto y API:** `ContextOrchestrator`, consulta/ingesta HTTP y `POST /v1/context`, cliente TypeScript, autorización inicial y auditoría.
- **Calidad automatizada:** el workflow configura Node 22 y matriz Ubuntu/Windows, ejecuta formato, typecheck, lint, build, suite, evaluación de contexto, contratos de paquete/release/migración, smokes, release nativo y artefactos de release. La última ejecución remota fue confirmada como verde por el equipo.

## Verificación local de esta revisión

| Check                    | Resultado             | Detalle                                                                                         |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run typecheck`      | Aprobado              | Sin errores.                                                                                    |
| `npm run build`          | Aprobado              | Compilación correcta.                                                                           |
| `npm test`               | Aprobado parcialmente | 68 aprobadas; 3 integraciones omitidas por requerir servicios/modelos.                          |
| `npm run format`         | Aprobado              | Los archivos generados de instrucciones se excluyen de Prettier; la comprobación completa pasa. |
| `npm run lint`           | Sin resultado         | No emitió salida tras más de un minuto y se detuvo; no se considera aprobado.                   |
| Git status/último commit | Disponible            | El checkout está en `main...origin/main`; la inspección de cambios ya no está bloqueada.        |

Las integraciones PostgreSQL/embeddings no se volvieron a ejecutar en esta revisión. El reporte de madurez anterior registraba resultados históricos, que no se deben presentar como verificación actual.

## Pendientes ordenados

1. **Piloto nativo de Agent Memory:** ejecutar la Fase 5 en repositorios consumidores y hosts MCP reales, sin retirar ni desactivar archivos TypeScript.
2. **Definir el piloto RAG:** elegir una fuente/corpus real, consultas representativas, workspace/equipos y el proveedor de identidad esperado. Sin esos datos no se puede cerrar si E5/384 sirve ni comprobar permisos de extremo a extremo.
3. **Ejecutar validación controlada:** con corpus y entorno elegidos, correr las integraciones PostgreSQL/embeddings y establecer si pasan a un job CI programado. Medir calidad de citas, recall, latencia y costo antes de fijar modelo/dimensión.
4. **Conectar identidad real:** implementar `BearerIdentityResolver` para el IdP elegido y verificar aislamiento multiusuario/workspace.
5. **Decidir transporte MCP de RAG:** HTTP ya cubre conocimiento/contexto; añadir MCP sólo si el piloto requiere que agentes consuman directamente herramientas documentales.
6. **Cerrar higiene local:** diagnosticar por qué lint tarda/no termina y repetir el smoke de consumidor en un entorno npm limpio; los demás smokes MCP/E2E ya pasaron en esta revisión.

### Siguiente punto de trabajo recomendado

Implementar el piloto de la Fase 5 del [plan de migración Go](agent-memory-go-migration-plan.md) usando los artefactos nativos generados por CI.

## Verificación de Fases 3 y 4 (2026-10-21)

| Check                                  | Resultado                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `go test ./...`                        | Aprobado                                                                        |
| `npm run test:agent-memory-go-setup`   | Aprobado; dry-run, preservación, repetición, desinstalación y alcance global    |
| `npm run test:agent-memory-go-release` | Aprobado en Windows; paquete nativo, manifiesto, SHA-256, firma y prueba limpia |

La matriz remota de CI ejecuta también el release smoke en Windows y Linux y
publica los artefactos nativos por plataforma. La verificación local del release
se realizó en Windows; la evidencia de Linux corresponde al job remoto verde.

## Verificación de Fase 2 (2026-10-21)

| Check                                      | Resultado                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `go test ./...`                            | Aprobado                                                                                        |
| `npm run test:agent-memory-go-conformance` | Aprobado; 27 operaciones comparadas con TypeScript                                              |
| `npm run test:agent-memory-go-surface`     | Aprobado; cinco herramientas, dos consumidores, aislamiento, doctor, backup, upgrade y rollback |

## Cambios de documentación conciliados

- `implementation-plan.md` distingue MCP de Agent Memory de HTTP para RAG y elimina pendientes que el código ya satisface.
- El reporte anterior de madurez se sustituye por este estado fechado y por la cola de continuación; las cifras comparativas y pendientes históricas no se tratan como evidencia vigente.
