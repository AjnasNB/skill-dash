ALTER TABLE listings ADD COLUMN agent_details TEXT NOT NULL DEFAULT '{}';
CREATE TABLE listing_contacts (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id),
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  phone_validation TEXT NOT NULL DEFAULT 'not-provided',
  created_at TEXT NOT NULL
);
