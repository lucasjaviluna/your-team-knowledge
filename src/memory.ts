/**
 * Minimal runtime entrypoint for consumers that only need local Agent Memory.
 * Keep this module free of RAG, PostgreSQL and embedding imports.
 */
export { MemoryService } from "./application/memory/memory-service.js";
export {
  SqliteAgentMemoryRepository,
  type SqliteAgentMemoryOptions,
  type SqliteBackupOptions,
  type SqliteBackupResult,
} from "./infrastructure/sqlite/sqlite-agent-memory.js";
export {
  PiHarnessMemoryProvider,
  type PiHarnessMemoryContext,
  type PiHarnessMemoryEntry,
  type PiHarnessMemoryQuery,
  type PiHarnessMemorySearchResult,
  type PiHarnessMemoryWriteRequest,
} from "./adapters/pi-harness-memory-provider.js";

export type {
  AddMemoryRelationInput,
  CompactMemoryInput,
  CompactMemoryResult,
  MemoryLifecycleSnapshot,
  PurgeArchivedInput,
  PurgeArchivedResult,
  EndSessionInput,
  MemoryRepository,
  ResolvedSearchMemoryInput,
  SaveMemoryInput,
  SearchMemoryInput,
  StartSessionInput,
} from "./application/memory/contracts.js";
