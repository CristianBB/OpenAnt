CREATE TABLE code_index_files (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  language TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(repository_id, file_path)
);

CREATE INDEX idx_code_index_repo ON code_index_files(repository_id);
