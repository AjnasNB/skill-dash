CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
  verified_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX login_token_expiry ON login_tokens(expires_at);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX session_expiry ON sessions(expires_at);
CREATE TABLE listings (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL,
  name TEXT NOT NULL, tagline TEXT NOT NULL, description TEXT NOT NULL,
  website TEXT NOT NULL, source_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL, pricing TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
  reviewed_at TEXT, reviewer_id TEXT REFERENCES users(id), review_note TEXT,
  review_checks TEXT, UNIQUE(website)
);
CREATE INDEX listing_status_created ON listings(status, created_at);
CREATE TABLE votes (
  listing_id TEXT NOT NULL REFERENCES listings(id),
  user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  PRIMARY KEY(listing_id, user_id)
);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id),
  kind TEXT NOT NULL, recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
  message_id TEXT, last_error TEXT, created_at TEXT NOT NULL,
  UNIQUE(listing_id, kind)
);
CREATE INDEX notification_due ON notifications(status, next_attempt_at);
