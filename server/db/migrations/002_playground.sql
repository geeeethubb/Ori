-- Redesign (session 2): additive only. Existing rows, ids and specs are untouched.

-- Owner-scoped media (photos). Bytes live on disk under MEDIA_DIR; this table is the index.
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  file_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_media_owner ON media(owner_id, created_at);

-- What the person shared with the Agent: a note, a link, a screenshot. read_status is honest:
-- read | metadata_only | not_read | unavailable (see shared/context.ts).
CREATE TABLE captures (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  url TEXT,
  link_meta_json TEXT,
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  read_status TEXT NOT NULL,
  source_label TEXT NOT NULL,
  is_example INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_captures_owner ON captures(owner_id, created_at);

-- The agent's reply to one capture (proposals are rows in recommendations with capture_id set).
CREATE TABLE agent_replies (
  capture_id TEXT PRIMARY KEY REFERENCES captures(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  question TEXT,
  generated_by TEXT NOT NULL,
  fallback_reason TEXT,
  created_at TEXT NOT NULL
);

-- Proposals born from a capture keep a pointer to it; Playground refreshes never delete them.
ALTER TABLE recommendations ADD COLUMN capture_id TEXT;
-- Apps remember the capture they grew out of (for "your saves became things you do").
ALTER TABLE apps ADD COLUMN source_capture_id TEXT;
