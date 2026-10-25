# Servidor MCP de Agent Memory

`ytk-memory` es el único servidor MCP de Agent Memory. Se ejecuta por `stdio`
y queda asociado a un único proyecto y base SQLite durante toda la vida del
proceso.

## Configuración

Desde la raíz del repositorio consumidor:

```text
ytk-memory setup codex
ytk-memory doctor --json
```

Para otro host MCP compatible con `stdio`, generá la configuración portable:

```text
ytk-memory setup codex --portable
```

El archivo `.ytk-memory/mcp.json` contiene el comando y los argumentos para
registrar en el host. También se puede configurar directamente:

```json
{
  "command": "ytk-memory",
  "args": ["mcp", "--project", "my-project", "--database", ".ytk-memory/ytk-memory.sqlite"]
}
```

## Herramientas

| Herramienta             | Efecto                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `memory_session_start`  | Inicia una sesión y opcionalmente recupera contexto.                     |
| `memory_search`         | Busca memoria del proyecto configurado. Sólo lectura.                    |
| `memory_get`            | Recupera una memoria por ID. Sólo lectura y sin revelar otros proyectos. |
| `memory_save`           | Crea o actualiza memoria; `subjectKey` habilita idempotencia.            |
| `memory_session_finish` | Cierra la sesión y opcionalmente guarda su resumen.                      |

Las respuestas usan contenido JSON y `structuredContent`. Los diagnósticos van
a `stderr`; `stdout` queda reservado al protocolo MCP.

## Operación y recuperación

```text
ytk-memory doctor --json
ytk-memory backup --to .ytk-memory/backup.sqlite
ytk-memory upgrade --backup-to .ytk-memory/pre-upgrade.sqlite
ytk-memory rollback --from .ytk-memory/pre-upgrade.sqlite --backup-current-to .ytk-memory/pre-rollback.sqlite --confirm
```

`upgrade` exige una copia previa. `rollback` requiere confirmación explícita y
una copia verificable de la base actual antes de reemplazarla.
