import type { MemoryItem, SourceCitation } from "../../domain/index.js";

export type ContextIntent = "continuity" | "documentary" | "mixed";

export interface ContextRequest {
  workspaceId: string;
  actorId: string;
  teamIds: readonly string[];
  query: string;
  intent?: ContextIntent;
  memoryLimit?: number;
  knowledgeLimit?: number;
  maxChars?: number;
  includeMemory?: boolean;
  includeKnowledge?: boolean;
}

export interface ContextMemoryEntry {
  memory: MemoryItem;
  reason: "query-match";
}

export interface ContextBundle {
  query: string;
  intent: ContextIntent;
  memories: readonly ContextMemoryEntry[];
  citations: readonly SourceCitation[];
  contextText: string;
  truncated: boolean;
}

export interface ContextProvider {
  resolve(request: ContextRequest): Promise<ContextBundle>;
}
