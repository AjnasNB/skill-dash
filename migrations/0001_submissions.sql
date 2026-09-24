CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  skill_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE(repo, skill_path)
);
CREATE INDEX IF NOT EXISTS submissions_status_created ON submissions(status, created_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  client_key TEXT PRIMARY KEY,
  requests INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiration ON rate_limits(expires_at);
