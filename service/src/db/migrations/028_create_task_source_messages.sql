CREATE TABLE task_source_messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  source_message_id TEXT NOT NULL REFERENCES source_messages(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(task_id, source_message_id)
);

CREATE INDEX idx_task_source_messages_task_id ON task_source_messages(task_id);
CREATE INDEX idx_task_source_messages_source_message_id ON task_source_messages(source_message_id);
