CREATE TABLE task_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('DUPLICATES', 'RELATED', 'DEPENDS_ON', 'BLOCKS', 'SAME_EPIC')),
  confidence REAL NOT NULL DEFAULT 1.0,
  reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_task_links_project_id ON task_links(project_id);
CREATE INDEX idx_task_links_from_task_id ON task_links(from_task_id);
CREATE INDEX idx_task_links_to_task_id ON task_links(to_task_id);
