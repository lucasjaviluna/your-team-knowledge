import type { DataType } from "@huggingface/transformers";
import { createKnowledgeHttpServer } from "./api/index.js";
import { StaticBearerSecurity, type ApiPrincipal } from "./api/security.js";
import {
  KnowledgeIngestionService,
  KnowledgeQueryService,
} from "./application/index.js";
import { TransformersEmbeddingProvider } from "./infrastructure/embeddings/index.js";
import {
  PostgresAuditLog,
  PostgresKnowledgeRepository,
} from "./infrastructure/postgres/index.js";

const connectionString = requiredEnv("DATABASE_URL");
const port = parsePort(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "0.0.0.0";
const tokens = parseTokenMap(process.env.API_TOKENS_JSON);

const embeddingDtype = process.env.EMBEDDING_DTYPE as DataType | undefined;
const embeddingProvider = new TransformersEmbeddingProvider({
  ...(embeddingDtype ? { dtype: embeddingDtype } : {}),
  localFilesOnly: process.env.EMBEDDING_LOCAL_ONLY === "1",
});
const repository = new PostgresKnowledgeRepository(connectionString);
const audit = new PostgresAuditLog(connectionString);
const server = createKnowledgeHttpServer(
  {
    ingestion: new KnowledgeIngestionService(repository, embeddingProvider),
    query: new KnowledgeQueryService(repository, embeddingProvider),
  },
  {
    security: new StaticBearerSecurity(tokens),
    audit,
  },
);

server.listen(port, host, () => {
  console.log(`Knowledge API listening on http://${host}:${port}`);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => {
      void Promise.all([repository.close(), audit.close()]).finally(() => {
        process.exitCode = 0;
      });
    });
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function parseTokenMap(
  value: string | undefined,
): ReadonlyMap<string, ApiPrincipal> {
  if (!value) {
    throw new Error(
      "API_TOKENS_JSON is required for the development security adapter.",
    );
  }

  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed))
    throw new Error("API_TOKENS_JSON must be a JSON object.");

  const entries: Array<[string, ApiPrincipal]> = [];
  for (const [token, principal] of Object.entries(parsed)) {
    if (!isRecord(principal) || typeof principal.actorId !== "string") {
      throw new Error(`Invalid principal for token ${token}.`);
    }
    if (!isStringArray(principal.teamIds)) {
      throw new Error(`teamIds must be an array for token ${token}.`);
    }
    const workspaceIds = principal.workspaceIds;
    if (workspaceIds !== undefined && !isStringArray(workspaceIds)) {
      throw new Error(`workspaceIds must be an array for token ${token}.`);
    }
    entries.push([
      token,
      {
        actorId: principal.actorId,
        teamIds: principal.teamIds,
        ...(workspaceIds ? { workspaceIds } : {}),
      },
    ]);
  }
  return new Map(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
