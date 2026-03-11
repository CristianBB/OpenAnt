CREATE TABLE integration_settings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('OPENROUTER', 'OPENBUNNY', 'GITHUB')),
  json_encrypted TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, kind)
);

CREATE INDEX idx_integration_settings_project_id ON integration_settings(project_id);
