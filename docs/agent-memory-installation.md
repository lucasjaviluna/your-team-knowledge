# Instalación, configuración y uso desde un repositorio de trabajo

Esta guía instala Agent Memory nativo en un checkout y lo registra como un
servidor MCP local para Codex u otro host compatible con `stdio`. La base de
datos queda dentro del repositorio y no requiere red durante el uso diario.

## Requisitos

- Windows x64 o Linux x64.
- Un binario aprobado de `ytk-memory` para la plataforma.
- Permiso de escritura en el checkout.
- Un host MCP que pueda iniciar procesos por `stdio`.

No se necesita Node.js, npm, Docker, PostgreSQL ni una cuenta externa para la
memoria local.

## 1. Obtener el binario

Ubicá el binario en un directorio incluido en `PATH` y comprobá:

```text
ytk-memory --version
```

Verificá el checksum y la firma antes de instalar. Con los cuatro archivos del
release aprobado (`.tar.gz`/`.zip`, `.manifest.json`, `.sig` y `.pub`), ejecutá:

```text
ytk-memory release verify --artifact ytk-memory_0.1.0_windows_amd64.zip \
  --manifest ytk-memory_0.1.0_windows_amd64.zip.manifest.json \
  --signature ytk-memory_0.1.0_windows_amd64.zip.sig \
  --public-key ytk-memory_0.1.0_windows_amd64.zip.pub
```

El archivo `.pub` debe coincidir con la clave pública publicada por el canal
aprobado; no aceptes una clave nueva sólo porque la firma local valida.

## 2. Preparar el repositorio

Desde la raíz del repositorio de trabajo, revisá primero el cambio:

```text
ytk-memory setup codex --dry-run
```

La vista previa resume el proyecto y enumera los archivos que se crearían,
actualizarían o eliminarían. Usá `--json` para conservar la salida estructurada
en automatizaciones.

La salida estructurada enumera los archivos administrados y las acciones
previstas. Cuando el plan sea correcto, aplicalo:

```text
ytk-memory setup codex
```

El comando crea o actualiza únicamente sus bloques administrados en:

- `.ytk-memory.json`: proyecto, ruta de base y área opcional.
- `.ytk-memory/ytk-memory.sqlite`: base SQLite local.
- `.ytk-memory/YTK-MEMORY.md`: instrucciones portables.
- `.ytk-memory/mcp.json`: manifiesto MCP portable si se usa `--portable`.
- `AGENTS.md` y `.agents/skills/ytk-memory/SKILL.md`: instrucciones locales.
- `CODEX_HOME/config.toml`: registro MCP global de Codex, sin proyecto ni base
  fijados.

Para una configuración portable adicional:

```text
ytk-memory setup codex --portable
```

La instalación es repetible. Si encuentra un archivo existente sin el marcador
administrado o una definición conflictiva, se detiene y pide resolver la
colisión manualmente.

El registro MCP global arranca el binario en el proyecto abierto por Codex. El
servidor sólo opera si encuentra `.ytk-memory.json` en ese proyecto o uno de
sus directorios padre; así un proyecto sin setup local no crea ni usa memoria.

### Claude Code

Para registrar el mismo servidor como MCP por proyecto de Claude Code:

```text
ytk-memory setup claude --dry-run
ytk-memory setup claude
ytk-memory doctor --host claude
```

El comando conserva servidores ajenos de `.mcp.json`, registra solamente
`mcpServers.ytk-memory` con su marcador de propiedad y añade un bloque
administrado a `CLAUDE.md`. Al abrir el proyecto, aprobá el servidor MCP cuando
Claude Code lo solicite. La desinstalación es igualmente acotada:

```text
ytk-memory uninstall claude
```

No borra `.ytk-memory/ytk-memory.sqlite`, `.ytk-memory.json` ni entradas MCP
que no pertenezcan a Agent Memory.

### Pi

Pi carga MCPs de proyecto desde `.pi/mcp.json` sólo después de confiar en el
proyecto. Para configurar Agent Memory:

```text
ytk-memory setup pi --dry-run
ytk-memory setup pi
ytk-memory doctor --host pi
```

El instalador conserva los demás servidores de `.pi/mcp.json`, añade sólo
`mcpServers.ytk-memory` con una descripción de propiedad y agrega un bloque
administrado a `AGENTS.md`, que Pi descubre como contexto de proyecto. Luego
confiá el proyecto en Pi y ejecutá `/reload` o reiniciá la sesión. Para retirar
la integración sin borrar memoria ni servidores ajenos:

