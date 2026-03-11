-- SQLite doesn't support ALTER CONSTRAINT, so we must recreate the table
-- to add 'ANTHROPIC' to the kind CHECK constraint.

CREATE TABLE integration_settings_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('OPENROUTER', 'OPENBUNNY', 'GITHUB', 'ANTHROPIC')),
  json_encrypted TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, kind)
);

INSERT INTO integration_settings_new (id, project_id, kind, json_encrypted, updated_at)
  SELECT id, project_id, kind, json_encrypted, updated_at FROM integration_settings;

DROP TABLE integration_settings;

ALTER TABLE integration_settings_new RENAME TO integration_settings;

CREATE INDEX idx_integration_settings_project_id ON integration_settings(project_id);
