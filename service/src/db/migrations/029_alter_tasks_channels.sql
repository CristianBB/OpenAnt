-- Recreate tasks table with PENDING_REVIEW status and new columns
CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  user_context TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('PENDING_REVIEW', 'OPEN', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'WONTFIX')),
  priority INTEGER NOT NULL DEFAULT 0,
  origin_external_id TEXT,
  requester_count INTEGER NOT NULL DEFAULT 1,
  approval_instructions TEXT,
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO tasks_new (id, project_id, title, description, user_context, status, priority, origin_external_id, created_at, updated_at)
  SELECT id, project_id, title, description, user_context, status, priority, origin_external_id, created_at, updated_at FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_origin_external_id ON tasks(origin_external_id);
