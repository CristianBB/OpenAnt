CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('GMAIL', 'SLACK', 'GITHUB_ISSUES')),
  name TEXT NOT NULL,
  config_encrypted TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_poll_at TEXT,
  last_poll_cursor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, kind, name)
);

CREATE INDEX idx_channels_project_id ON channels(project_id);
CREATE INDEX idx_channels_kind ON channels(kind);
