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
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  start_date         TEXT NOT NULL,
  end_date           TEXT NOT NULL,
  phase              TEXT NOT NULL,
  description        TEXT NOT NULL,
  progress           INTEGER DEFAULT 0,
  reading_title      TEXT DEFAULT '《追忆似水年华》',
  reading_subtitle   TEXT DEFAULT '第三卷，缓慢推进中',
  learning_title     TEXT DEFAULT 'Astro + CF 全栈',
  learning_subtitle  TEXT DEFAULT '进度 45%',
  researching_title  TEXT DEFAULT '半封闭水体碳汇',
  researching_subtitle TEXT DEFAULT '数据整理阶段',
  listening_title    TEXT DEFAULT '浮遊大陸アルジェス',
  listening_subtitle TEXT DEFAULT 'Falcom Sound Team',
  badge_text         TEXT DEFAULT '高投入推进中',
  project_description TEXT DEFAULT '',
  project_screenshot TEXT DEFAULT '',
  updated_at         TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- /now 微日志
-- ============================================================

CREATE TABLE IF NOT EXISTS now_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);