-- ============================================================
-- now_messages — /now 页面留言板
-- 执行: sqlite3 data/app.db < db/now_messages.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS now_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  author     TEXT NOT NULL DEFAULT '访客',
  email      TEXT DEFAULT '',
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
