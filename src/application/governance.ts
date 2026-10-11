export type AuditAction = "knowledge.query" | "knowledge.ingest";
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
