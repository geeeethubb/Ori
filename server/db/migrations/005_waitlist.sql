-- The homepage waitlist: email addresses people chose to leave, stored for the founder to contact later.
-- Nothing is sent from the app. Only the address, where it was left and when are kept (no IP, no device data).
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'landing',
  created_at TEXT NOT NULL
);
