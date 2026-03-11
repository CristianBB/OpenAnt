ALTER TABLE repositories ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'IDLE';
ALTER TABLE repositories ADD COLUMN analysis_error TEXT;