```text
ytk-memory uninstall pi
```

## 3. Verificar la instalación

Ejecutá:

```text
ytk-memory doctor
```

La salida legible muestra `Agent Memory · Todo en orden`, una base SQLite
legible y el registro MCP disponible para el proyecto actual. Para comprobar el
campo estructurado `"healthy": true`, ejecutá `ytk-memory doctor --json`.
Si la base no existe, ejecutá el setup nuevamente o restaurá un backup válido.

También podés comprobar explícitamente el proyecto y el área:

```text
ytk-memory doctor --project mi-repositorio --area plataforma
```

El proceso MCP resuelve el proyecto y la base desde `.ytk-memory.json` del
proyecto abierto. Cada proceso genera un owner de sesión propio; una sesión no
puede ser cerrada por otro proceso o por otro proyecto.

## 4. Uso por parte del agente

Después de reiniciar o abrir una sesión nueva en el host MCP, el agente sigue
este ciclo:

1. inicia una sesión con `memory_session_start`;
2. busca contexto relacionado antes de tomar una decisión;
3. guarda decisiones, descubrimientos, patrones o preferencias reutilizables;
4. actualiza un tema mediante `subjectKey` cuando el conocimiento evoluciona;
5. finaliza con `memory_session_finish` y un resumen conciso.

No guardes contraseñas, tokens, credenciales, secretos, transcripciones
completas ni información personal innecesaria.

## 5. Mantenimiento

Crear un backup consistente:

```text
ytk-memory backup --to .ytk-memory/backup-2026-10-21.sqlite
```

Preparar una actualización de esquema, siempre con backup:

```text
ytk-memory upgrade --backup-to .ytk-memory/pre-upgrade.sqlite
```

Restaurar una copia requiere confirmación y otra copia de seguridad de la base
actual:

```text
ytk-memory rollback \
  --from .ytk-memory/pre-upgrade.sqlite \
  --backup-current-to .ytk-memory/current.sqlite \
  --confirm
```

Los destinos existentes se rechazan por defecto. Para reemplazar uno de forma
explícita agregá `--overwrite` cuando el comando lo permita.

`setup`, `backup`, `upgrade` y `rollback` muestran un resumen legible al
ejecutarse en una terminal. Agregá `--json` para obtener el resultado
estructurado en automatizaciones.

## 6. Desinstalar la integración

Para retirar solo la configuración administrada y conservar la base:

```text
ytk-memory uninstall codex
```

La desinstalación también admite `--dry-run`. Elimina los bloques locales de
`AGENTS.md` y la skill local, pero conserva el registro MCP global para otros
proyectos. En una terminal pregunta si también debe quitar ese registro; para
automatizaciones usá `--remove-global-mcp`. No elimina automáticamente la base
SQLite ni los backups; archivá o eliminá esos archivos según la política del
repositorio.

## Archivos y responsabilidades

| Archivo                              | Propósito                                         |
| ------------------------------------ | ------------------------------------------------- |
| `.ytk-memory.json`                   | Identidad del proyecto, base y área por defecto.  |
| `.ytk-memory/ytk-memory.sqlite`      | Sesiones, memorias, relaciones y lifecycle.       |
| `CODEX_HOME/config.toml`             | Registro MCP global administrado para Codex.      |
| `AGENTS.md`                          | Instrucciones locales del agente.                 |
| `.agents/skills/ytk-memory/SKILL.md` | Procedimiento operativo de memoria.               |
| `.ytk-memory/mcp.json`               | Configuración portable opcional para otros hosts. |
| `.mcp.json`                           | Registro MCP por proyecto administrado para Claude Code. |
| `CLAUDE.md`                           | Instrucciones locales administradas para Claude Code. |
| `.pi/mcp.json`                        | Registro MCP por proyecto administrado para Pi. |

## Resolución de problemas

- `healthy: false` con base ausente: ejecutá `setup codex` o restaurá el backup.
- Registro MCP inválido: ejecutá `setup codex --dry-run`, revisá la colisión y
  aplicá el cambio después de conservar la configuración ajena.
- El agente no ve herramientas: reiniciá el host MCP después de modificar la
  configuración y comprobá que el binario esté en `PATH`.
- Un backup ya existe: elegí otro destino o usá `--overwrite` de forma
  explícita.
- Una sesión no puede cerrarse: debe hacerlo el mismo proceso MCP que la creó,
  dentro del mismo proyecto.
