CREATE TABLE task_repo_impacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  areas_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 1.0,
  reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_task_repo_impacts_task_id ON task_repo_impacts(task_id);
CREATE INDEX idx_task_repo_impacts_repository_id ON task_repo_impacts(repository_id);
