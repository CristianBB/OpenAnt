CREATE TABLE openbunny_task_raw (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  payload_raw_json TEXT NOT NULL,
  status_external TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, external_id)
);

CREATE INDEX idx_openbunny_task_raw_project_id ON openbunny_task_raw(project_id);
