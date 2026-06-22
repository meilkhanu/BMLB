// ============================================================
// src/lib/about.ts
// /about 页面 — API handler + 数据访问层
//
// GET    /api/about          → 获取全部数据（公开）
// PUT    /api/about/config   → 更新配置（需登录）
// GET    /api/about/skills   → 获取技能列表（公开）
// POST   /api/about/skills   → 新增技能（需登录）
// DELETE /api/about/skills?id=X → 删除技能（需登录）
// GET    /api/about/works    → 获取作品列表（公开）
// POST   /api/about/works    → 新增作品（需登录）
// PUT    /api/about/works    → 更新作品（需登录）
// DELETE /api/about/works?id=X → 删除作品（需登录）
// GET    /api/about/links    → 获取链接列表（公开）
// POST   /api/about/links    → 新增链接（需登录）
// PUT    /api/about/links    → 更新链接（需登录）
// DELETE /api/about/links?id=X → 删除链接（需登录）
// ============================================================

import type { APIContext } from "astro";
import { getDb, getKV } from "./db";
import { verifySession } from "./auth";

// ============================================================
// 工具函数
// ============================================================

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}


async function requireAuth(request: Request, kv: any) {
  const authed = await verifySession(request, kv);
  if (!authed) {
    throw new Response(JSON.stringify({ error: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// —— 类型定义 ——

export interface AboutConfig {
  heroImage: string;
  heroSubtitle: string;
  breadcrumbSub: string;
  introTitle: string;
  introParagraphs: string[];
  basicTitle: string;
  basicItems: { label: string; value: string }[];
  skillsTitle: string;
  statusTitle: string;
  statusText: string;
  altTitle: string;
  altDescription: string;
}

export interface AboutSkill {
  id: number;
  name: string;
  sortOrder: number;
}

export interface AboutWork {
  id: number;
  title: string;
  description: string;
  tags: string[];
  image: string;
  sortOrder: number;
}

export interface AboutLink {
  id: number;
  title: string;
  description: string;
  url: string;
  actionText: string;
  sortOrder: number;
}

// —— Fallback 默认值 ——

const DEFAULT_CONFIG: AboutConfig = {
  heroImage: '/images/d402c0a48dd402c0a48d.avif',
  heroSubtitle: 'CAD · Parametric Design · Structural Modeling',
  breadcrumbSub: '关于',
  introTitle: '自我介绍',
  introParagraphs: [
    '（这里填写你的自我介绍第一段）',
    '（这里填写你的自我介绍第二段）',
    '（这里填写你的研究方向 / 兴趣 / 方法论）',
  ],
  basicTitle: '基础信息',
  basicItems: [
    { label: 'Name', value: 'MEil fanc' },
    { label: 'Focus', value: 'CAD / Parametric Design' },
    { label: 'Location', value: 'Singapore' },
  ],
  skillsTitle: '技能栈',
  statusTitle: '当前状态',
  statusText: 'Exploring parametric structural systems & CAD workflow optimization.',
  altTitle: '异次元之旅 / Interlinked System',
  altDescription: '二次元萌站备案互通系统构建中...',
};

const DEFAULT_SKILLS: AboutSkill[] = [
  { id: 1, name: 'SolidWorks', sortOrder: 0 },
  { id: 2, name: 'Fusion 360', sortOrder: 1 },
  { id: 3, name: 'Blender', sortOrder: 2 },
  { id: 4, name: 'Rhino', sortOrder: 3 },
  { id: 5, name: 'Grasshopper', sortOrder: 4 },
  { id: 6, name: 'CAD', sortOrder: 5 },
  { id: 7, name: 'Parametric', sortOrder: 6 },
];

const DEFAULT_WORKS: AboutWork[] = [
  {
    id: 1,
    title: 'Parametric Structure Study',
    description: '基于参数化建模的结构系统探索，强调形态生成逻辑。',
    tags: ['Grasshopper', 'Parametric', 'Rhino'],
    image: '/works/work1.jpg',
    sortOrder: 0,
  },
  {
    id: 2,
    title: 'Mechanical Assembly Model',
    description: '机械结构装配建模与工程表达研究。',
    tags: ['SolidWorks', 'CAD', 'Assembly'],
    image: '/works/work2.jpg',
    sortOrder: 1,
  },
  {
    id: 3,
    title: 'Wireframe Spatial System',
    description: '空间结构线框化表达与视觉化建模实验。',
    tags: ['Blender', 'Wireframe', 'Visualization'],
    image: '/works/work3.jpg',
    sortOrder: 2,
  },
];

const DEFAULT_LINKS: AboutLink[] = [
  {
    id: 1,
    title: '主站入口',
    description: '进入主项目 / 博客 / 系统',
    url: 'https://your-main-site.com',
    actionText: 'Visit →',
    sortOrder: 0,
  },
  {
    id: 2,
    title: '备用站 / 项目站',
    description: '作品集 / 实验性内容 / 镜像系统',
    url: 'https://your-secondary-site.com',
    actionText: 'Explore →',
    sortOrder: 1,
  },
];

// —— 数据转换 ——

function rowToConfig(row: any): AboutConfig {
  if (!row) return DEFAULT_CONFIG;
  return {
    heroImage: row.hero_image || DEFAULT_CONFIG.heroImage,
    heroSubtitle: row.hero_subtitle || DEFAULT_CONFIG.heroSubtitle,
    breadcrumbSub: row.breadcrumb_sub || DEFAULT_CONFIG.breadcrumbSub,
    introTitle: row.intro_title || DEFAULT_CONFIG.introTitle,
    introParagraphs: safeJson(row.intro_paragraphs, DEFAULT_CONFIG.introParagraphs),
    basicTitle: row.basic_title || DEFAULT_CONFIG.basicTitle,
    basicItems: safeJson(row.basic_items, DEFAULT_CONFIG.basicItems),
    skillsTitle: row.skills_title || DEFAULT_CONFIG.skillsTitle,
    statusTitle: row.status_title || DEFAULT_CONFIG.statusTitle,
    statusText: row.status_text || DEFAULT_CONFIG.statusText,
    altTitle: row.alt_title || DEFAULT_CONFIG.altTitle,
    altDescription: row.alt_description || DEFAULT_CONFIG.altDescription,
  };
}

function rowToSkill(row: any): AboutSkill {
  if (!row) return { id: 0, name: '', sortOrder: 0 };
  return { id: row.id, name: row.name, sortOrder: row.sort_order ?? 0 };
}

function rowToWork(row: any): AboutWork {
  if (!row) return { id: 0, title: '', description: '', tags: [], image: '', sortOrder: 0 };
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    tags: safeJson(row.tags, []),
    image: row.image || '',
    sortOrder: row.sort_order ?? 0,
  };
}

function rowToLink(row: any): AboutLink {
  if (!row) return { id: 0, title: '', description: '', url: '', actionText: 'Visit →', sortOrder: 0 };
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    url: row.url,
    actionText: row.action_text || 'Visit →',
    sortOrder: row.sort_order ?? 0,
  };
}

function safeJson<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string') return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

// —— 公开查询函数 ——

export async function getAboutConfig(db: any): Promise<AboutConfig> {
  try {
    const row = await db.prepare('SELECT * FROM about_config WHERE id = 1').first();
    if (row) return rowToConfig(row);
  } catch (e: any) {
    console.error('[about] config 查询失败:', e?.message || e);
  }
  return DEFAULT_CONFIG;
}

export async function getAboutSkills(db: any): Promise<AboutSkill[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM about_skills ORDER BY sort_order ASC, id ASC').all();
    if (results && results.length > 0) return results.map(rowToSkill);
  } catch (e: any) {
    console.error('[about] skills 查询失败:', e?.message || e);
  }
  return DEFAULT_SKILLS;
}

export async function getAboutWorks(db: any): Promise<AboutWork[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM about_works ORDER BY sort_order ASC, id ASC').all();
    if (results && results.length > 0) return results.map(rowToWork);
  } catch (e: any) {
    console.error('[about] works 查询失败:', e?.message || e);
  }
  return DEFAULT_WORKS;
}

export async function getAboutLinks(db: any): Promise<AboutLink[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM about_links ORDER BY sort_order ASC, id ASC').all();
    if (results && results.length > 0) return results.map(rowToLink);
  } catch (e: any) {
    console.error('[about] links 查询失败:', e?.message || e);
  }
  return DEFAULT_LINKS;
}

