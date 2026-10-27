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

Claude Code dispone de una integración idempotente por proyecto:

```text
ytk-memory setup claude --dry-run
ytk-memory setup claude
ytk-memory doctor --host claude --json
```

El setup conserva los demás servidores de `.mcp.json`, añade sólo el servidor
administrado `ytk-memory` bajo `mcpServers` y agrega instrucciones propias a
`CLAUDE.md`. Claude Code pide al usuario aprobar servidores de proyecto antes
de usarlos. Para retirar sólo esta integración, sin borrar la base local:

```text
ytk-memory uninstall claude
```

Pi usa su configuración MCP local en `.pi/mcp.json` después de que el proyecto
sea confiado. La integración se instala y verifica así:

```text
ytk-memory setup pi --dry-run
ytk-memory setup pi
ytk-memory doctor --host pi --json
```

El setup conserva otros servidores de `.pi/mcp.json`, registra sólo
`mcpServers.ytk-memory` y añade un bloque propio a `AGENTS.md`. Tras aprobar la
confianza del proyecto en Pi, ejecutá `/reload` o reiniciá Pi. Para retirarlo:

```text
ytk-memory uninstall pi
```

OpenCode usa servidores locales `stdio` dentro del objeto `mcp` de
`opencode.json` o `opencode.jsonc`:

```text
ytk-memory setup opencode --dry-run
ytk-memory setup opencode
ytk-memory doctor --host opencode --json
```

El adaptador conserva el resto de la configuración, añade instrucciones
administradas a `AGENTS.md` y permite retirar sólo su entrada:

```text
ytk-memory uninstall opencode
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
| `memory_list`           | Lista memorias activas y vigentes del proyecto sin requerir consulta. Sólo lectura. |
| `memory_timeline`       | Lista registros del proyecto por su última actualización conocida, incluidos estados históricos. Sólo lectura. |
| `memory_get`            | Recupera una memoria por ID. Sólo lectura y sin revelar otros proyectos. |
| `memory_save`           | Crea o actualiza memoria; `subjectKey` habilita idempotencia.            |
| `memory_session_finish` | Cierra la sesión y opcionalmente guarda su resumen.                      |
| `memory_review_list`    | Lista memorias vigentes pendientes de revisión.                           |
| `memory_review_complete`| Completa una revisión y agenda la siguiente.                              |
| `memory_correct`         | Crea una versión corregida y conserva la relación con la anterior.        |
| `memory_relations`       | Consulta memorias relacionadas y su historial de versiones.               |
| `memory_consolidation_preview` | Muestra el resumen propuesto y las fuentes, sin escribir ni archivar. |
| `memory_consolidate`     | Aplica una consolidación revisada sólo con `confirm: true`.                |

Las respuestas usan contenido JSON y `structuredContent`. Los diagnósticos van
a `stderr`; `stdout` queda reservado al protocolo MCP.

`memory_session_start` sin argumentos devuelve hasta 8 memorias activas dentro
de un presupuesto total de 2400 caracteres para títulos y contenido. Prioriza
etiquetas `priority:critical` y `priority:high`, luego resúmenes de sesión recientes y
memorias durables recientes. Se excluyen entradas expiradas, archivadas, futuras
o pendientes de revisión. `limit` y `maxChars` permiten ajustar el briefing
(1-100 y 100-20000). Un `query` solicita búsqueda dirigida en lugar del
briefing. El proyecto y el área configurados siguen limitando los resultados.

`memory_list` sirve para inspeccionar memorias actuales cuando no hay una
consulta concreta. Devuelve hasta 20 entradas activas, vigentes y visibles en
el área del proyecto por defecto; `limit` (1-100) y `maxChars` (100-20000)
ajustan cantidad y presupuesto total de texto. Para preguntas concretas,
`memory_search` sigue siendo la opción preferida.

`memory_timeline` presenta hasta 50 registros por defecto, del más actualizado
al más antiguo. Acepta `since` inclusivo y `until` exclusivo en RFC3339, además
de `limit` y `maxChars`. `activityAt` significa la última actualización
registrada de la fila; la base no conserva cada transición de lifecycle como
evento, por lo que el timeline no reconstruye cambios intermedios que no estén
registrados.

`memory_review_list` devuelve memorias activas, vigentes y con la fecha de
revisión vencida. `memory_review_complete` exige que la memoria esté vencida y
reciba una próxima fecha RFC3339 futura. `memory_correct` conserva la versión
anterior como `superseded`, crea una revisión activa y registra la relación
`supersedes` en una transacción; el título o contenido omitido se conserva.
`memory_relations` devuelve las entradas relacionadas dentro del mismo proyecto.

Para resolver una contradicción, el agente primero consulta
`memory_relations` de las memorias candidatas y luego llama a
`memory_consolidation_preview`. La vista previa devuelve las fuentes, el
contenido exacto del resumen, los posibles archivos y un resumen existente que
se reutilizaría, sin alterar la base. `memory_consolidate` rechaza la solicitud
si `confirm` no es `true`; conserva las fuentes por defecto y sólo las archiva
cuando `archiveSources: true` fue revisado y confirmado. Para elegir una sola
versión canónica sin fusionar contenido se usa `memory_correct`, que mantiene
la versión anterior y su relación `supersedes`.

## Operación y recuperación

```text
ytk-memory doctor --json
ytk-memory backup --to .ytk-memory/backup.sqlite
ytk-memory upgrade --backup-to .ytk-memory/pre-upgrade.sqlite
ytk-memory rollback --from .ytk-memory/pre-upgrade.sqlite --backup-current-to .ytk-memory/pre-rollback.sqlite --confirm
```

`upgrade` exige una copia previa. `rollback` requiere confirmación explícita y
una copia verificable de la base actual antes de reemplazarla.
