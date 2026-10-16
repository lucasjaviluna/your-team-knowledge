import type { MemoryItemType } from "../domain/index.js";
import {
  SqliteAgentMemoryProvider,
  type AgentMemoryContext,
  type AgentMemoryEntry,
  type AgentMemoryProvider,
  type AgentMemorySaveResult,
} from "./agent-memory-provider.js";
import type { MemoryService } from "../application/index.js";

export interface AgentMemoryProtocolOptions {
  defaultLimit?: number;
  defaultMaxChars?: number;
  observe?: (event: AgentMemoryProtocolEvent) => void;
}

export interface AgentMemoryProtocolEvent {
  operation: "bootstrap" | "remember" | "finish";
  projectId: string;
  outcome: "success" | "error";
  recalledCount?: number;
  stored?: boolean;
  durationMs: number;
}

export interface AgentMemoryBootstrapRequest {
  query?: string;
  limit?: number;
  maxChars?: number;
}

export interface AgentMemoryBootstrapResult {
  sessionId: string;
  entries: readonly AgentMemoryEntry[];
}

export interface AgentMemoryRememberRequest {
  title: string;
  content: string;
  type: MemoryItemType;
  topicKey?: string;
  tags?: readonly string[];
  source?: string;
  sessionId?: string;
}

export interface AgentMemoryFinishRequest {
  sessionId: string;
  summary?: string;
}

/** Provider-neutral session facade for any agent runtime or transport. */
export class AgentMemoryProtocol {
  readonly provider: AgentMemoryProvider;

  private readonly defaultLimit: number;
  private readonly defaultMaxChars: number;
  private readonly observe:
    ((event: AgentMemoryProtocolEvent) => void) | undefined;

  constructor(
    providerOrMemory: AgentMemoryProvider | MemoryService,
    options: AgentMemoryProtocolOptions = {},
  ) {
    this.provider = isProvider(providerOrMemory)
      ? providerOrMemory
      : new SqliteAgentMemoryProvider(providerOrMemory);
    this.defaultLimit = options.defaultLimit ?? 10;
    this.defaultMaxChars = options.defaultMaxChars ?? 4_000;
    this.observe = options.observe;
  }

  async bootstrap(
    context: AgentMemoryContext,
    request: AgentMemoryBootstrapRequest = {},
  ): Promise<AgentMemoryBootstrapResult> {
    return this.measure("bootstrap", context.projectId, async () => {
      const session = await this.provider.startSession(context);
      if (!request.query?.trim()) {
        return { sessionId: session.sessionId, entries: [] };
      }
      const result = await this.provider.search(
        {
          query: request.query,
          limit: request.limit ?? this.defaultLimit,
          maxChars: request.maxChars ?? this.defaultMaxChars,
        },
        context,
      );
      return { sessionId: session.sessionId, entries: result.entries };
    });
  }

  async remember(
    context: AgentMemoryContext,
    request: AgentMemoryRememberRequest,
  ): Promise<AgentMemorySaveResult> {
    return this.measure("remember", context.projectId, () =>
      this.provider.save(
        {
          type: request.type,
          title: request.title,
          content: request.content,
          source: request.source ?? "agent-memory:protocol",
          ...(request.topicKey ? { topicKey: request.topicKey } : {}),
          ...(request.tags ? { tags: request.tags } : {}),
          ...(request.sessionId ? { sessionId: request.sessionId } : {}),
          ...(context.area ? { area: context.area } : {}),
        },
        context,
      ),
    );
  }

  async finish(
    context: AgentMemoryContext,
    request: AgentMemoryFinishRequest,
  ): Promise<{ sessionId: string; summaryStored: boolean }> {
    return this.measure("finish", context.projectId, async () => {
      const session = await this.provider.finishSession(request, context);
      if (!request.summary?.trim()) {
        return { sessionId: session.sessionId, summaryStored: false };
      }
      const summary = await this.remember(context, {
        type: "summary",
        title: `Session summary ${session.sessionId}`,
        content: request.summary,
        topicKey: `session/${session.sessionId}`,
        sessionId: session.sessionId,
      });
      return { sessionId: session.sessionId, summaryStored: summary.stored };
    });
  }

  private async measure<T>(
    operation: AgentMemoryProtocolEvent["operation"],
    projectId: string,
    action: () => T | Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await action();
      this.observe?.({
        operation,
        projectId,
        outcome: "success",
        ...(operation === "bootstrap" && isBootstrapResult(result)
          ? { recalledCount: result.entries.length }
          : {}),
        ...(operation === "remember" && isSaveResult(result)
          ? { stored: result.stored }
          : {}),
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      this.observe?.({
        operation,
        projectId,
        outcome: "error",
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}

function isProvider(
  value: AgentMemoryProvider | MemoryService,
): value is AgentMemoryProvider {
  return "isAvailable" in value;
}

function isBootstrapResult(
  value: unknown,
): value is AgentMemoryBootstrapResult {
  return Boolean(value && typeof value === "object" && "entries" in value);
}

function isSaveResult(value: unknown): value is AgentMemorySaveResult {
  return Boolean(value && typeof value === "object" && "stored" in value);
}
