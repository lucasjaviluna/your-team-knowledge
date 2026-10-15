import type { MemoryService } from "../application/index.js";
import { PiHarnessMemoryProvider } from "./pi-harness-memory-provider.js";
import type {
  PiHarnessMemoryContext,
  PiHarnessMemoryEntry,
  PiHarnessMemoryQuery,
  PiHarnessMemoryWriteRequest,
} from "./pi-harness-memory-provider.js";

export interface PiHarnessMemoryProtocolOptions {
  defaultLimit?: number;
  defaultMaxChars?: number;
  observe?: (event: PiHarnessMemoryProtocolEvent) => void;
}

export interface PiHarnessMemoryProtocolEvent {
  operation: "bootstrap" | "remember" | "finish";
  projectId: string;
  outcome: "success" | "error";
  recalledCount?: number;
  stored?: boolean;
  durationMs: number;
}

export interface PiHarnessMemoryBootstrapRequest {
  query?: string;
  limit?: number;
  maxChars?: number;
}

export interface PiHarnessMemoryBootstrapResult {
  sessionId: string;
  entries: readonly PiHarnessMemoryEntry[];
}

export interface PiHarnessMemoryRememberRequest {
  title: string;
  content: string;
  type: "decision" | "discovery" | "pattern" | "preference" | "summary";
  subjectKey?: string;
  tags?: readonly string[];
  source?: string;
}

export interface PiHarnessMemoryRememberResult {
  stored: boolean;
  entryId?: string;
  reason?: "duplicate" | "rejected" | "unavailable";
}

export interface PiHarnessMemoryFinishRequest {
  sessionId: string;
  summary?: string;
}

/**
 * Runtime-neutral protocol for consumers that want automatic Agent Memory.
 * The native Pi extension should call this facade from its hooks/tools.
 */
export class PiHarnessMemoryProtocol {
  readonly provider: PiHarnessMemoryProvider;

  private readonly defaultLimit: number;
  private readonly defaultMaxChars: number;
  private readonly observe:
    ((event: PiHarnessMemoryProtocolEvent) => void) | undefined;

  constructor(
    private readonly memory: MemoryService,
    provider?: PiHarnessMemoryProvider,
    options: PiHarnessMemoryProtocolOptions = {},
  ) {
    this.provider = provider ?? new PiHarnessMemoryProvider(memory);
    this.defaultLimit = options.defaultLimit ?? 10;
    this.defaultMaxChars = options.defaultMaxChars ?? 4_000;
    this.observe = options.observe;
  }

  async bootstrap(
    context: PiHarnessMemoryContext,
    request: PiHarnessMemoryBootstrapRequest = {},
  ): Promise<PiHarnessMemoryBootstrapResult> {
    return this.measure("bootstrap", context.projectId, async () => {
      const session = this.memory.startSession({
        workspaceId: context.projectId,
      });
      if (!request.query?.trim()) {
        return { sessionId: session.id, entries: [] };
      }

      const query: PiHarnessMemoryQuery = {
        query: request.query,
        limit: request.limit ?? this.defaultLimit,
        maxChars: request.maxChars ?? this.defaultMaxChars,
      };
      const result = await this.provider.search(query, context);
      return { sessionId: session.id, entries: result.entries };
    });
  }

  async remember(
    context: PiHarnessMemoryContext,
    request: PiHarnessMemoryRememberRequest,
  ): Promise<PiHarnessMemoryRememberResult> {
    return this.measure("remember", context.projectId, async () => {
      const entry: PiHarnessMemoryWriteRequest = {
        title: request.title,
        content: request.content,
        source: request.source ?? "pi-harness:protocol",
        tags: [request.type, ...(request.tags ?? [])],
        ...(request.subjectKey ? { idempotencyKey: request.subjectKey } : {}),
      };
      return this.provider.store(entry, context);
    });
  }

  async finish(
    context: PiHarnessMemoryContext,
    request: PiHarnessMemoryFinishRequest,
  ): Promise<{ sessionId: string; summaryStored: boolean }> {
    return this.measure("finish", context.projectId, async () => {
      const session = this.memory.endSession({
        sessionId: request.sessionId,
        ...(request.summary ? { summary: request.summary } : {}),
      });
      if (!request.summary?.trim()) {
        return { sessionId: session.id, summaryStored: false };
      }

      const summary = await this.remember(context, {
        type: "summary",
        title: `Session summary ${session.id}`,
        content: request.summary,
        subjectKey: `session/${session.id}`,
      });
      return { sessionId: session.id, summaryStored: summary.stored };
    });
  }

  private async measure<T>(
    operation: PiHarnessMemoryProtocolEvent["operation"],
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
        ...(operation === "remember" && isRememberResult(result)
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

function isBootstrapResult(
  value: unknown,
): value is PiHarnessMemoryBootstrapResult {
  return Boolean(value && typeof value === "object" && "entries" in value);
}

function isRememberResult(
  value: unknown,
): value is PiHarnessMemoryRememberResult {
  return Boolean(value && typeof value === "object" && "stored" in value);
}
