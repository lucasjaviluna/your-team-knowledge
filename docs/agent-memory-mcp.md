# Servidor MCP de Agent Memory

El paquete incluye un servidor MCP local por `stdio` sobre el contrato provider-neutral. No contiene reglas específicas de un proveedor de IA: cualquier host compatible con MCP puede iniciarlo como proceso hijo.

## Instalación y configuración de agentes

El paquete es privado por ahora y se instala en un proyecto destino desde el
tarball interno. Desde el checkout de esta plataforma ejecutá:

```text
npm run release:internal
```

En el proyecto destino instalá el archivo generado en `artifacts/`:

```text
npm install --save-dev "<ruta-al-repositorio>/artifacts/corporate-knowledge-platform-0.1.0.tgz"
```

Se requiere Node.js 22 o posterior. Los comandos siguientes se ejecutan desde
la raíz del proyecto destino y pueden invocarse con `npx` porque el paquete
instala sus binarios en `node_modules/.bin`.

Después de instalar el paquete, configurá Codex desde el checkout:

```text
ytk-memory-init --agent codex --area backend
```

El comando crea o actualiza `.ytk-memory.json` con el identificador estable,
la base SQLite y el área predeterminada. Genera `.ytk-memory/YTK-MEMORY.md`
con el protocolo operativo completo como fallback portable. Con instrucciones
locales, el adaptador Codex instala además `.agents/skills/ytk-memory/SKILL.md`
con el mismo protocolo y añade a `AGENTS.md` sólo el activador de la skill. Usa
`node` y rutas absolutas al ejecutable MCP y a SQLite, con el proyecto
explícito. Una segunda ejecución actualiza esos archivos sin duplicarlos. Codex
carga la configuración local sólo si el proyecto es de confianza; iniciá una
nueva sesión después de instalar.

Por defecto, el bloque de instrucciones se agrega al `AGENTS.md` del
repositorio. En una terminal interactiva, el instalador permite elegir entre
ese alcance, el perfil global de Codex o ambos. Para automatizaciones indicá el
alcance explícitamente:

```text
ytk-memory-init --agent codex --instructions local
ytk-memory-init --agent codex --instructions global
ytk-memory-init --agent codex --instructions both
```

El bloque global se escribe en `~/.codex/AGENTS.md` (o en `CODEX_HOME` si está
definido) y sólo indica usar Agent Memory cuando las herramientas estén
disponibles. No contiene un proyecto ni rutas del checkout. El bloque local
mantiene el protocolo y el proyecto concreto. La configuración MCP se mantiene
en el repositorio. `--instructions` sólo cambia el destino de `AGENTS.md`; no
mueve el registro MCP a la configuración global de Codex. `.ytk-memory/mcp.json` se genera sólo sin adaptador
específico o cuando se indica `--portable`.

Usá `--dry-run` para ver qué archivos cambiarían y
`ytk-memory-init --uninstall --agent codex` para retirar sólo los
bloques locales del adaptador. Agregá `--instructions global` o
`--instructions both` para retirar el bloque global correspondiente. El
proyecto y los archivos portables permanecen para otros clientes. `--force`
permite reemplazar archivos portables preexistentes que no tengan la marca del
instalador. Sin `--agent`, el comando conserva el flujo portable para hosts
MCP que se configuran manualmente.

Para verificar una instalación sin modificar archivos:

```text
npx ytk-memory-init --agent codex --area backend --dry-run --no-prompt
```

La salida enumera los archivos que crearía o actualizaría y aclara que el modo
dry-run no escribe ningún archivo. Después de una instalación real, confiá el
proyecto en Codex si corresponde y abrí una nueva sesión para cargar la
configuración MCP.

Los demás hosts MCP pueden registrar el comando y los argumentos de
`.ytk-memory/mcp.json` en su propia configuración. El instalador separa la
resolución común del proyecto y la base de los adaptadores de host.

## Inicio

El proyecto se resuelve, en orden, desde `--project`, la variable de entorno,
`.ytk-memory.json`, el remoto Git y el nombre del directorio. Una vez resuelto
queda fijo durante toda la vida del proceso:

```text
ytk-memory-mcp --project my-project --database .ytk-memory/ytk-memory.sqlite --area backend
```

También se aceptan las variables `YTK_MEMORY_PROJECT_ID`, `YTK_MEMORY_DATABASE` y `YTK_MEMORY_AREA`. Si no se indica una base, se usa `.ytk-memory/ytk-memory.sqlite` en la raíz de configuración o en el directorio de trabajo. Cada proceso recibe un propietario de sesión aleatorio: otro proceso no puede terminar la sesión ni asociar escrituras a ella, incluso dentro del mismo proyecto.

Configuración genérica de un host MCP:

```json
{
  "command": "ytk-memory-mcp",
  "args": [
    "--project",
    "my-project",
    "--database",
    ".ytk-memory/ytk-memory.sqlite"
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

`ytk-memory-admin doctor` informa el alcance resuelto, la versión de Node y el lifecycle de la base; no crea una base ausente. Para realizar operaciones de recuperación:

```text
ytk-memory-admin backup --to .ytk-memory/backup.sqlite
ytk-memory-admin upgrade --backup-to .ytk-memory/pre-upgrade.sqlite
ytk-memory-admin rollback --from .ytk-memory/pre-upgrade.sqlite --backup-current-to .ytk-memory/pre-rollback.sqlite --confirm
```

`upgrade` abre la base con la migración compatible y exige una copia previa. `rollback` exige confirmación y una copia verificable de la base actual antes de reemplazarla. `npm run release:internal` genera el tarball privado en `artifacts/`; CI lo valida y publica como artefacto en Windows y Linux.
