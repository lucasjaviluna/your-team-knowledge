export type AuditAction =
  "knowledge.query" | "knowledge.ingest" | "context.resolve";
export type AuditOutcome = "success" | "denied" | "error";

export interface AuditEvent {
  action: AuditAction;
  outcome: AuditOutcome;
  actorId: string;
  workspaceId?: string;
  resourceType?: string;
  resourceId?: string;
  requestId?: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}

export type SensitiveContentKind =
  "private-key" | "jwt" | "aws-access-key" | "credential-assignment";

const sensitivePatterns: readonly [SensitiveContentKind, RegExp][] = [
  ["private-key", /-----BEGIN [A-Z0-9 ]+ PRIVATE KEY-----/u],
  ["jwt", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/u],
  [
    "credential-assignment",
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{20,}/iu,
  ],
];

export function detectSensitiveContent(
  content: string,
): readonly SensitiveContentKind[] {
  return sensitivePatterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([kind]) => kind);
}
