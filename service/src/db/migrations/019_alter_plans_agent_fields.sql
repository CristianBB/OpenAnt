ALTER TABLE plans ADD COLUMN agent_phase TEXT DEFAULT 'idle'
  CHECK (agent_phase IN ('idle','analyzing','questioning','planning','chatting','implementing','done','error'));
ALTER TABLE plans ADD COLUMN agent_session_id TEXT;
ALTER TABLE plans ADD COLUMN agent_error TEXT;
