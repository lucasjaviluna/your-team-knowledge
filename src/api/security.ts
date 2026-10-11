import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

export interface ApiPrincipal {
  actorId: string;
  teamIds: readonly string[];
  workspaceIds?: readonly string[];
}

export type KnowledgeHttpAction = "query" | "ingest";

export interface KnowledgeHttpSecurity {
  authenticate(request: IncomingMessage): Promise<ApiPrincipal | null>;
  authorize(
    principal: ApiPrincipal,
    action: KnowledgeHttpAction,
    workspaceId: string,
  ): Promise<boolean>;
}

/** Provider-neutral boundary for resolving a corporate bearer token. */
export interface BearerIdentityResolver {
  resolve(
    token: string,
    request: IncomingMessage,
  ): Promise<ApiPrincipal | null>;
}

export class BearerIdentitySecurity implements KnowledgeHttpSecurity {
  constructor(private readonly resolver: BearerIdentityResolver) {}

  async authenticate(request: IncomingMessage): Promise<ApiPrincipal | null> {
    const token = extractBearerToken(request.headers);
    return token ? this.resolver.resolve(token, request) : null;
  }

  async authorize(
    principal: ApiPrincipal,
    _action: KnowledgeHttpAction,
    workspaceId: string,
  ): Promise<boolean> {
    return (
      principal.workspaceIds === undefined ||
      principal.workspaceIds.includes(workspaceId)
    );
  }
}

export class StaticBearerSecurity implements KnowledgeHttpSecurity {
  private readonly principals: ReadonlyMap<string, ApiPrincipal>;

  constructor(principals: ReadonlyMap<string, ApiPrincipal>) {
    this.principals = principals;
  }

  async authenticate(request: IncomingMessage): Promise<ApiPrincipal | null> {
    const token = extractBearerToken(request.headers);
    return token ? (this.principals.get(token) ?? null) : null;
  }

  async authorize(
    principal: ApiPrincipal,
    _action: KnowledgeHttpAction,
    workspaceId: string,
  ): Promise<boolean> {
    return (
      principal.workspaceIds === undefined ||
      principal.workspaceIds.includes(workspaceId)
    );
  }
}

function extractBearerToken(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.authorization;
  if (!value?.startsWith("Bearer ")) return undefined;
  const token = value.slice("Bearer ".length).trim();
  return token || undefined;
}
