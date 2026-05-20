-- ============================================================
-- comments — 文章评论表
-- 执行: wrangler d1 execute <db> --file=db/comments.sql
-- 与 now_messages 表独立，不冲突
-- ============================================================

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author      TEXT NOT NULL DEFAULT '访客',
  email       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,
  target_slug TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_slug);
