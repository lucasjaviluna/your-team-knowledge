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
  maxTokens?: number;
  includeMemory?: boolean;
  includeKnowledge?: boolean;
}

export interface ContextRankingOptions {
  memoryWeight?: number;
  knowledgeWeight?: number;
}

export interface ContextOrchestratorOptions {
  ranking?: ContextRankingOptions;
  charsPerToken?: number;
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
  estimatedTokens: number;
  truncated: boolean;
}

export interface ContextProvider {
  resolve(request: ContextRequest): Promise<ContextBundle>;
}
