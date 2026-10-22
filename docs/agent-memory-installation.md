# Instalación, configuración y uso desde un repositorio de trabajo

Esta guía instala Agent Memory nativo en un checkout y lo registra como un
servidor MCP local para Codex u otro host compatible con `stdio`. La base de
datos queda dentro del repositorio y no requiere red durante el uso diario.

## Requisitos

- Windows x64 o Linux x64.
- Un release aprobado de `ytk-memory` para la plataforma.
- Permiso de escritura en el checkout.
- Un host MCP que pueda iniciar procesos por `stdio`.

No se necesita Node.js, npm, Docker, PostgreSQL ni una cuenta externa para la
memoria local.

## 1. Descargar y verificar el release

Cada release contiene un archivo comprimido, un manifiesto, un archivo de
checksums, una firma Ed25519 y una clave pública. Usá siempre el conjunto de
archivos de la misma versión.

En Windows:

```powershell
Expand-Archive .\ytk-memory_0.1.0_windows_amd64.zip -DestinationPath $env:LOCALAPPDATA\ytk-memory\0.1.0
Get-FileHash .\ytk-memory_0.1.0_windows_amd64.zip -Algorithm SHA256
Get-Content .\ytk-memory_0.1.0_checksums.txt
```

En Linux:

```bash
mkdir -p "$HOME/.local/ytk-memory/0.1.0"
tar -xzf ytk-memory_0.1.0_linux_amd64.tar.gz -C "$HOME/.local/ytk-memory/0.1.0"
sha256sum -c ytk-memory_0.1.0_checksums.txt
```

Verificá la firma con la herramienta aprobada por el canal interno. El
manifiesto debe coincidir con la plataforma, arquitectura, versión y hash del
artefacto. Agregá el directorio extraído al `PATH` y comprobá:

```text
ytk-memory --version
```

## 2. Preparar el repositorio

Desde la raíz del repositorio de trabajo, revisá primero el cambio:

```text
ytk-memory setup codex --instructions local --dry-run
```

La salida JSON enumera los archivos administrados y las acciones previstas.
Cuando el plan sea correcto, aplicalo:

```text
ytk-memory setup codex --instructions local
```

El comando crea o actualiza únicamente sus bloques administrados en:

- `.ytk-memory.json`: proyecto, ruta de base y área opcional.
- `.ytk-memory/ytk-memory.sqlite`: base SQLite local.
- `.ytk-memory/YTK-MEMORY.md`: instrucciones portables.
- `.ytk-memory/mcp.json`: manifiesto MCP portable si se usa `--portable`.
- `AGENTS.md` y `.agents/skills/ytk-memory/SKILL.md`: instrucciones locales.
- `.codex/config.toml`: registro MCP local de Codex.

Para una configuración portable adicional:

```text
ytk-memory setup codex --instructions local --portable
```

Para instalar las instrucciones locales y globales:

```text
ytk-memory setup codex --instructions both
```

La instalación es repetible. Si encuentra un archivo existente sin el marcador
administrado o una definición conflictiva, se detiene y pide resolver la
colisión manualmente.

## 3. Verificar la instalación

Ejecutá:

```text
ytk-memory doctor
```

Una instalación sana informa `"healthy": true`, una base SQLite legible y el
registro MCP disponible para el proyecto actual. Si la base no existe, ejecutá
el setup nuevamente o restaurá un backup válido.

También podés comprobar explícitamente el proyecto y el área:

```text
ytk-memory doctor --project mi-repositorio --area plataforma
```

El proceso MCP recibe el proyecto y la base de forma explícita. Cada proceso
genera un owner de sesión propio; una sesión no puede ser cerrada por otro
proceso o por otro proyecto.

## 4. Uso por parte del agente

Después de reiniciar o abrir una sesión nueva en el host MCP, el agente sigue
este ciclo:

1. inicia una sesión con `memory_session_start`;
2. busca contexto relacionado antes de tomar una decisión;
3. guarda decisiones, descubrimientos, patrones o preferencias reutilizables;
4. actualiza un tema mediante `topicKey` cuando el conocimiento evoluciona;
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

## 6. Desinstalar la integración

Para retirar solo la configuración administrada y conservar la base:

```text
ytk-memory uninstall codex --instructions local
```

La desinstalación también admite `--dry-run`. No elimina automáticamente la
base SQLite ni los backups; archivá o eliminá esos archivos según la política
del repositorio.

## Archivos y responsabilidades

| Archivo                              | Propósito                                         |
| ------------------------------------ | ------------------------------------------------- |
| `.ytk-memory.json`                   | Identidad del proyecto, base y área por defecto.  |
| `.ytk-memory/ytk-memory.sqlite`      | Sesiones, memorias, relaciones y lifecycle.       |
| `.codex/config.toml`                 | Registro MCP administrado para Codex.             |
| `AGENTS.md`                          | Instrucciones locales del agente.                 |
| `.agents/skills/ytk-memory/SKILL.md` | Procedimiento operativo de memoria.               |
| `.ytk-memory/mcp.json`               | Configuración portable opcional para otros hosts. |

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
