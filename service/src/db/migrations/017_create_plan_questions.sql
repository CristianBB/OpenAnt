CREATE TABLE plan_questions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  context TEXT DEFAULT '',
  answer TEXT,
  answered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plan_questions_plan ON plan_questions(plan_id);
