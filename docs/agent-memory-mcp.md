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
| `memory_session_start`  | Inicia una sesión y devuelve un briefing compacto; acepta una consulta para recuperación dirigida. |
| `memory_search`         | Busca memoria del proyecto configurado. Sólo lectura.                    |
| `memory_get`            | Recupera una memoria por ID. Sólo lectura y sin revelar otros proyectos. |
| `memory_save`           | Crea o actualiza memoria; `subjectKey` habilita idempotencia.            |
| `memory_session_finish` | Cierra la sesión y opcionalmente guarda su resumen.                      |
| `memory_review_list`    | Lista memorias vigentes pendientes de revisión.                           |
| `memory_review_complete`| Completa una revisión y agenda la siguiente.                              |
| `memory_correct`         | Crea una versión corregida y conserva la relación con la anterior.        |
| `memory_relations`       | Consulta memorias relacionadas y su historial de versiones.               |

Las respuestas usan contenido JSON y `structuredContent`. Los diagnósticos van
a `stderr`; `stdout` queda reservado al protocolo MCP.

`memory_session_start` sin argumentos devuelve hasta 8 memorias activas dentro
de un presupuesto total de 2400 caracteres para títulos y contenido. Prioriza
etiquetas `priority:critical` y `priority:high`, luego resúmenes de sesión recientes y
memorias durables recientes. Se excluyen entradas expiradas, archivadas, futuras
o pendientes de revisión. `limit` y `maxChars` permiten ajustar el briefing
(1-100 y 100-20000). Un `query` solicita búsqueda dirigida en lugar del
briefing. El proyecto y el área configurados siguen limitando los resultados.

`memory_review_list` devuelve memorias activas, vigentes y con la fecha de
revisión vencida. `memory_review_complete` exige que la memoria esté vencida y
reciba una próxima fecha RFC3339 futura. `memory_correct` conserva la versión
anterior como `superseded`, crea una revisión activa y registra la relación
`supersedes` en una transacción; el título o contenido omitido se conserva.
`memory_relations` devuelve las entradas relacionadas dentro del mismo proyecto.

## Operación y recuperación

```text
ytk-memory doctor --json
ytk-memory backup --to .ytk-memory/backup.sqlite
ytk-memory upgrade --backup-to .ytk-memory/pre-upgrade.sqlite
ytk-memory rollback --from .ytk-memory/pre-upgrade.sqlite --backup-current-to .ytk-memory/pre-rollback.sqlite --confirm
```

`upgrade` exige una copia previa. `rollback` requiere confirmación explícita y
una copia verificable de la base actual antes de reemplazarla.
