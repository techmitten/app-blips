CREATE TABLE IF NOT EXISTS onboarding_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_onboarding_created_at
  ON onboarding_responses (created_at);
