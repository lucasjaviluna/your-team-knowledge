# Integración con pi-harness

## Límite entre repositorios

La extensión nativa de Pi pertenece al repositorio `your-harness-v0`, porque depende de `ExtensionAPI`, `pi.registerTool`, el ciclo de vida de la TUI y la política de aprobación del harness. Este repositorio no debe importar el runtime de Pi ni registrar tools directamente.

Este proyecto es responsable de los contratos y adaptadores reutilizables: `KnowledgeHttpClient`, `PiHarnessKnowledgeAdapter` y `PiHarnessMemoryProvider`. La integración nativa en pi-harness debe consumirlos desde una dependencia npm, workspace package o ruta local durante desarrollo.

El paquete publica `dist/index.js` y sus declaraciones TypeScript mediante `main`, `types` y `exports`. Para validar el artefacto local se puede ejecutar `npm run build` seguido de `npm run pack:check`; pi-harness puede apuntar `memory.module` al `dist/index.js` generado o al módulo instalado.

El repositorio no contiene el código fuente de pi-harness, por lo que la integración se implementa como un adaptador de consumidor y no como una dependencia directa. `PiHarnessKnowledgeAdapter` recibe cualquier cliente compatible con `KnowledgeClient`; en producción se le inyecta `KnowledgeHttpClient`.

```ts
import {
  KnowledgeHttpClient,
  PiHarnessKnowledgeAdapter,
} from "@corporate-knowledge/platform";

const client = new KnowledgeHttpClient({
  baseUrl: process.env.KNOWLEDGE_API_URL!,
  getToken: async () => getPiHarnessServiceToken(),
});
const knowledge = new PiHarnessKnowledgeAdapter(client);

const tools = knowledge.toolDefinitions();
const result = await knowledge.searchCorporateKnowledge({
  workspaceId: "workspace-checkout",
  query: "¿Cómo se aprueba un despliegue?",
  limit: 5,
});
```

El adaptador conserva las citas devueltas por la API y no replica las reglas de permisos, ranking ni generación de embeddings. El token debe ser emitido por el proveedor de identidad corporativo; no se debe trasladar `API_TOKENS_JSON` fuera de desarrollo.

Cuando pi-harness esté disponible en el workspace, el siguiente paso será mapear `toolDefinitions()` a su registro nativo de herramientas y añadir una prueba de contrato contra su runtime.

## Memoria local

La referencia de pi-harness define un `MemoryProvider` con `isAvailable`, `search` y `store`. `PiHarnessMemoryProvider` implementa ese contrato sobre `MemoryService` y `SqliteAgentMemoryRepository`:

```ts
const provider = new PiHarnessMemoryProvider(memoryService);
const binding = {
  provider,
  context: { projectId: "workspace-checkout", area: "backend" },
};
```

El `projectId` del harness se mapea al `workspaceId` de Agent Memory. `idempotencyKey` se mapea a `subjectKey`, y las búsquedas respetan `limit` y `maxChars` antes de entregar contexto al agente.

El provider hereda las reglas de lifecycle de `MemoryService`: sólo entrega memorias activas y vigentes por defecto. Las memorias futuras, vencidas, archivadas o marcadas para revisión no se exponen en el recall normal; la gestión de revisión y retención permanece en la aplicación propietaria de la base SQLite.

Configuración mínima del consumidor:

```json
{
  "memory": {
    "enabled": true,
    "provider": "team-knowledge",
    "module": "../your-team-knowledge/dist/index.js",
    "database": ".harness/team-knowledge.sqlite",
    "projectId": "workspace-checkout",
    "defaultArea": "backend",
    "autoRecall": false,
    "allowWrites": true,
    "requireApproval": true
  }
}
```

La ruta de `module` se resuelve desde el directorio del proyecto consumidor. En instalaciones empaquetadas puede reemplazarse por el specifier del paquete instalado.

Para consumidores que sólo necesitan Agent Memory se recomienda el entrypoint mínimo:

