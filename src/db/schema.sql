-- ============================================================
-- 贝谟拉比 · 数据库建表语句
-- 数据库类型：Cloudflare D1 (SQLite 兼容)
-- ============================================================

CREATE TABLE posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,           -- URL 标识，如 wang-zhan-shang-xian
  title         TEXT NOT NULL,                  -- 文章标题
  content       TEXT NOT NULL,                  -- HTML 正文（TinyMCE 输出）
  excerpt       TEXT DEFAULT '',                -- 摘要，不填则自动截取正文前 150 字
  category_id   TEXT NOT NULL,                  -- notes/critique/stack/body/transit/archive
  tags          TEXT DEFAULT '[]',              -- JSON 数组字符串，如 ["建站","Astro"]
  cover_image   TEXT,                           -- 封面图 URL（可选）
  published_at  TEXT,                           -- 手动设置的对外显示日期
  created_at    TEXT DEFAULT (datetime('now')), -- 自动写入
  updated_at    TEXT DEFAULT (datetime('now')), -- 自动更新
  status        TEXT DEFAULT 'draft'            -- 'draft' | 'published'
);

-- 按分类筛选
CREATE INDEX idx_posts_category ON posts(category_id);

-- 按状态筛选
CREATE INDEX idx_posts_status ON posts(status);

-- 按发布日期排序
CREATE INDEX idx_posts_published ON posts(published_at);

-- 组合索引（首页和归档页最常用）
CREATE INDEX idx_posts_category_status_date ON posts(category_id, status, published_at);
