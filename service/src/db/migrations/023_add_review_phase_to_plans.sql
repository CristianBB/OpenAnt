-- SQLite does not support ALTER CHECK constraints directly.
-- Recreate the plans table with the updated agent_phase CHECK constraint.

CREATE TABLE plans_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  work_group_id TEXT REFERENCES work_groups(id) ON DELETE SET NULL,
  plan_markdown TEXT NOT NULL DEFAULT '',
  plan_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'DONE', 'FAILED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  agent_phase TEXT DEFAULT 'idle'
    CHECK (agent_phase IN ('idle','analyzing','questioning','planning','chatting','implementing','review','done','error')),
  agent_session_id TEXT,
  agent_error TEXT
);

INSERT INTO plans_new SELECT * FROM plans;

DROP TABLE plans;

ALTER TABLE plans_new RENAME TO plans;

CREATE INDEX idx_plans_project_id ON plans(project_id);
CREATE INDEX idx_plans_task_id ON plans(task_id);
CREATE INDEX idx_plans_work_group_id ON plans(work_group_id);