```json
{
  "memory": {
    "module": "@corporate-knowledge/platform/memory"
  }
}
```

`@corporate-knowledge/platform/memory` expone únicamente `MemoryService`, `SqliteAgentMemoryRepository` y `PiHarnessMemoryProvider`; evita cargar el entrypoint completo de RAG durante el arranque. El paquete mantiene sólo `better-sqlite3` como dependencia obligatoria; `pg` y Transformers.js/ONNX son peer dependencies opcionales y sólo deben instalarse cuando se use RAG o el servidor corporativo.

Para el consumidor de memoria local:

```bash
npm install @corporate-knowledge/platform better-sqlite3
```

Para habilitar RAG/HTTP en el mismo paquete:

```bash
npm install @corporate-knowledge/platform better-sqlite3 pg @huggingface/transformers
```

## Estado de validación

- Validado contra el checkout real de `pi-harness` en el commit `25903a2`: el módulo compilado carga los exports esperados y el smoke test confirma escritura, recuperación y aislamiento por `projectId`.
- `your-team-knowledge` pasa typecheck, lint y la suite normal: 22 tests aprobados y 2 pruebas de integración omitidas por requerir servicios externos.
- El tarball `corporate-knowledge-platform-0.1.0.tgz` se genera correctamente. La instalación dentro del checkout temporal de `pi-harness` debe repetirse en un entorno limpio con dependencias completas; la primera prueba quedó afectada por un `node_modules` inconsistente y no se considera una validación concluyente del paquete instalado.
- En un checkout limpio de `pi-harness`, el tarball se instaló correctamente y el loader real cargó `@corporate-knowledge/platform/memory`. El smoke e2e confirmó escritura SQLite, recuperación y aislamiento por proyecto: `stored=true`, `hitCount=1`, `isolatedCount=0`.
- La suite específica del harness (`tests/memory-provider.test.ts`) pasa 5/5. El e2e general pasa el caso de manifest; otros dos casos se omiten cuando la instalación automática de consumidores supera el timeout del entorno.
- El repositorio incluye `npm run test:consumer`, que empaqueta la plataforma, la instala en un consumidor temporal limpio y verifica el flujo SQLite del subpath de memoria. La workflow `.github/workflows/ci.yml` ejecuta este smoke junto con build, calidad, suite y validación del paquete.
- `npm run package:check` valida el contrato de distribución antes de empaquetar: nombre, versión semver, archivos publicados, exports raíz/memoria y peer dependencies opcionales. El paquete continúa marcado como `private` mientras la distribución sea interna; retirar esa marca debe ser una decisión explícita antes de publicar en un registry.
- Para guardar una memoria y probar su recuperación ejecutá `npm run demo:agent-memory -- --project mi-proyecto --area backend --query "despliegue rollback" --title "Decisión de despliegue" --content "Usar despliegues graduales y validar el rollback antes de producción."`. El comando crea `.local/agent-memory.sqlite` y usa FTS5; admite `--database`, `--limit` y `--max-chars`.
- Si omitís `--title` y `--content`, el comando sólo busca y no modifica la base: `npm run demo:agent-memory -- --project mi-proyecto --area frontend --query "rutas guards"`. Esto evita que una segunda búsqueda reemplace la memoria con contenido de ejemplo.
- En Windows, el demo normaliza el escape `^` que puede introducir `npm run`/`cmd` al reenviar argumentos; el contenido persistido permanece sin esos caracteres.
- Esta prueba valida almacenamiento, recall y aislamiento por proyecto, pero todavía no invoca un modelo de lenguaje. El runtime real de pi-harness usa el mismo provider y agrega el ciclo de aprobación/configuración del consumidor.
- Agent Memory aplica una expansión léxica conservadora para singular/plural (`ruta`/`rutas`, `guard`/`guards`) y grupos de sinónimos configurables (`proteccion`/`protegen`, `deployment`/`despliegue`, `rollback`/`reversion`). La expansión conserva `AND` entre conceptos y no constituye stemming semántico ni retrieval vectorial.
- La compactación es opt-in: `MemoryService.compact()` crea un resumen determinista limitado por `maxChars`, mantiene relaciones hacia las fuentes y puede archivarlas con `archiveSources: true`. El provider de pi-harness no compacta automáticamente durante una búsqueda.
- Las relaciones se crean únicamente entre memorias existentes, activas y del mismo workspace; los tipos soportados son `related`, `supports`, `conflicts_with` y `supersedes`, y repetir un vínculo es idempotente. Al purgar una memoria archivada también se eliminan sus relaciones.
- El provider respeta las transiciones de lifecycle: una memoria archivada no se reactiva; las memorias `needs_review` pueden volver a activas y las `superseded` sólo pueden archivarse.
- Los consumidores que necesiten observabilidad pueden usar `MemoryService.transitionStatus()` y conectar un observer para recibir eventos estructurados `status_changed` con estado anterior, nuevo estado, motivo y timestamp.
- El observer también informa `expired_archived` y `purged`; las vistas previas de retención no emiten eventos de eliminación.
- Un consumidor puede usar `MemoryService.runRetention()` para previsualizar o ejecutar archivado y purga coordinados; la ejecución destructiva requiere `dryRun: false`.
- El proceso propietario de la base puede invocar `SqliteAgentMemoryRepository.backup(destinationFile)` para generar una copia consistente; la restauración se realiza abriendo esa copia como una nueva base y verificando el contenido antes de reemplazar el archivo activo.
- En una base SQLite compartida, `runRetention()` debe recibir el `workspaceId` del consumidor; `allWorkspaces: true` queda reservado para una operación administrativa explícita.
- El demo permite automatizar el flujo backup + retención con `--backup-to <archivo> --retention-purge-before <ISO>`; por defecto la retención sólo previsualiza. Para ejecutar el cambio se requiere `--retention-dry-run false`. El scope normal es el proyecto del demo; el global exige `--retention-all-workspaces true`.
- El smoke `npm run test:maintenance-smoke` ejerce ese flujo con una base temporal, confirma que el backup conserva la memoria y que la base activa purga sólo después de la ejecución explícita.
- El backup no sobrescribe destinos existentes por defecto; un reemplazo requiere `backup(destinationFile, { overwrite: true })` o `--backup-overwrite true` en el demo.
- `runRetention()` devuelve `metrics` con los contadores `expiredCandidates`, `archived`, `purgeCandidates` y `purged`, además de los IDs detallados, para que un consumidor pueda registrar el resultado de forma compacta.
- La cola de memorias cuya revisión ya venció se puede consultar sin mutaciones con `--list-due-for-review true`; equivale a `MemoryService.listDueForReview(projectId)`.
- Para compactar memorias existentes desde el demo, pasá sus IDs separados por coma: `npm run demo:agent-memory -- --project mi-proyecto --compact-ids id-1,id-2 --compact-title "Resumen de checkout" --compact-max-chars 1200 --archive-sources true`. El comando imprime el resumen creado y las fuentes archivadas; sin `--archive-sources true` las fuentes permanecen activas.
- Para inspeccionar el lifecycle de un proyecto ejecutá `npm run demo:agent-memory -- --project mi-proyecto --inspect-lifecycle true`. El resultado informa totales por estado y conteos de memorias futuras, vencidas y pendientes de revisión.
- Para revisar retención sin borrar datos ejecutá `npm run demo:agent-memory -- --project mi-proyecto --purge-archived-before 2026-11-01T00:00:00.000Z`. El modo simulación es el predeterminado; sólo `--purge-dry-run false` ejecuta la purga y elimina también las relaciones/entradas FTS asociadas.
- Próximo paso: ejecutar la workflow en el repositorio remoto y definir el mecanismo de release/versionado (por ejemplo, changesets o tags) cuando se decida publicar.
