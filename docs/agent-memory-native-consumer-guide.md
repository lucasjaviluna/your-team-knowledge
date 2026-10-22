# Guía de consumo de Agent Memory nativo

Esta guía describe el flujo soportado para instalar y usar el binario nativo
desde un repositorio de trabajo.

## Qué necesita un repositorio consumidor

- Un binario `ytk-memory` firmado para su plataforma y agregado al `PATH`.
- Permiso de escritura en el checkout para crear `.ytk-memory/`, actualizar la
  configuración MCP e instalar instrucciones administradas.
- Un host compatible con MCP por `stdio`. La primera integración automatizada
  es Codex.
- Espacio local para la base SQLite y backups.
- Acceso al canal interno de releases solo para descargar o actualizar el
  binario. El uso diario no requiere red.

No necesita Node.js, npm, Docker, PostgreSQL ni credenciales corporativas para
Agent Memory local.

## Plataformas iniciales

| Plataforma  | Estado objetivo inicial                               |
| ----------- | ----------------------------------------------------- |
| Windows x64 | Soportada y validada nativamente.                     |
| Linux x64   | Soportada y validada nativamente.                     |
| macOS arm64 | Se incorpora después de contar con validación nativa. |

Cada release especificará sus plataformas soportadas, SHA-256, firma y versión
mínima compatible del esquema SQLite.

## Instalar el binario

Descargá el artefacto de la versión aprobada desde el canal interno. Junto al
paquete deben estar el manifiesto, el archivo de SHA-256, la firma `.sig` y la
clave pública del canal. Verificá el checksum y la firma según el procedimiento
de ese canal. Descomprimí el binario en un directorio incluido en `PATH` y
verificá:

```powershell
ytk-memory --version
```

En Windows, una verificación de checksum con PowerShell puede hacerse así:

```powershell
Get-FileHash .\ytk-memory_0.1.0_windows_amd64.zip -Algorithm SHA256
Get-Content .\ytk-memory_0.1.0_checksums.txt
```

El release de CI genera una firma efímera cuando no se configura una clave de
release. Para publicar un release confiable, el canal debe proporcionar una
clave Ed25519 estable y configurar `YTK_MEMORY_SIGNING_PRIVATE_KEY` únicamente
en el job protegido de publicación.

El binario no se actualiza solo. La actualización debe usar un release
verificado y el comando `upgrade` del proyecto.

## Activar memoria en un repositorio Codex

Desde la raíz del repositorio:

```powershell
ytk-memory setup codex --instructions local
ytk-memory doctor
```

`setup` resuelve el proyecto, crea la configuración y la base local, registra
el servidor MCP y agrega instrucciones administradas. Antes de una instalación
real se puede revisar el cambio:

```powershell
ytk-memory setup codex --instructions local --dry-run
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
ytk-memory uninstall codex --instructions local
```

El desinstalador retira la configuración e instrucciones administradas. La base
SQLite se conserva hasta que la persona responsable la archive o elimine por
separado.
