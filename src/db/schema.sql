-- ============================================================
-- 贝谟拉比 · 数据库建表语句（幂等版）
-- ============================================================

CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  excerpt       TEXT DEFAULT '',
  category_id   TEXT NOT NULL,
  tags          TEXT DEFAULT '[]',
  cover_image   TEXT,
  published_at  TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  status        TEXT DEFAULT 'draft'
);

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);
CREATE INDEX IF NOT EXISTS idx_posts_category_status_date ON posts(category_id, status, published_at);

CREATE TABLE IF NOT EXISTS now_status (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  phase        TEXT NOT NULL,
  description  TEXT NOT NULL,
  progress     INTEGER DEFAULT 0,
  updated_at   TEXT DEFAULT (datetime('now'))
);