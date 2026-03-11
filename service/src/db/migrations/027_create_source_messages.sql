CREATE TABLE source_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  content TEXT NOT NULL,
  subject TEXT,
  sender_name TEXT,
  sender_email TEXT,
  sender_id TEXT,
  raw_json TEXT,
  triage_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (triage_status IN ('PENDING', 'PROCESSING', 'TRIAGED', 'DISMISSED', 'ERROR')),
  triage_classification TEXT
    CHECK (triage_classification IN ('BUG', 'FEATURE_REQUEST', 'IMPROVEMENT', 'IRRELEVANT')),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  triaged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(channel_id, external_id)
);

CREATE INDEX idx_source_messages_project_id ON source_messages(project_id);
CREATE INDEX idx_source_messages_triage_status ON source_messages(triage_status);
CREATE INDEX idx_source_messages_channel_id ON source_messages(channel_id);
