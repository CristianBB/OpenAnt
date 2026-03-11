CREATE TABLE pull_requests (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  github_pr_number INTEGER,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'MERGED', 'CLOSED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pull_requests_plan_id ON pull_requests(plan_id);
CREATE INDEX idx_pull_requests_repository_id ON pull_requests(repository_id);
