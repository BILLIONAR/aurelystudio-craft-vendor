CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
