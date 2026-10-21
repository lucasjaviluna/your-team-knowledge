# Estado actual y punto de continuación

**Revisado:** 2026-10-20  
**Alcance:** inspección local de documentación, código, scripts y workflow de CI. No se consultó el estado remoto de CI ni se pudo leer el estado de Git.

Este es el punto canónico para retomar trabajo. El [plan de implementación](implementation-plan.md) describe el alcance por etapas; este documento registra qué está comprobado, qué falta y cuál es el siguiente paso.

## Resumen

El repositorio contiene un vertical funcional de plataforma interna: Agent Memory local, RAG documental con PostgreSQL/pgvector, composición de contexto y API HTTP. Agent Memory tiene un flujo MCP y herramientas de instalación/administración. El RAG se consume por HTTP; no se encontró un servidor MCP para conocimiento documental.

El estado es **alpha interna**. La implementación y los contratos están bastante desarrollados, pero faltan una validación con corpus corporativo representativo, identidad conectada a un IdP y evidencia de operación sostenida. El paquete sigue en `0.1.0` y `private: true`.

## Implementado y comprobado en el repositorio

- **Agent Memory:** SQLite, contrato `AgentMemoryProvider`, protocolo de sesión, MCP `stdio`, aislamiento por proyecto, guardado idempotente, lifecycle/revisión/retención y CLI `doctor`, backup, upgrade y rollback.
- **Instalación:** inicializador con adaptador Codex, configuración MCP local, instrucciones/skill y operaciones repetibles con `dry-run`/desinstalación.
- **RAG:** ingesta Markdown, `EmbeddingProvider`, PostgreSQL/pgvector, retrieval lexical/vectorial/híbrido, ACL dentro de la consulta y citas/provenance. `Xenova/multilingual-e5-small` y 384 dimensiones siguen siendo provisionales.
- **Contexto y API:** `ContextOrchestrator`, consulta/ingesta HTTP y `POST /v1/context`, cliente TypeScript, autorización inicial y auditoría.
- **Calidad automatizada:** el workflow configura Node 22 y matriz Ubuntu/Windows, ejecuta formato, typecheck, lint, build, suite, evaluación de contexto, contratos de paquete/release/migración, smokes y artefacto de release interno. La configuración del workflow no demuestra por sí sola que la última ejecución remota haya pasado.

## Verificación local de esta revisión

| Check                    | Resultado             | Detalle                                                                                                                                                                                                                                    |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`      | Aprobado              | Sin errores.                                                                                                                                                                                                                               |
| `npm run build`          | Aprobado              | Compilación correcta.                                                                                                                                                                                                                      |
| `npm test`               | Aprobado parcialmente | 68 aprobadas; 3 integraciones omitidas por requerir servicios/modelos.                                                                                                                                                                     |
| `npm run format`         | Falló                 | La ejecución inicial reportó `.agents/skills/ytk-memory/SKILL.md`, `.ytk-memory/YTK-MEMORY.md` y `AGENTS.md`. Formateé `AGENTS.md` al añadir la referencia de estado; los dos archivos bajo `.agents/` y `.ytk-memory/` siguen pendientes. |
| `npm run lint`           | Sin resultado         | No emitió salida tras más de un minuto y se detuvo; no se considera aprobado.                                                                                                                                                              |
| Git status/último commit | No disponible         | Git rechazó la carpeta por `dubious ownership`; el working tree puede contener cambios y se desconoce.                                                                                                                                     |

Las integraciones PostgreSQL/embeddings y los smokes de distribución no se volvieron a ejecutar en esta revisión. El reporte de madurez anterior registraba resultados históricos, que no se deben presentar como verificación actual.

## Pendientes ordenados

1. **Recuperar visibilidad del checkout.** Una vez que el propietario confíe en esta carpeta, añadir su ruta exacta a `safe.directory` o corregir el propietario; luego revisar `git status` antes de otros cambios. Comando habitual en Windows:

   ```powershell
   git config --global --add safe.directory 'C:/Users/user/Documents/AI/luna/your-team-knowledge'
   ```

   Esto agrega una excepción global para esa ruta concreta. Usarlo sólo si se confía en el contenido del repositorio. La alternativa es que el administrador/cuenta propietaria cambie el ownership de la carpeta al usuario que ejecuta Git.

2. **Definir el piloto RAG:** elegir una fuente/corpus real, consultas representativas, workspace/equipos y el proveedor de identidad esperado. Sin esos datos no se puede cerrar si E5/384 sirve ni comprobar permisos de extremo a extremo.
3. **Ejecutar validación controlada:** con corpus y entorno elegidos, correr las integraciones PostgreSQL/embeddings y establecer si pasan a un job CI programado. Medir calidad de citas, recall, latencia y costo antes de fijar modelo/dimensión.
4. **Conectar identidad real:** implementar `BearerIdentityResolver` para el IdP elegido y verificar aislamiento multiusuario/workspace.
5. **Decidir transporte MCP de RAG:** HTTP ya cubre conocimiento/contexto; añadir MCP sólo si el piloto requiere que agentes consuman directamente herramientas documentales.
6. **Cerrar higiene local:** resolver los tres fallos de formato de archivos de instrucciones y diagnosticar por qué lint tarda/no termina en el entorno local.

### Siguiente punto de trabajo recomendado

Después de recuperar Git, acordar el alcance del piloto RAG (fuente, IdP y conjunto de consultas). Esa decisión desbloquea una tarea de código verificable y evita fijar el embedding o el transporte sobre datos hipotéticos. Si no hay un piloto corporativo disponible todavía, el siguiente trabajo autónomo es dejar estable la comprobación local de lint/formato y ejecutar los smokes de paquete/MCP que el workflow ya define.

## Cambios de documentación conciliados

- `implementation-plan.md` distingue MCP de Agent Memory de HTTP para RAG y elimina pendientes que el código ya satisface.
- El reporte anterior de madurez se sustituye por este estado fechado y por la cola de continuación; las cifras comparativas y pendientes históricas no se tratan como evidencia vigente.
