CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'WONTFIX')),
  priority INTEGER NOT NULL DEFAULT 0,
  origin_external_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_origin_external_id ON tasks(origin_external_id);
