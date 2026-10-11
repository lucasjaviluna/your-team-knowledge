# Integración con pi-harness

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
