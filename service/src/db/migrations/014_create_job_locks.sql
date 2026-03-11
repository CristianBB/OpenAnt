CREATE TABLE job_locks (
  job_name TEXT PRIMARY KEY,
  locked_at TEXT NOT NULL,
  lock_ttl_sec INTEGER NOT NULL DEFAULT 300,
  locked_by TEXT NOT NULL DEFAULT ''
);
