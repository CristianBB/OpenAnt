CREATE TABLE work_groups (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_work_groups_project_id ON work_groups(project_id);

CREATE TABLE work_group_items (
  id TEXT PRIMARY KEY,
  work_group_id TEXT NOT NULL REFERENCES work_groups(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 1.0,
  reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_work_group_items_work_group_id ON work_group_items(work_group_id);
CREATE INDEX idx_work_group_items_task_id ON work_group_items(task_id);
