/**
 * Minimal runtime entrypoint for consumers that only need local Agent Memory.
 * Keep this module free of transport and storage-specific imports.
 */
export { MemoryService } from "./application/memory/memory-service.js";
export {
  SqliteAgentMemoryRepository,
  type SqliteAgentMemoryOptions,
  type SqliteBackupOptions,
  type SqliteBackupResult,
} from "./infrastructure/sqlite/sqlite-agent-memory.js";
export {
  SqliteAgentMemoryProvider,
  type AgentMemoryContext,
  type AgentMemoryEntry,
  type AgentMemoryProvider,
  type AgentMemoryReviewRequest,
  type AgentMemoryReviewResult,
  type AgentMemorySaveRequest,
  type AgentMemorySaveResult,
  type AgentMemorySearchRequest,
  type AgentMemorySearchResult,
  type AgentMemorySessionFinishRequest,
  type AgentMemorySessionResult,
} from "./adapters/agent-memory-provider.js";
export {
  AgentMemoryProtocol,
  type AgentMemoryBootstrapRequest,
  type AgentMemoryBootstrapResult,
  type AgentMemoryFinishRequest,
  type AgentMemoryProtocolEvent,
  type AgentMemoryProtocolOptions,
  type AgentMemoryRememberRequest,
} from "./adapters/agent-memory-protocol.js";
export {
  PiHarnessMemoryProvider,
  type PiHarnessMemoryContext,
  type PiHarnessMemoryEntry,
  type PiHarnessMemoryQuery,
  type PiHarnessMemorySearchResult,
  type PiHarnessMemoryWriteRequest,
} from "./adapters/pi-harness-memory-provider.js";
export {
  PiHarnessMemoryProtocol,
  type PiHarnessMemoryBootstrapRequest,
  type PiHarnessMemoryBootstrapResult,
  type PiHarnessMemoryFinishRequest,
  type PiHarnessMemoryProtocolEvent,
  type PiHarnessMemoryProtocolOptions,
  type PiHarnessMemoryRememberRequest,
  type PiHarnessMemoryRememberResult,
} from "./adapters/pi-harness-memory-protocol.js";

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
