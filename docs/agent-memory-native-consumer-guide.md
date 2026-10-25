# Guía de consumo de Agent Memory nativo

Esta guía describe el flujo soportado para instalar y usar el binario nativo
desde un repositorio de trabajo.

## Qué necesita un repositorio consumidor

- Un binario `ytk-memory` para su plataforma y agregado al `PATH`.
- Permiso de escritura en el checkout para crear `.ytk-memory/`, actualizar la
  configuración MCP e instalar instrucciones administradas.
- Un host compatible con MCP por `stdio`. La primera integración automatizada
  es Codex.
- Espacio local para la base SQLite y backups.
- Un mecanismo aprobado para distribuir o actualizar el binario. El uso diario
  no requiere red.

No necesita Node.js, npm, Docker, PostgreSQL ni credenciales corporativas para
Agent Memory local.

## Plataformas iniciales

| Plataforma  | Estado objetivo inicial                               |
| ----------- | ----------------------------------------------------- |
| Windows x64 | Soportada y validada nativamente.                     |
| Linux x64   | Soportada y validada nativamente.                     |
| macOS arm64 | Se incorpora después de contar con validación nativa. |

Cuando exista un canal de release, debe especificar las plataformas soportadas,
SHA-256, firma y versión mínima compatible del esquema SQLite.

## Instalar el binario

Obtené el binario aprobado para la plataforma y ubicalo en un directorio
incluido en `PATH`. Cuando exista un canal de release firmado, verificá el
checksum y la firma según su procedimiento. Comprobá la versión:

```powershell
ytk-memory --version
```

El binario no se actualiza solo. La actualización debe preservar un backup y
usar el comando `upgrade` del proyecto.

## Activar memoria en un repositorio Codex

Desde la raíz del repositorio:

```powershell
ytk-memory setup codex
ytk-memory doctor
```

`setup` resuelve el proyecto, crea la configuración y la base local, registra
una vez el servidor MCP genérico en `CODEX_HOME/config.toml` y agrega
instrucciones locales administradas. Antes de una instalación real se puede
revisar el cambio:

```powershell
ytk-memory setup codex --dry-run
```

Después de `doctor`, confiá el proyecto en Codex si corresponde y abrí una
nueva sesión. La instalación debe ser repetible: ejecutarla de nuevo actualiza
solamente sus propios bloques.

## Uso diario

No hace falta ejecutar comandos de memoria en cada tarea. El protocolo
instalado indica al agente que debe:

1. abrir una sesión y recuperar contexto antes de decidir;
2. guardar decisiones, hallazgos, bugs resueltos o convenciones reutilizables;
3. no guardar secretos ni transcripciones completas;
4. cerrar la sesión con un resumen conciso.

La memoria se conserva localmente en:

```text
<repositorio>/.ytk-memory/ytk-memory.sqlite
```

No se comparte ni sincroniza automáticamente entre personas o repositorios.

## Mantenimiento

```powershell
ytk-memory doctor
ytk-memory backup --to .ytk-memory/backup.sqlite
ytk-memory upgrade --backup-to .ytk-memory/pre-upgrade.sqlite
ytk-memory rollback --from .ytk-memory/pre-upgrade.sqlite --backup-current-to .ytk-memory/current.sqlite --confirm
```

`upgrade` exige un backup. `rollback` exige confirmación y preserva una copia
de la base actual antes de reemplazarla.

## Retirar la integración

```powershell
ytk-memory uninstall codex
```

El desinstalador retira las instrucciones locales administradas y conserva el
registro MCP global para otros proyectos. En una terminal ofrece eliminarlo;
en automatizaciones usá `--remove-global-mcp`. La base SQLite se conserva hasta
que la persona responsable la archive o elimine por separado.
