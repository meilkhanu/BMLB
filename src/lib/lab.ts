// ============================================================
// src/lib/lab.ts — 实验室数据读取
//
// 数据源：SQLite lab_apps 表（管理后台/手动 INSERT 维护）
// 页面：src/pages/lab.astro 渲染
// ============================================================

export interface LabApp {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;          // emoji 或图片路径，留空时页面用默认图标
  category: string;      // tool(工具) / toy(玩具) / other(其他)
  path: string;          // 内建页 /lab/xxx 或静态 /lab-apps/xxx/index.html 或外链
  sortOrder: number;
  published: boolean;
}

export const LAB_CATEGORIES: { id: string; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'tool', label: '工具' },
  { id: 'toy', label: '玩具' },
  { id: 'other', label: '其他' },
];

export function categoryLabel(id: string): string {
  return LAB_CATEGORIES.find((c) => c.id === id)?.label || '其他';
}

export async function getLabApps(db: any): Promise<LabApp[]> {
  try {
    const { results } = await db
      .prepare("SELECT * FROM lab_apps WHERE published = 1 ORDER BY sort_order ASC, id ASC")
      .all();
    return (results || []).map((row: any) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description || '',
      icon: row.icon || '',
      category: row.category || 'other',
      path: row.path,
      sortOrder: row.sort_order ?? 0,
      published: !!row.published,
    }));
  } catch (e: any) {
    console.error('[lab] 查询失败:', e?.message || e);
    return [];
  }
}
