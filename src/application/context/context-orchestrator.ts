import type { MemoryService } from "../memory/index.js";
import type { KnowledgeQueryService } from "../knowledge/index.js";
import type {
  ContextBundle,
  ContextMemoryEntry,
  ContextProvider,
  ContextRequest,
} from "./contracts.js";
import { classifyContextIntent } from "./intent.js";

export class ContextOrchestrator implements ContextProvider {
  constructor(
    private readonly memory: MemoryService,
    private readonly knowledge: KnowledgeQueryService,
  ) {}

  async resolve(request: ContextRequest): Promise<ContextBundle> {
    const query = requireText(request.query, "query");
    const maxChars = request.maxChars ?? 12_000;
    if (maxChars < 1) {
      throw new Error("maxChars must be greater than zero.");
    }

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
    );

    return {
      query,
      intent,
      memories,
      citations: context.citations,
      contextText: context.text,
      truncated: context.truncated,
    };
  }
}

function renderContext(
  memories: readonly ContextMemoryEntry[],
  citations: readonly ContextBundle["citations"][number][],
  maxChars: number,
): {
  text: string;
  citations: readonly ContextBundle["citations"][number][];
  truncated: boolean;
} {
  const sections: string[] = [];
  const selectedCitations: ContextBundle["citations"][number][] = [];
  let truncated = false;

  for (const memory of memories) {
    sections.push(`Memory: ${memory.memory.title}\n${memory.memory.content}`);
  }

  for (const citation of citations) {
    const excerpt = citation.excerpt?.trim() ?? "";
    sections.push(`Knowledge: ${citation.title}\n${excerpt}`);
    selectedCitations.push(citation);
  }

  const fullText = sections.join("\n\n");
  if (fullText.length <= maxChars) {
    return { text: fullText, citations: selectedCitations, truncated };
  }

  truncated = true;
  const text = fullText.slice(0, maxChars).trimEnd();
  const visibleCitations = selectedCitations.filter((citation) =>
    text.includes(`Knowledge: ${citation.title}`),
  );
  return { text, citations: visibleCitations, truncated };
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}
