import type { ContextEvaluationCase } from "../../src/application/context/index.js";

const request = (query: string) => ({
  workspaceId: "workspace-evaluation",
  actorId: "actor-evaluation",
  teamIds: ["team-evaluation"],
  query,
});

export const contextEvaluationDataset: readonly ContextEvaluationCase[] = [
  {
    id: "continuity-decision",
    request: request("¿Qué decidimos en la sesión anterior?"),
    expectedIntent: "continuity",
    expectedMemoryIds: ["memory-decision"],
  },
  {
    id: "documentary-deployment",
    request: request("¿Qué dice la documentación de despliegues?"),
    expectedIntent: "documentary",
    expectedDocumentIds: ["document-deployment"],
    forbiddenDocumentIds: ["document-private"],
  },
  {
    id: "mixed-deployment",
    request: request(
      "¿Qué decidimos y qué dice la documentación sobre despliegues?",
    ),
    expectedIntent: "mixed",
    expectedMemoryIds: ["memory-decision"],
    expectedDocumentIds: ["document-deployment"],
  },
  {
    id: "permission-isolation",
    request: request("¿Qué dice la documentación privada?"),
    expectedIntent: "documentary",
    forbiddenDocumentIds: ["document-private"],
  },
];