// ============================================================
// API: GET /api/about — 获取全部数据（公开）
// ============================================================

async function handleGetAll(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  const [config, skills, works, links] = await Promise.all([
    getAboutConfig(db),
    getAboutSkills(db),
    getAboutWorks(db),
    getAboutLinks(db),
  ]);

  return json({ config, skills, works, links });
}

// ============================================================
// API: PUT /api/about/config — 更新配置（需登录）
// ============================================================

async function handlePutConfig(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try {
    await requireAuth(ctx.request, getKV());
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "无效的请求体" }, 400);
  }

  const {
    heroImage, heroSubtitle, breadcrumbSub,
    introTitle, introParagraphs,
    basicTitle, basicItems,
    skillsTitle, statusTitle, statusText,
    altTitle, altDescription,
  } = body;

  try {
    const existing = await db.prepare("SELECT id FROM about_config WHERE id = 1").first();

    const introParagraphsJson = introParagraphs ? JSON.stringify(introParagraphs) : undefined;
    const basicItemsJson = basicItems ? JSON.stringify(basicItems) : undefined;

    if (existing) {
      const sets: string[] = [];
      const vals: any[] = [];

      if (heroImage !== undefined) { sets.push("hero_image = ?"); vals.push(heroImage); }
      if (heroSubtitle !== undefined) { sets.push("hero_subtitle = ?"); vals.push(heroSubtitle); }
      if (breadcrumbSub !== undefined) { sets.push("breadcrumb_sub = ?"); vals.push(breadcrumbSub); }
      if (introTitle !== undefined) { sets.push("intro_title = ?"); vals.push(introTitle); }
      if (introParagraphsJson !== undefined) { sets.push("intro_paragraphs = ?"); vals.push(introParagraphsJson); }
      if (basicTitle !== undefined) { sets.push("basic_title = ?"); vals.push(basicTitle); }
      if (basicItemsJson !== undefined) { sets.push("basic_items = ?"); vals.push(basicItemsJson); }
      if (skillsTitle !== undefined) { sets.push("skills_title = ?"); vals.push(skillsTitle); }
      if (statusTitle !== undefined) { sets.push("status_title = ?"); vals.push(statusTitle); }
      if (statusText !== undefined) { sets.push("status_text = ?"); vals.push(statusText); }
      if (altTitle !== undefined) { sets.push("alt_title = ?"); vals.push(altTitle); }
      if (altDescription !== undefined) { sets.push("alt_description = ?"); vals.push(altDescription); }

      if (sets.length > 0) {
        sets.push("updated_at = datetime('now')");
        await db.prepare(`UPDATE about_config SET ${sets.join(", ")} WHERE id = 1`).bind(...vals).run();
      }
    } else {
      await db.prepare(
        `INSERT INTO about_config (id, hero_image, hero_subtitle, breadcrumb_sub, intro_title, intro_paragraphs, basic_title, basic_items, skills_title, status_title, status_text, alt_title, alt_description)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        heroImage ?? DEFAULT_CONFIG.heroImage,
        heroSubtitle ?? DEFAULT_CONFIG.heroSubtitle,
        breadcrumbSub ?? DEFAULT_CONFIG.breadcrumbSub,
        introTitle ?? DEFAULT_CONFIG.introTitle,
        introParagraphsJson ?? JSON.stringify(DEFAULT_CONFIG.introParagraphs),
        basicTitle ?? DEFAULT_CONFIG.basicTitle,
        basicItemsJson ?? JSON.stringify(DEFAULT_CONFIG.basicItems),
        skillsTitle ?? DEFAULT_CONFIG.skillsTitle,
        statusTitle ?? DEFAULT_CONFIG.statusTitle,
        statusText ?? DEFAULT_CONFIG.statusText,
        altTitle ?? DEFAULT_CONFIG.altTitle,
        altDescription ?? DEFAULT_CONFIG.altDescription,
      ).run();
    }

    const row = await db.prepare("SELECT * FROM about_config WHERE id = 1").first();
    return json(rowToConfig(row));
  } catch (e: any) {
    console.error("PUT /api/about/config error:", e);
    return json({ error: "更新失败" }, 500);
  }
}

// ============================================================
// Skills: GET / POST / PUT / DELETE
// ============================================================

async function handleGetSkills(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);
  return json(await getAboutSkills(db));
}

async function handlePostSkill(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try { await requireAuth(ctx.request, getKV()); } catch (e) {
    if (e instanceof Response) return e; throw e;
  }

  let body: any;
  try { body = await ctx.request.json(); } catch { return json({ error: "无效的请求体" }, 400); }

  const { name, sortOrder } = body;
  if (!name) return json({ error: "缺少必填字段: name" }, 400);

  try {
    const result = await db.prepare(
      "INSERT INTO about_skills (name, sort_order) VALUES (?, ?)"
    ).bind(name, sortOrder ?? 0).run();

    const row = await db.prepare("SELECT * FROM about_skills WHERE id = ?").bind(result.meta.last_row_id).first();
    return json(rowToSkill(row));
  } catch (e: any) {
    console.error("POST /api/about/skills error:", e);
    return json({ error: "新增失败" }, 500);
  }
}

async function handlePutSkill(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try { await requireAuth(ctx.request, getKV()); } catch (e) {
    if (e instanceof Response) return e; throw e;
  }

  let body: any;
  try { body = await ctx.request.json(); } catch { return json({ error: "无效的请求体" }, 400); }

  const { id, name, sortOrder } = body;
  if (!id) return json({ error: "缺少必填字段: id" }, 400);

  try {
    const sets: string[] = [];
    const vals: any[] = [];

    if (name !== undefined) { sets.push("name = ?"); vals.push(name); }
    if (sortOrder !== undefined) { sets.push("sort_order = ?"); vals.push(sortOrder); }

    if (sets.length === 0) return json({ error: "没有要更新的字段" }, 400);

    vals.push(Number(id));
    await db.prepare(`UPDATE about_skills SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();

    const row = await db.prepare("SELECT * FROM about_skills WHERE id = ?").bind(Number(id)).first();
    return json(rowToSkill(row));
  } catch (e: any) {
    console.error("PUT /api/about/skills error:", e);
    return json({ error: "更新失败" }, 500);
  }
}

async function handleDeleteSkill(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try { await requireAuth(ctx.request, getKV()); } catch (e) {
    if (e instanceof Response) return e; throw e;
  }

  const url = new URL(ctx.request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "缺少参数: id" }, 400);

  try {
    await db.prepare("DELETE FROM about_skills WHERE id = ?").bind(Number(id)).run();
    return json({ success: true });
  } catch (e: any) {
    console.error("DELETE /api/about/skills error:", e);
    return json({ error: "删除失败" }, 500);
  }
}

