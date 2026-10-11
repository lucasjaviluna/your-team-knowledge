import { Pool, type PoolClient } from "pg";

import type { AuditEvent, AuditSink } from "../../application/index.js";

export class PostgresAuditLog implements AuditSink {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(connectionString: string, pool?: Pool) {
    this.pool = pool ?? new Pool({ connectionString });
    this.ownsPool = !pool;
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }

  async record(event: AuditEvent): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO audit_events (
          action, outcome, actor_id, workspace_id, resource_type,
          resource_id, request_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          event.action,
          event.outcome,
          event.actorId,
          event.workspaceId ?? null,
          event.resourceType ?? null,
          event.resourceId ?? null,
          event.requestId ?? null,
          JSON.stringify(event.metadata ?? {}),
        ],
      );
    } finally {
      client.release();
    }
  }
}
