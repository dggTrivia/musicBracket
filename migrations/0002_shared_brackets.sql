CREATE TABLE IF NOT EXISTS shared_brackets (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_brackets_created_at ON shared_brackets(created_at);
