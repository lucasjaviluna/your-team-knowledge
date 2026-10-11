import type {
  EmbeddingBenchmarkCase,
  EmbeddingBenchmarkDocument,
} from "../../src/application/index.js";

export const embeddingBenchmarkDocuments: readonly EmbeddingBenchmarkDocument[] =
  [
    {
      id: "deployment-approval",
      content:
        "Los despliegues a producción requieren aprobación del equipo de plataforma y una ventana de cambio registrada.",
    },
    {
      id: "workspace-access",
      content:
        "El acceso a los documentos se concede por workspace, actor y equipo mediante una política de autorización.",
    },
    {
      id: "agent-memory",
      content:
        "Agent Memory conserva sesiones, resúmenes y observaciones operativas en una base SQLite local.",
    },
    {
      id: "postgres-rag",
      content:
        "Corporate Knowledge RAG almacena documentos y chunks en PostgreSQL y combina full-text con similitud vectorial.",
    },
    {
      id: "incident-response",
      content:
        "Ante un incidente se debe abrir un registro, asignar responsable y documentar la resolución para auditoría.",
    },
    {
      id: "retention-policy",
      content:
        "La retención define cuánto tiempo permanecen activos los documentos y cuándo pasan a revisión o deprecación.",
    },
  ];

export const embeddingBenchmarkCases: readonly EmbeddingBenchmarkCase[] = [
  {
    id: "deployment",
    query: "¿Quién debe aprobar un despliegue a producción?",
    relevantDocumentIds: ["deployment-approval"],
  },
  {
    id: "permissions",
    query: "¿Cómo se controla el acceso a documentos?",
    relevantDocumentIds: ["workspace-access"],
  },
  {
    id: "local-memory",
    query: "¿Dónde se guardan las sesiones y observaciones del agente?",
    relevantDocumentIds: ["agent-memory"],
  },
  {
    id: "hybrid-retrieval",
    query: "¿Qué base se utiliza para recuperar chunks con búsqueda híbrida?",
    relevantDocumentIds: ["postgres-rag"],
  },
  {
    id: "incident",
    query: "¿Qué información se registra durante un incidente?",
    relevantDocumentIds: ["incident-response"],
  },
  {
    id: "retention",
    query: "¿Cuándo debe revisarse o retirarse un documento?",
    relevantDocumentIds: ["retention-policy"],
  },
];
