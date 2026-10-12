import type { DataType } from "@huggingface/transformers";
import { createKnowledgeHttpServer } from "./api/index.js";
import { StaticBearerSecurity } from "./api/security.js";
import {
  ContextOrchestrator,
  KnowledgeIngestionService,
  KnowledgeQueryService,
  MemoryService,
} from "./application/index.js";
import { TransformersEmbeddingProvider } from "./infrastructure/embeddings/index.js";
import {
  PostgresAuditLog,
  PostgresKnowledgeRepository,
} from "./infrastructure/postgres/index.js";
import { SqliteAgentMemoryRepository } from "./infrastructure/sqlite/index.js";
import { loadServerConfig } from "./server-config.js";

const config = loadServerConfig(process.env);

const embeddingDtype = config.embeddingDtype as DataType | undefined;
const embeddingProvider = new TransformersEmbeddingProvider({
  ...(embeddingDtype ? { dtype: embeddingDtype } : {}),
  localFilesOnly: config.embeddingLocalOnly,
});
const repository = new PostgresKnowledgeRepository(config.connectionString);
const audit = new PostgresAuditLog(config.connectionString);
const memoryRepository = new SqliteAgentMemoryRepository(
  config.agentMemoryDatabase,
);
const memory = new MemoryService(memoryRepository);
const server = createKnowledgeHttpServer(
  {
    ingestion: new KnowledgeIngestionService(repository, embeddingProvider),
    query: new KnowledgeQueryService(repository, embeddingProvider),
    context: new ContextOrchestrator(
      memory,
      new KnowledgeQueryService(repository, embeddingProvider),
    ),
  },
  {
    security: new StaticBearerSecurity(config.tokens),
    audit,
    readiness: async () => {
      await repository.health();
      await audit.health();
      return { dependencies: { postgres: "ok", audit: "ok" } };
    },
  },
);

server.listen(config.port, config.host, () => {
  console.log(
    `Knowledge API listening on http://${config.host}:${config.port}`,
  );
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => {
      memoryRepository.close();
      void Promise.all([repository.close(), audit.close()]).finally(() => {
        process.exitCode = 0;
      });
    });
  });
}
