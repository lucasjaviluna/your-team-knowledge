CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'error')),
  actor_id TEXT NOT NULL,
  workspace_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_events_workspace_time_idx
  ON audit_events (workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_actor_time_idx
  ON audit_events (actor_id, occurred_at DESC);
