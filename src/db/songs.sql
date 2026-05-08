
-- ============================================================
-- 音乐播放器
-- ============================================================

CREATE TABLE IF NOT EXISTS songs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  artist      TEXT NOT NULL DEFAULT '',
  album       TEXT DEFAULT '',
  cover_url   TEXT DEFAULT '',
  audio_url   TEXT NOT NULL,
  duration    INTEGER DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);