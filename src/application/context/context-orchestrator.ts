import type { MemoryService } from "../memory/index.js";
import type { KnowledgeQueryService } from "../knowledge/index.js";
import type {
  ContextBundle,
  ContextMemoryEntry,
  ContextOrchestratorOptions,
  ContextProvider,
  ContextRequest,
} from "./contracts.js";
import { classifyContextIntent } from "./intent.js";

export class ContextOrchestrator implements ContextProvider {
  constructor(
    private readonly memory: MemoryService,
    private readonly knowledge: KnowledgeQueryService,
    private readonly options: ContextOrchestratorOptions = {},
  ) {}

  async resolve(request: ContextRequest): Promise<ContextBundle> {
    const query = requireText(request.query, "query");
    const charsPerToken = this.options.charsPerToken ?? 4;
    validatePositive(charsPerToken, "charsPerToken");
    const maxChars = resolveMaxChars(request, charsPerToken);

    const intent = request.intent ?? classifyContextIntent(query);
    const includeMemory = request.includeMemory ?? intent !== "documentary";
    const includeKnowledge =
      request.includeKnowledge ?? intent !== "continuity";
    const memoryEntriesPromise = includeMemory
      ? Promise.resolve(
          this.memory.search({
            workspaceId: requireText(request.workspaceId, "workspaceId"),
            query,
            limit: request.memoryLimit ?? 10,
          }),
        )
      : Promise.resolve([]);
    const knowledgeResponsePromise = includeKnowledge
      ? this.knowledge.search({
          workspaceId: requireText(request.workspaceId, "workspaceId"),
          actorId: requireText(request.actorId, "actorId"),
          teamIds: request.teamIds,
          query,
          limit: request.knowledgeLimit ?? 10,
        })
      : Promise.resolve({ citations: [], results: [] });

    const [memoryItems, knowledgeResponse] = await Promise.all([
      memoryEntriesPromise,
      knowledgeResponsePromise,
    ]);
    const memories: ContextMemoryEntry[] = memoryItems.map((memory) => ({
      memory,
      reason: "query-match",
    }));
    const context = renderContext(
      memories,
      knowledgeResponse.citations,
      maxChars,
      this.options.ranking,
    );

    return {
      query,
      intent,
      memories,
      citations: context.citations,
      contextText: context.text,
      estimatedTokens: Math.ceil(context.text.length / charsPerToken),
      truncated: context.truncated,
    };
  }
}

function renderContext(
  memories: readonly ContextMemoryEntry[],
  citations: readonly ContextBundle["citations"][number][],
  maxChars: number,
  ranking: ContextOrchestratorOptions["ranking"],
): {
  text: string;
  citations: readonly ContextBundle["citations"][number][];
  truncated: boolean;
} {
  const memoryWeight = ranking?.memoryWeight ?? 1;
  const knowledgeWeight = ranking?.knowledgeWeight ?? 1;
  validatePositive(memoryWeight, "memoryWeight");
  validatePositive(knowledgeWeight, "knowledgeWeight");
  const candidates = [
    ...memories.map((entry, index) => ({
      kind: "memory" as const,
      entry,
      index,
      score: memoryWeight,
    })),
    ...citations.map((citation, index) => ({
      kind: "knowledge" as const,
      citation,
      index: memories.length + index,
      score: (citation.score ?? 0.5) * knowledgeWeight,
    })),
  ].sort((left, right) => right.score - left.score || left.index - right.index);
  const sections = candidates.map((candidate) => {
    if (candidate.kind === "memory") {
      return {
        text: `Memory: ${candidate.entry.memory.title}\n${candidate.entry.memory.content}`,
      };
    }
    const excerpt = candidate.citation.excerpt?.trim() ?? "";
    return {
      text: `Knowledge: ${candidate.citation.title}\n${excerpt}`,
      citation: candidate.citation,
    };
  });
  const fullText = sections.map((section) => section.text).join("\n\n");
  if (fullText.length <= maxChars) {
    return {
      text: fullText,
      citations: sections.flatMap((section) =>
        section.citation ? [section.citation] : [],
      ),
      truncated: false,
    };
  }

  const text = fullText.slice(0, maxChars).trimEnd();
  const visibleCitations = sections.flatMap((section) =>
    section.citation && text.includes(`Knowledge: ${section.citation.title}`)
      ? [section.citation]
      : [],
  );
  return { text, citations: visibleCitations, truncated: true };
}

function resolveMaxChars(
  request: ContextRequest,
  charsPerToken: number,
): number {
  const maxChars = request.maxChars ?? 12_000;
  validatePositive(maxChars, "maxChars");
  if (request.maxTokens === undefined) {
    return maxChars;
  }
  validatePositive(request.maxTokens, "maxTokens");
  return Math.min(maxChars, Math.floor(request.maxTokens * charsPerToken));
}

function validatePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be greater than zero.`);
  }
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}
