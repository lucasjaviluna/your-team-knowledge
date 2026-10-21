import { readFileSync } from "node:fs";

import { MemoryService } from "../application/index.js";
import { SqliteAgentMemoryRepository } from "../infrastructure/index.js";
import type { MemoryItemType, MemoryRelationType } from "../domain/index.js";

export interface ConformanceFixture {
  version: number;
  clock: string;
  operations: readonly ConformanceOperation[];
}

export interface ConformanceOperation {
  id: string;
  op: string;
  workspaceId?: string;
  ownerId?: string;
  sessionId?: string;
  sourceMemoryId?: string;
  targetMemoryId?: string;
  relation?: "related" | "supports" | "conflicts_with" | "supersedes";
  type?: "decision" | "discovery" | "pattern" | "preference" | "summary";
  title?: string;
  content?: string;
  subjectKey?: string;
  tags?: readonly string[];
  validFrom?: string;
  expiresAt?: string;
  query?: string;
  summary?: string;
  expectedTitles?: readonly string[];
  expectedCount?: number;
  expected?: {
    total: number;
    expired: number;
    byStatus: Record<string, number>;
  };
  expectError?: string;
}

export interface ConformanceReport {
  version: number;
  runtime: "typescript";
  clock: string;
  passed: number;
  operations: readonly ConformanceResult[];
}

export interface ConformanceResult {
  id: string;
  op: string;
  status: "passed";
  result?: unknown;
  error?: string;
}

export function loadConformanceFixture(filename: string): ConformanceFixture {
  return JSON.parse(readFileSync(filename, "utf8")) as ConformanceFixture;
}

export function runConformanceFixture(
  fixture: ConformanceFixture,
  databaseFile: string,
): ConformanceReport {
  const clock = new Date(fixture.clock);
  if (Number.isNaN(clock.getTime()))
    throw new Error("Fixture clock is invalid.");
  let sequence = 0;
  const sessions = new Map<string, string>();
  const memories = new Map<string, string>();
  const repository = new SqliteAgentMemoryRepository(databaseFile);
  const service = new MemoryService(
    repository,
    () => clock,
    () => `id-${String(++sequence).padStart(3, "0")}`,
  );
  const results: ConformanceResult[] = [];

  try {
    for (const operation of fixture.operations) {
      try {
        const result = execute(operation, service, sessions, memories);
        if (operation.expectError) {
          throw new Error(
            `Expected error '${operation.expectError}' but operation succeeded.`,
          );
        }
        results.push({
          id: operation.id,
          op: operation.op,
          status: "passed",
          ...(result === undefined ? {} : { result: normalize(result) }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!operation.expectError || message !== operation.expectError) {
          throw new Error(`${operation.id}: ${message}`);
        }
        results.push({
          id: operation.id,
          op: operation.op,
          status: "passed",
          error: message,
        });
      }
    }
  } finally {
    repository.close();
  }

  return {
    version: fixture.version,
    runtime: "typescript",
    clock: fixture.clock,
    passed: results.length,
    operations: results,
  };
}

function execute(
  operation: ConformanceOperation,
  service: MemoryService,
  sessions: Map<string, string>,
  memories: Map<string, string>,
): unknown {
  switch (operation.op) {
    case "startSession": {
      const workspaceId = required(operation.workspaceId, "workspaceId");
      const session = service.startSession({
        workspaceId,
        ...(operation.ownerId ? { ownerId: operation.ownerId } : {}),
      });
      sessions.set(operation.id, session.id);
      return session;
    }
    case "save": {
      const workspaceId = required(operation.workspaceId, "workspaceId");
      const memory = service.save({
        workspaceId,
        ...(operation.sessionId
          ? { sessionId: resolve(operation.sessionId, sessions) }
          : {}),
        type: required(operation.type, "type") as MemoryItemType,
        title: required(operation.title, "title"),
        content: required(operation.content, "content"),
        ...(operation.subjectKey ? { subjectKey: operation.subjectKey } : {}),
        ...(operation.tags ? { tags: operation.tags } : {}),
        ...(operation.validFrom
          ? { validFrom: new Date(operation.validFrom) }
          : {}),
        ...(operation.expiresAt
          ? { expiresAt: new Date(operation.expiresAt) }
          : {}),
      });
      memories.set(operation.id, memory.id);
      return memory;
    }
    case "search": {
      const workspaceId = required(operation.workspaceId, "workspaceId");
      const titles = service
        .search({ workspaceId, query: required(operation.query, "query") })
        .map((item) => item.title);
      assertEqual(titles, operation.expectedTitles ?? []);
      return { titles };
    }
    case "addRelation": {
      const relation = service.addRelation({
        sourceMemoryId: resolve(operation.sourceMemoryId, memories),
        targetMemoryId: resolve(operation.targetMemoryId, memories),
        relation: required(
          operation.relation,
          "relation",
        ) as MemoryRelationType,
      });
      return relation;
    }
    case "inspectLifecycle": {
      const workspaceId = required(operation.workspaceId, "workspaceId");
      const lifecycle = service.inspectLifecycle(workspaceId);
      const expected = operation.expected;
      if (expected) {
        assertEqual(lifecycle.total, expected.total);
        assertEqual(lifecycle.expired, expected.expired);
        assertEqual(lifecycle.byStatus, expected.byStatus);
      }
      return lifecycle;
    }
    case "archiveExpired": {
      const workspaceId = required(operation.workspaceId, "workspaceId");
      const count = service.archiveExpired(workspaceId);
      assertEqual(count, operation.expectedCount ?? count);
      return { count };
    }
    case "endSession": {
      const session = service.endSession({
        sessionId: resolve(operation.sessionId, sessions),
        ...(operation.summary ? { summary: operation.summary } : {}),
      });
      return session;
    }
    default:
      throw new Error(`Unsupported conformance operation '${operation.op}'.`);
  }
}

function resolve(
  value: string | undefined,
  references: Map<string, string>,
): string {
  const normalized = required(value, "reference");
  const match = /^\$(?:session|memory)\.(.+)$/.exec(normalized);
  return match
    ? required(references.get(match[1] ?? ""), normalized)
    : normalized;
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`,
    );
  }
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}
