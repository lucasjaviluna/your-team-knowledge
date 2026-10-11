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
    {
      id: "change-window",
      content:
        "La ventana de cambio es el intervalo operativo aprobado para desplegar una versión. Antes de usarla deben existir un responsable, un plan de reversión, una evaluación de riesgo y la aprobación registrada por el equipo de plataforma.",
    },
    {
      id: "credential-rotation",
      content:
        "Las credenciales de conectores y servicios se rotan de forma periódica. La rotación debe invalidar el secreto anterior, registrar quién la ejecutó y verificar que los consumidores autorizados continúan funcionando.",
    },
    {
      id: "document-versioning",
      content:
        "Cada documento conserva su versión, fecha de publicación y relación con la versión anterior. Cuando una versión queda obsoleta se marca como superseded, se conserva para auditoría y se prioriza la versión vigente en nuevas respuestas.",
    },
    {
      id: "connector-sync",
      content:
        "Los conectores sincronizan cambios incrementales desde las fuentes externas. Cada ejecución guarda un cursor, la fuente de origen y el resultado de la sincronización para poder reanudarla sin duplicar documentos.",
    },
    {
      id: "audit-citations",
      content:
        "Una cita trazable incluye la fuente, el identificador del documento, la versión, el fragmento utilizado y la razón de inclusión. Esto permite revisar por qué una respuesta recibió determinado contexto.",
    },
    {
      id: "context-orchestrator",
      content:
        "El Context Orchestrator interpreta la intención, combina memoria local con conocimiento documental autorizado y limita el ContextBundle según el workspace, el actor y el presupuesto de tokens.",
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
  {
    id: "change-window",
    query: "¿Cómo se agenda un cambio antes de publicar una versión?",
    relevantDocumentIds: ["change-window", "deployment-approval"],
  },
  {
    id: "secret-renewal",
    query: "¿Qué procedimiento se usa para renovar secretos de integración?",
    relevantDocumentIds: ["credential-rotation"],
  },
  {
    id: "superseded-document",
    query:
      "When an old document is replaced, which version should retrieval prefer?",
    relevantDocumentIds: ["document-versioning"],
  },
  {
    id: "incremental-sync",
    query:
      "¿Cómo se reanuda una sincronización incremental sin duplicar contenido?",
    relevantDocumentIds: ["connector-sync"],
  },
  {
    id: "traceable-citation",
    query: "¿Qué datos debe mostrar una referencia verificable?",
    relevantDocumentIds: ["audit-citations"],
  },
  {
    id: "mixed-context",
    query:
      "¿Quién decide qué memoria y documentos entran en el contexto del agente?",
    relevantDocumentIds: [
      "context-orchestrator",
      "agent-memory",
      "postgres-rag",
    ],
  },
];
