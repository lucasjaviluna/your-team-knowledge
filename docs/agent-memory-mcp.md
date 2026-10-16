# Servidor MCP de Agent Memory

El paquete incluye un servidor MCP local por `stdio` sobre el contrato provider-neutral. No contiene reglas específicas de un proveedor de IA: cualquier host compatible con MCP puede iniciarlo como proceso hijo.

## Instalación y configuración de agentes

Después de instalar el paquete, prepará cada checkout una sola vez:

```text
team-knowledge-memory-init --area backend
```

El comando crea o actualiza `.team-memory.json` con el identificador estable,
la base SQLite y el área predeterminada; además genera `.team-memory/mcp.json`
con una configuración MCP portable y `.team-memory/AGENT-MEMORY.md` con el
protocolo que pueden incorporar los distintos agentes. No reemplaza los dos
archivos generados si ya existen, salvo con `--force`.

Cada host MCP debe registrar el comando y los argumentos de `mcp.json` en su
propia configuración. El archivo no incluye el proyecto porque el servidor lo
resuelve de manera segura desde el checkout.

## Inicio

El proyecto se resuelve, en orden, desde `--project`, la variable de entorno,
`.team-memory.json`, el remoto Git y el nombre del directorio. Una vez resuelto
queda fijo durante toda la vida del proceso:

```text
team-knowledge-memory-mcp --project my-project --database .team-memory/agent-memory.sqlite --area backend
```

También se aceptan las variables `TEAM_KNOWLEDGE_PROJECT_ID`, `TEAM_KNOWLEDGE_MEMORY_DATABASE` y `TEAM_KNOWLEDGE_AREA`. Si no se indica una base, se usa `.team-memory/agent-memory.sqlite` en la raíz de configuración o en el directorio de trabajo. Cada proceso recibe un propietario de sesión aleatorio: otro proceso no puede terminar la sesión ni asociar escrituras a ella, incluso dentro del mismo proyecto.

Configuración genérica de un host MCP:

```json
{
  "command": "team-knowledge-memory-mcp",
  "args": [
    "--project",
    "my-project",
    "--database",
    ".team-memory/agent-memory.sqlite"
  ]
}
```

## Herramientas

| Herramienta             | Efecto                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `memory_session_start`  | Inicia una sesión y opcionalmente recupera contexto.                     |
| `memory_search`         | Busca memoria del proyecto configurado. Sólo lectura.                    |
| `memory_get`            | Recupera una memoria por ID. Sólo lectura y sin revelar otros proyectos. |
| `memory_save`           | Crea o actualiza memoria; `topicKey` habilita idempotencia.              |
| `memory_session_finish` | Cierra la sesión y opcionalmente guarda su resumen.                      |

Las herramientas validan tamaños, tipos y cardinalidades antes de llegar al dominio. Las respuestas exitosas incluyen texto JSON y `structuredContent`; los fallos de operación se devuelven con `isError`. El servidor reserva `stdout` para MCP y emite errores de arranque por `stderr`.

## Verificación

`npm run test:mcp-smoke` compila el paquete, arranca el binario mediante el cliente MCP oficial y verifica descubrimiento, sesión, guardado, búsqueda, lectura, resumen y aislamiento entre dos proyectos sobre la misma base.

`npm run test:agent-memory-e2e` valida el recorrido completo con dos consumidores MCP independientes: el segundo recupera y continúa el trabajo del primero; no puede apropiarse de su sesión; y una reanudación posterior recupera el resumen creado tras compactar ambas memorias.

## Operación y recuperación

`team-knowledge-memory-admin doctor` informa el alcance resuelto, la versión de Node y el lifecycle de la base; no crea una base ausente. Para realizar operaciones de recuperación:

```text
team-knowledge-memory-admin backup --to .team-memory/backup.sqlite
team-knowledge-memory-admin upgrade --backup-to .team-memory/pre-upgrade.sqlite
team-knowledge-memory-admin rollback --from .team-memory/pre-upgrade.sqlite --backup-current-to .team-memory/pre-rollback.sqlite --confirm
```

`upgrade` abre la base con la migración compatible y exige una copia previa. `rollback` exige confirmación y una copia verificable de la base actual antes de reemplazarla. `npm run release:internal` genera el tarball privado en `artifacts/`; CI lo valida y publica como artefacto en Windows y Linux.
