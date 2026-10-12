import type { ApiPrincipal } from "./api/security.js";

export interface ServerConfig {
  connectionString: string;
  port: number;
  host: string;
  tokens: ReadonlyMap<string, ApiPrincipal>;
  agentMemoryDatabase: string;
  embeddingDtype?: string;
  embeddingLocalOnly: boolean;
}

export function loadServerConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  return {
    connectionString: requiredEnv(environment, "DATABASE_URL"),
    port: parsePort(environment.PORT ?? "3000"),
    host: environment.HOST?.trim() || "0.0.0.0",
    tokens: parseTokenMap(environment.API_TOKENS_JSON),
    agentMemoryDatabase:
      environment.AGENT_MEMORY_DATABASE?.trim() || "./agent-memory.sqlite",
    ...(environment.EMBEDDING_DTYPE?.trim()
      ? { embeddingDtype: environment.EMBEDDING_DTYPE.trim() }
      : {}),
    embeddingLocalOnly: environment.EMBEDDING_LOCAL_ONLY === "1",
  };
}

function requiredEnv(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
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
  if (!value?.trim()) {
    throw new Error(
      "API_TOKENS_JSON is required for the development security adapter.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("API_TOKENS_JSON must be valid JSON.");
  }
  if (!isRecord(parsed))
    throw new Error("API_TOKENS_JSON must be a JSON object.");

  const entries: Array<[string, ApiPrincipal]> = [];
  for (const [token, principal] of Object.entries(parsed)) {
    if (!token.trim())
      throw new Error("API_TOKENS_JSON contains an empty token.");
    if (!isRecord(principal) || typeof principal.actorId !== "string") {
      throw new Error(`Invalid principal for token ${token}.`);
    }
    if (!principal.actorId.trim()) {
      throw new Error(`actorId must not be empty for token ${token}.`);
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
  if (entries.length === 0) {
    throw new Error("API_TOKENS_JSON must define at least one token.");
  }
  return new Map(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}
