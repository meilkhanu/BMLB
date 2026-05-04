// ============================================================
// src/pages/api/posts.ts
// 文章 CRUD 接口（Astro API 路由，读写 Cloudflare D1）
//
// GET    /api/posts              → 公开列表（仅 published）
// GET    /api/posts?admin=1      → 管理列表（含草稿，需登录）
// GET    /api/posts?slug=xxx     → 单篇详情（仅 published）
// POST   /api/posts              → 创建文章（需登录）
// PUT    /api/posts              → 更新文章（需登录）
// DELETE /api/posts?slug=xxx     → 删除文章（需登录）
// ============================================================

import type { APIRoute } from "astro";
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

function getEnv(locals: any) {
  return locals.runtime?.env;
}

async function requireAuth(request: Request, env: any) {
  const authed = await verifySession(request, env);
  if (!authed) {
    throw new Response(JSON.stringify({ error: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// D1 蛇形列名 → 驼峰对象
function rowToPost(row: any) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    excerpt: row.excerpt || "",
    categoryId: row.category_id,
    tags: JSON.parse(row.tags || "[]"),
    coverImage: row.cover_image || "",
    publishedAt: row.published_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
  };
}

// ============================================================
// GET /api/posts
// ============================================================

export const GET: APIRoute = async ({ request, locals, url }) => {
  const env = getEnv(locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  const slug = url.searchParams.get("slug");
  const admin = url.searchParams.get("admin") === "1";

  try {
    // 管理端获取单篇
    if (slug && admin) {
      await requireAuth(request, env);
      const row = await env.DB.prepare(
        "SELECT * FROM posts WHERE slug = ?"
      )
        .bind(slug)
        .first();
      if (!row) return json({ error: "文章不存在" }, 404);
      return json(rowToPost(row));
    }

    // 公开获取单篇
    if (slug) {
      const row = await env.DB.prepare(
        "SELECT * FROM posts WHERE slug = ? AND status = 'published'"
      )
        .bind(slug)
        .first();
      if (!row) return json({ error: "文章不存在" }, 404);
      return json(rowToPost(row));
    }

    // 管理列表
    if (admin) {
      await requireAuth(request, env);
      const { results } = await env.DB.prepare(
        "SELECT * FROM posts ORDER BY updated_at DESC LIMIT 50"
      ).all();
      return json(results.map(rowToPost));
    }

    // 公开列表
    const category = url.searchParams.get("category") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

    let sql = "SELECT * FROM posts WHERE status = 'published'";
    const params: any[] = [];

    if (category) {
      sql += " AND category_id = ?";
      params.push(category);
    }

    sql += " ORDER BY published_at DESC LIMIT ?";
    params.push(limit);

    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return json(results.map(rowToPost));
  } catch (e: any) {
    if (e instanceof Response) throw e; // 401 等
    console.error("GET /api/posts error:", e);
    return json({ error: "服务器内部错误" }, 500);
  }
};

// ============================================================
// POST /api/posts — 创建文章
// ============================================================

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  try {
    await requireAuth(request, env);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的请求体" }, 400);
  }

  const { slug, title, content, excerpt = "", categoryId, tags = [], coverImage = "", publishedAt = "", status = "draft" } = body;

  if (!slug || !title || !content || !categoryId) {
    return json({ error: "缺少必填字段: slug, title, content, categoryId" }, 400);
  }

  // 检查 slug 唯一性
  const existing = await env.DB.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first();
  if (existing) {
    return json({ error: `slug "${slug}" 已存在` }, 409);
  }

  await env.DB.prepare(
    `INSERT INTO posts (slug, title, content, excerpt, category_id, tags, cover_image, published_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(slug, title, content, excerpt, categoryId, JSON.stringify(tags), coverImage, publishedAt, status).run();

  // 返回新建的文章
  const row = await env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first();
  return json(rowToPost(row), 201);
};

// ============================================================
// PUT /api/posts — 更新文章
// ============================================================

export const PUT: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  try {
    await requireAuth(request, env);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的请求体" }, 400);
  }

  const { slug } = body;
  if (!slug) return json({ error: "缺少 slug" }, 400);

  // 检查存在
  const existing = await env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first();
  if (!existing) return json({ error: "文章不存在" }, 404);

  // 构建动态 SET
  const fieldMap: Record<string, string> = {
    title: "title",
    content: "content",
    excerpt: "excerpt",
    categoryId: "category_id",
    coverImage: "cover_image",
    publishedAt: "published_at",
    status: "status",
  };

  const setClauses: string[] = [];
  const params: any[] = [];

  for (const [apiKey, dbKey] of Object.entries(fieldMap)) {
    if (body[apiKey] !== undefined) {
      setClauses.push(`${dbKey} = ?`);
      params.push(body[apiKey]);
    }
  }

  if (body.tags !== undefined) {
    setClauses.push("tags = ?");
    params.push(JSON.stringify(body.tags));
  }

  if (setClauses.length === 0) {
    return json({ error: "没有要更新的字段" }, 400);
  }

  setClauses.push("updated_at = datetime('now')");
  params.push(slug);

  await env.DB.prepare(`UPDATE posts SET ${setClauses.join(", ")} WHERE slug = ?`).bind(...params).run();

  const row = await env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first();
  return json(rowToPost(row));
};

// ============================================================
// DELETE /api/posts?slug=xxx — 删除文章
// ============================================================

export const DELETE: APIRoute = async ({ request, locals, url }) => {
  const env = getEnv(locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  try {
    await requireAuth(request, env);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const slug = url.searchParams.get("slug");
  if (!slug) return json({ error: "缺少 slug 参数" }, 400);

  const existing = await env.DB.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first();
  if (!existing) return json({ error: "文章不存在" }, 404);

  await env.DB.prepare("DELETE FROM posts WHERE slug = ?").bind(slug).run();

  return json({ success: true, deleted: slug });
};
