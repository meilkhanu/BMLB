// ============================================================
// functions/api/posts.js
// 文章 CRUD 接口（读写 Cloudflare D1）
//
// 路由（全部在 /api/posts）：
//   GET    /api/posts              → 公开列表（仅 published）
//   GET    /api/posts?admin=1      → 管理列表（含草稿，需登录）
//   GET    /api/posts?slug=xxx     → 单篇详情（仅 published）
//   POST   /api/posts              → 创建文章（需登录）
//   PUT    /api/posts              → 更新文章（需登录）
//   DELETE /api/posts?slug=xxx     → 删除文章（需登录）
// ============================================================

// 复用 auth.js 中的鉴权函数（同目录 import）
import { verifySession } from "./auth.js";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  try {
    if (method === "GET") {
      const slug = url.searchParams.get("slug");
      const admin = url.searchParams.get("admin") === "1";
      if (slug) {
        return admin
          ? await getPostAdmin(slug, request, env)
          : await getPost(slug, env);
      }
      return admin
        ? await listPostsAdmin(request, env)
        : await listPosts(url, env);
    }

    if (method === "POST") {
      const body = await request.json();
      return await createPost(body, request, env);
    }

    if (method === "PUT") {
      const body = await request.json();
      return await updatePost(body, request, env);
    }

    if (method === "DELETE") {
      const slug = url.searchParams.get("slug");
      if (!slug) return json({ error: "缺少 slug 参数" }, 400);
      return await deletePost(slug, request, env);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("posts.js error:", err);
    return json({ error: "服务器内部错误" }, 500);
  }
}

// ============================================================
// 工具函数
// ============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireAuth(request, env) {
  const authed = await verifySession(request, env);
  if (!authed) {
    throw new AuthError("未登录");
  }
}

class AuthError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "AuthError";
  }
}

// D1 列的 snake_case → API 响应的 camelCase
function rowToPost(row) {
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
// 公开接口
// ============================================================

/**
 * GET /api/posts — 公开文章列表
 * 可选 ?category=notes 筛选分类
 * 可选 ?limit=10 控制数量
 */
async function listPosts(url, env) {
  const category = url.searchParams.get("category") || "";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "20"),
    50
  );

  let sql = "SELECT * FROM posts WHERE status = 'published'";
  const params = [];

  if (category) {
    sql += " AND category_id = ?";
    params.push(category);
  }

  sql += " ORDER BY published_at DESC LIMIT ?";
  params.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return json(results.map(rowToPost));
}

/**
 * GET /api/posts?slug=xxx — 公开单篇详情
 */
async function getPost(slug, env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE slug = ? AND status = 'published'"
  )
    .bind(slug)
    .all();

  if (results.length === 0) {
    return json({ error: "文章不存在" }, 404);
  }

  return json(rowToPost(results[0]));
}

// ============================================================
// 管理接口（需登录）
// ============================================================

/**
 * GET /api/posts?admin=1 — 管理列表（含草稿）
 */
async function listPostsAdmin(request, env) {
  try {
    await requireAuth(request, env);
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    throw e;
  }

  const { results } = await env.DB.prepare(
    "SELECT * FROM posts ORDER BY updated_at DESC LIMIT 50"
  ).all();

  return json(results.map(rowToPost));
}

/**
 * GET /api/posts?slug=xxx&admin=1 — 管理端获取单篇（含草稿）
 */
async function getPostAdmin(slug, request, env) {
  try {
    await requireAuth(request, env);
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    throw e;
  }

  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE slug = ?"
  )
    .bind(slug)
    .all();

  if (results.length === 0) {
    return json({ error: "文章不存在" }, 404);
  }

  return json(rowToPost(results[0]));
}

/**
 * POST /api/posts — 创建文章
 */
async function createPost(body, request, env) {
  try {
    await requireAuth(request, env);
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    throw e;
  }

  const {
    slug,
    title,
    content,
    excerpt = "",
    categoryId,
    tags = [],
    coverImage = "",
    publishedAt = "",
    status = "draft",
  } = body;

  // 校验必填字段
  if (!slug || !title || !content || !categoryId) {
    return json(
      {
        error: "缺少必填字段",
        required: ["slug", "title", "content", "categoryId"],
      },
      400
    );
  }

  // 检查 slug 唯一性
  const existing = await env.DB.prepare(
    "SELECT id FROM posts WHERE slug = ?"
  )
    .bind(slug)
    .first();
  if (existing) {
    return json({ error: `slug "${slug}" 已存在` }, 409);
  }

  await env.DB.prepare(
    `INSERT INTO posts (slug, title, content, excerpt, category_id, tags, cover_image, published_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      slug,
      title,
      content,
      excerpt,
      categoryId,
      JSON.stringify(tags),
      coverImage,
      publishedAt,
      status
    )
    .run();

  // 返回新建的文章
  return await getPostAdmin(slug, request, env);
}

/**
 * PUT /api/posts — 更新文章
 */
async function updatePost(body, request, env) {
  try {
    await requireAuth(request, env);
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    throw e;
  }

  const { slug } = body;
  if (!slug) {
    return json({ error: "缺少 slug" }, 400);
  }

  // 检查是否存在
  const existing = await env.DB.prepare(
    "SELECT * FROM posts WHERE slug = ?"
  )
    .bind(slug)
    .first();
  if (!existing) {
    return json({ error: "文章不存在" }, 404);
  }

  // 构建 SET 子句（只更新传入的字段）
  const fields = [];
  const params = [];

  const map = {
    title: "title",
    content: "content",
    excerpt: "excerpt",
    categoryId: "category_id",
    coverImage: "cover_image",
    publishedAt: "published_at",
    status: "status",
  };

  for (const [apiKey, dbKey] of Object.entries(map)) {
    if (body[apiKey] !== undefined) {
      fields.push(`${dbKey} = ?`);
      params.push(body[apiKey]);
    }
  }

  // tags 特殊处理：需要 JSON.stringify
  if (body.tags !== undefined) {
    fields.push("tags = ?");
    params.push(JSON.stringify(body.tags));
  }

  if (fields.length === 0) {
    return json({ error: "没有要更新的字段" }, 400);
  }

  // 自动更新 updated_at
  fields.push("updated_at = datetime('now')");
  params.push(slug);

  await env.DB.prepare(
    `UPDATE posts SET ${fields.join(", ")} WHERE slug = ?`
  )
    .bind(...params)
    .run();

  return await getPostAdmin(slug, request, env);
}

/**
 * DELETE /api/posts?slug=xxx — 删除文章
 */
async function deletePost(slug, request, env) {
  try {
    await requireAuth(request, env);
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    throw e;
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM posts WHERE slug = ?"
  )
    .bind(slug)
    .first();
  if (!existing) {
    return json({ error: "文章不存在" }, 404);
  }

  await env.DB.prepare("DELETE FROM posts WHERE slug = ?")
    .bind(slug)
    .run();

  return json({ success: true, deleted: slug });
}
