-- ============================================================
-- 迁移：给 now_status 表增加项目截图字段
-- 执行方式：wrangler d1 execute <db> --file=db/migrate_now_add_screenshot.sql
-- （列若已存在则跳过，不影响数据）
-- ============================================================

ALTER TABLE now_status ADD COLUMN project_screenshot TEXT DEFAULT '';
