CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'FAILED', 'DONE')),
  logs_path TEXT,
  error TEXT,
  started_at TEXT,
  ended_at TEXT
);

CREATE INDEX idx_runs_plan_id ON runs(plan_id);