// ============================================================
// Works: GET / POST / PUT / DELETE
// ============================================================

async function handleGetWorks(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);
  return json(await getAboutWorks(db));
}

async function handlePostWork(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try { await requireAuth(ctx.request, getKV()); } catch (e) {
    if (e instanceof Response) return e; throw e;
  }

  let body: any;
  try { body = await ctx.request.json(); } catch { return json({ error: "无效的请求体" }, 400); }

  const { title, description, tags, image, sortOrder } = body;
  if (!title) return json({ error: "缺少必填字段: title" }, 400);

  try {
    const result = await db.prepare(
      "INSERT INTO about_works (title, description, tags, image, sort_order) VALUES (?, ?, ?, ?, ?)"
    ).bind(title, description ?? "", JSON.stringify(tags ?? []), image ?? "", sortOrder ?? 0).run();

    const row = await db.prepare("SELECT * FROM about_works WHERE id = ?").bind(result.meta.last_row_id).first();
    return json(rowToWork(row));
  } catch (e: any) {
    console.error("POST /api/about/works error:", e);
    return json({ error: "新增失败" }, 500);
  }
}

async function handlePutWork(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try { await requireAuth(ctx.request, getKV()); } catch (e) {
    if (e instanceof Response) return e; throw e;
  }

  let body: any;
  try { body = await ctx.request.json(); } catch { return json({ error: "无效的请求体" }, 400); }

  const { id, title, description, tags, image, sortOrder } = body;
  if (!id) return json({ error: "缺少必填字段: id" }, 400);

  try {
    const sets: string[] = [];
    const vals: any[] = [];

    if (title !== undefined) { sets.push("title = ?"); vals.push(title); }
    if (description !== undefined) { sets.push("description = ?"); vals.push(description); }
    if (tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(tags)); }
    if (image !== undefined) { sets.push("image = ?"); vals.push(image); }
    if (sortOrder !== undefined) { sets.push("sort_order = ?"); vals.push(sortOrder); }

    if (sets.length === 0) return json({ error: "没有要更新的字段" }, 400);

    vals.push(Number(id));
    await db.prepare(`UPDATE about_works SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();

    const row = await db.prepare("SELECT * FROM about_works WHERE id = ?").bind(Number(id)).first();
    return json(rowToWork(row));
  } catch (e: any) {
    console.error("PUT /api/about/works error:", e);
    return json({ error: "更新失败" }, 500);
  }
}

async function handleDeleteWork(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try { await requireAuth(ctx.request, getKV()); } catch (e) {
    if (e instanceof Response) return e; throw e;
  }

  const url = new URL(ctx.request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "缺少参数: id" }, 400);

  try {
    await db.prepare("DELETE FROM about_works WHERE id = ?").bind(Number(id)).run();
    return json({ success: true });
  } catch (e: any) {
    console.error("DELETE /api/about/works error:", e);
    return json({ error: "删除失败" }, 500);
  }
}

// ============================================================
// Links: GET / POST / PUT / DELETE
// ============================================================

async function handleGetLinks(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);
  return json(await getAboutLinks(db));
}

async function handlePostLink(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try { await requireAuth(ctx.request, getKV()); } catch (e) {
    if (e instanceof Response) return e; throw e;
  }

  let body: any;
  try { body = await ctx.request.json(); } catch { return json({ error: "无效的请求体" }, 400); }

  const { title, description, url, actionText, sortOrder } = body;
  if (!title || !url) return json({ error: "缺少必填字段: title, url" }, 400);

  try {
    const result = await db.prepare(
      "INSERT INTO about_links (title, description, url, action_text, sort_order) VALUES (?, ?, ?, ?, ?)"
    ).bind(title, description ?? "", url, actionText ?? "Visit →", sortOrder ?? 0).run();

    const row = await db.prepare("SELECT * FROM about_links WHERE id = ?").bind(result.meta.last_row_id).first();
    return json(rowToLink(row));
  } catch (e: any) {
    console.error("POST /api/about/links error:", e);
    return json({ error: "新增失败" }, 500);
  }
}

async function handlePutLink(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try { await requireAuth(ctx.request, getKV()); } catch (e) {
    if (e instanceof Response) return e; throw e;
  }

  let body: any;
  try { body = await ctx.request.json(); } catch { return json({ error: "无效的请求体" }, 400); }

  const { id, title, description, url, actionText, sortOrder } = body;
  if (!id) return json({ error: "缺少必填字段: id" }, 400);

  try {
    const sets: string[] = [];
    const vals: any[] = [];

    if (title !== undefined) { sets.push("title = ?"); vals.push(title); }
    if (description !== undefined) { sets.push("description = ?"); vals.push(description); }
    if (url !== undefined) { sets.push("url = ?"); vals.push(url); }
    if (actionText !== undefined) { sets.push("action_text = ?"); vals.push(actionText); }
    if (sortOrder !== undefined) { sets.push("sort_order = ?"); vals.push(sortOrder); }

    if (sets.length === 0) return json({ error: "没有要更新的字段" }, 400);

    vals.push(Number(id));
    await db.prepare(`UPDATE about_links SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();

    const row = await db.prepare("SELECT * FROM about_links WHERE id = ?").bind(Number(id)).first();
    return json(rowToLink(row));
  } catch (e: any) {
    console.error("PUT /api/about/links error:", e);
    return json({ error: "更新失败" }, 500);
  }
}

