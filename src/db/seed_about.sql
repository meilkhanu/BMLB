-- ============================================================
-- about 页面种子数据（插入当前硬编码值，幂等）
-- ============================================================

-- config（单行表，不存在才插入）
INSERT OR IGNORE INTO about_config (id) VALUES (1);

-- skills
INSERT OR IGNORE INTO about_skills (id, name, sort_order) VALUES
  (1, 'SolidWorks',  0),
  (2, 'Fusion 360',  1),
  (3, 'Blender',     2),
  (4, 'Rhino',       3),
  (5, 'Grasshopper', 4),
  (6, 'CAD',         5),
  (7, 'Parametric',  6);

-- works
INSERT OR IGNORE INTO about_works (id, title, description, tags, image, sort_order) VALUES
  (1, 'Parametric Structure Study',  '基于参数化建模的结构系统探索，强调形态生成逻辑。',          '["Grasshopper","Parametric","Rhino"]', '/works/work1.jpg', 0),
  (2, 'Mechanical Assembly Model',   '机械结构装配建模与工程表达研究。',                        '["SolidWorks","CAD","Assembly"]',      '/works/work2.jpg', 1),
  (3, 'Wireframe Spatial System',    '空间结构线框化表达与视觉化建模实验。',                    '["Blender","Wireframe","Visualization"]', '/works/work3.jpg', 2);

-- links
INSERT OR IGNORE INTO about_links (id, title, description, url, action_text, sort_order) VALUES
  (1, '主站入口',        '进入主项目 / 博客 / 系统', 'https://your-main-site.com',    'Visit →',   0),
  (2, '备用站 / 项目站', '作品集 / 实验性内容 / 镜像系统', 'https://your-secondary-site.com', 'Explore →', 1);
