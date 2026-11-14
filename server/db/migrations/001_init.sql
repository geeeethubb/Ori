-- Identity ---------------------------------------------------------------
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  trial_started_at TEXT NOT NULL,
  trial_ends_at TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial',
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Apps: identity, versioned specs, records, events ---------------------------
CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tagline TEXT,
  icon_symbol TEXT NOT NULL,
  icon_color TEXT NOT NULL,
  purpose TEXT NOT NULL,
  pattern TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT,
  source_recommendation_id TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_apps_owner ON apps(owner_id);

CREATE TABLE app_versions (
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  spec_json TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  origin TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_id, version)
);

CREATE TABLE app_records (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  values_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_records_app ON app_records(app_id, deleted_at);

CREATE TABLE app_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX idx_events_app ON app_events(app_id, at);

CREATE TABLE revision_proposals (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  request TEXT NOT NULL,
  proposal_json TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_at TEXT NOT NULL
);

-- Context, profile, recommendations ----------------------------------------
CREATE TABLE context_sources (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  approved INTEGER NOT NULL DEFAULT 1,
  imported_at TEXT NOT NULL
);
CREATE INDEX idx_sources_owner ON context_sources(owner_id);

CREATE TABLE profile_facts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL,
  conflict_group TEXT,
  evidence TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_facts_owner ON profile_facts(owner_id, status);

CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  built_app_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_recs_owner ON recommendations(owner_id, status);

CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  ok INTEGER NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX idx_ai_usage_owner ON ai_usage(owner_id, at);
