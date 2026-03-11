CREATE TABLE plan_conversations (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  metadata TEXT DEFAULT '{}',
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plan_conv_plan_id ON plan_conversations(plan_id);
CREATE INDEX idx_plan_conv_seq ON plan_conversations(plan_id, seq);
