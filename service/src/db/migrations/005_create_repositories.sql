CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  github_repo_id INTEGER,
  selected INTEGER NOT NULL DEFAULT 0,
  analysis_json TEXT,
  analysis_override_json TEXT,
  last_analyzed_at TEXT,
  UNIQUE(project_id, provider, owner, name)
);

CREATE INDEX idx_repositories_project_id ON repositories(project_id);
