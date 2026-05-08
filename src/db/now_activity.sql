CREATE TABLE IF NOT EXISTS now_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);