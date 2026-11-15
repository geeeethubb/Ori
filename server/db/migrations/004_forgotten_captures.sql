-- Velocity review follow-ups (additive). A separate file because 003 is already applied on existing databases.

-- The id of a forgotten share is never accepted again, so a retried send cannot bring it back or relearn
-- from it. Only the id, its owner and when: nothing of what was shared is kept.
CREATE TABLE IF NOT EXISTS forgotten_captures (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  forgotten_at TEXT NOT NULL
);

-- When an entry was last changed by hand (an edit), as opposed to a retried save of the same new entry
-- updating it. A retried save may update an entry only while nobody has edited it.
ALTER TABLE app_records ADD COLUMN edited_at TEXT;
-- Before this column existed, an edit was the only way an entry changed after it was saved.
UPDATE app_records SET edited_at = updated_at WHERE updated_at <> created_at;
