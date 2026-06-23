-- ============================================================
-- /about 页面数据表
-- ============================================================

-- 关于页配置（单行表：hero + intro + basic info + status）
CREATE TABLE IF NOT EXISTS about_config (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  hero_image      TEXT DEFAULT '/images/d402c0a48dd402c0a48d.avif',
  hero_subtitle   TEXT DEFAULT 'CAD · Parametric Design · Structural Modeling',
  breadcrumb_sub  TEXT DEFAULT '关于',
  intro_title     TEXT DEFAULT '自我介绍',
  intro_paragraphs TEXT DEFAULT '["（这里填写你的自我介绍第一段）","（这里填写你的自我介绍第二段）","（这里填写你的研究方向 / 兴趣 / 方法论）"]',
  basic_title     TEXT DEFAULT '基础信息',
  basic_items     TEXT DEFAULT '[{"label":"Name","value":"MEil fanc"},{"label":"Focus","value":"CAD / Parametric Design"},{"label":"Location","value":"Singapore"}]',
  skills_title    TEXT DEFAULT '技能栈',
  status_title    TEXT DEFAULT '当前状态',
  status_text     TEXT DEFAULT 'Exploring parametric structural systems & CAD workflow optimization.',
  alt_title       TEXT DEFAULT '异次元之旅 / Interlinked System',
  alt_description TEXT DEFAULT '二次元萌站备案互通系统构建中...',
  updated_at      TEXT DEFAULT (datetime('now'))
);

ALTER TABLE about_config ADD COLUMN index_hero_image TEXT DEFAULT '/images/hero-bg.avif';
ALTER TABLE about_config ADD COLUMN index_hero_position TEXT DEFAULT 'center 40%';
ALTER TABLE about_config ADD COLUMN about_hero_position TEXT DEFAULT 'center 15%';
ALTER TABLE about_config ADD COLUMN avatar TEXT DEFAULT '/images/avatar.avif';

-- 技能列表
CREATE TABLE IF NOT EXISTS about_skills (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- 作品列表
CREATE TABLE IF NOT EXISTS about_works (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  description TEXT DEFAULT '',
  tags       TEXT DEFAULT '[]',
  image      TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

-- CTA 链接
CREATE TABLE IF NOT EXISTS about_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  url         TEXT NOT NULL,
  action_text TEXT DEFAULT 'Visit →',
  sort_order  INTEGER DEFAULT 0
);

ALTER TABLE about_works ADD COLUMN slug TEXT DEFAULT '';
ALTER TABLE about_works ADD COLUMN content TEXT DEFAULT '';
ALTER TABLE about_works ADD COLUMN gallery TEXT DEFAULT '[]';
ALTER TABLE about_works ADD COLUMN links TEXT DEFAULT '[]';
ALTER TABLE about_works ADD COLUMN featured INTEGER DEFAULT 0;
