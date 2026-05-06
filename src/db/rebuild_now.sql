-- ============================================================
-- 重建 now_status 表（会清空数据！）
-- ============================================================

DROP TABLE IF EXISTS now_status;

CREATE TABLE now_status (
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
  updated_at         TEXT DEFAULT (datetime('now'))
);