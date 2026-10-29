CREATE TABLE listing_assessments (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('unknown', 'low', 'medium', 'high')),
  functionality TEXT NOT NULL CHECK (functionality IN ('not-tested', 'documented', 'verified', 'blocked')),
  permissions TEXT NOT NULL,
  findings TEXT NOT NULL,
  evidence TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  assessor_id TEXT NOT NULL REFERENCES users(id)
);