async function handleDeleteLink(ctx: APIContext): Promise<Response> {
  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try { await requireAuth(ctx.request, getKV()); } catch (e) {
    if (e instanceof Response) return e; throw e;
  }

  const url = new URL(ctx.request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "缺少参数: id" }, 400);

  try {
    await db.prepare("DELETE FROM about_links WHERE id = ?").bind(Number(id)).run();
    return json({ success: true });
  } catch (e: any) {
    console.error("DELETE /api/about/links error:", e);
    return json({ error: "删除失败" }, 500);
  }
}

// ============================================================
// 主入口 — handleAbout
// ============================================================

export async function handleAbout(ctx: APIContext): Promise<Response> {
  const url = new URL(ctx.request.url);
  const path = url.pathname;
  const method = ctx.request.method;

  // /api/about/config
  if (path === "/api/about/config") {
    if (method === "PUT") return handlePutConfig(ctx);
    return json({ error: "Method Not Allowed" }, 405);
  }

  // /api/about/skills
  if (path === "/api/about/skills") {
    if (method === "GET") return handleGetSkills(ctx);
    if (method === "POST") return handlePostSkill(ctx);
    if (method === "PUT") return handlePutSkill(ctx);
    if (method === "DELETE") return handleDeleteSkill(ctx);
    return json({ error: "Method Not Allowed" }, 405);
  }

  // /api/about/works
  if (path === "/api/about/works") {
    if (method === "GET") return handleGetWorks(ctx);
    if (method === "POST") return handlePostWork(ctx);
    if (method === "PUT") return handlePutWork(ctx);
    if (method === "DELETE") return handleDeleteWork(ctx);
    return json({ error: "Method Not Allowed" }, 405);
  }

  // /api/about/links
  if (path === "/api/about/links") {
    if (method === "GET") return handleGetLinks(ctx);
    if (method === "POST") return handlePostLink(ctx);
    if (method === "PUT") return handlePutLink(ctx);
    if (method === "DELETE") return handleDeleteLink(ctx);
    return json({ error: "Method Not Allowed" }, 405);
  }

  // /api/about — 全部数据
  if (path === "/api/about" || path === "/api/about/") {
    if (method === "GET") return handleGetAll(ctx);
    return json({ error: "Method Not Allowed" }, 405);
  }

  return json({ error: "Not Found" }, 404);
}
