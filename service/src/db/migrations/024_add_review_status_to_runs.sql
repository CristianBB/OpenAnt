-- SQLite does not support ALTER CHECK constraints directly.
-- Recreate the runs table with the updated status CHECK constraint to include 'REVIEW'.
-- Column order matches the original schema + migrations 022 (workspace_path, branch_name appended).

CREATE TABLE runs_new (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'REVIEW', 'FAILED', 'DONE')),
  logs_path TEXT,
  error TEXT,
  started_at TEXT,
  ended_at TEXT,
  workspace_path TEXT,
  branch_name TEXT
);

INSERT INTO runs_new (id, plan_id, status, logs_path, error, started_at, ended_at, workspace_path, branch_name)
  SELECT id, plan_id, status, logs_path, error, started_at, ended_at, workspace_path, branch_name FROM runs;

DROP TABLE runs;

ALTER TABLE runs_new RENAME TO runs;

CREATE INDEX idx_runs_plan_id ON runs(plan_id);
