-- ============================================================
-- 迁移：给 now_status 表增加状态标签和项目描述字段
-- 执行方式：D1 控制台执行（不影响现有数据，新增列为 NULL）
--          应用层 now.ts 的 DEFAULT_STATUS 会为 NULL 兜底
-- ============================================================

ALTER TABLE now_status ADD COLUMN badge_text TEXT;
ALTER TABLE now_status ADD COLUMN project_description TEXT;

-- 如果表已有数据，设置初始值
UPDATE now_status SET
  badge_text = '高投入推进中',
  project_description = '目前处于高投入推进阶段，主要目标是完成第二阶段的功能开发和视觉优化。';
