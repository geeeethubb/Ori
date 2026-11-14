-- 003: Velocity integration (additive only; no existing row is rewritten).
-- Things the agent was asked for that do not exist here (e.g. Spotify sync), stated plainly in its reply.
ALTER TABLE agent_replies ADD COLUMN unsupported_json TEXT;
-- Memory learned from one shared item points back at it, so "just keep it" and "forget" can remove it.
ALTER TABLE context_sources ADD COLUMN capture_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sources_capture ON context_sources(capture_id);
