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
