// ============================================================
// src/lib/comments.ts
// 文章评论系统 — 由 [...all].ts 调用
//
// GET    /api/comments?slug=xxx    → 获取某文章的评论（公开）
// POST   /api/comments             → 提交评论（公开）
// DELETE /api/comments?id=X        → 删除评论（需登录）
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

// ============================================================
// 类型
// ============================================================

interface Comment {
  id: number;
  author: string;
  email: string;
  content: string;
  targetSlug: string;
  createdAt: string;
}

// ============================================================
// GET /api/comments?slug=xxx — 获取某文章的评论（公开）
// ============================================================

async function handleGetComments(ctx: APIContext): Promise<Response> {
  const db = getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  const url = new URL(ctx.request.url);
  const slug = url.searchParams.get("slug");

  // 不加 slug：返回全站最新评论（供首页等使用）
  if (!slug) {
    try {
      const rows = await db.prepare(
        "SELECT * FROM comments ORDER BY created_at DESC LIMIT 10"
      ).all();

      if (!rows.results || rows.results.length === 0) {
        return json([]);
      }

      const comments: Comment[] = rows.results.map((row: any) => ({
        id: row.id,
        author: row.author,
        email: row.email || "",
        content: row.content,
        targetSlug: row.target_slug,
        createdAt: row.created_at,
      }));

      return json(comments);
    } catch (e: any) {
      console.error("GET /api/comments error:", e);
      return json([]);
    }
  }

  // 有 slug：返回指定文章的评论
  try {
    const rows = await db.prepare(
      "SELECT * FROM comments WHERE target_slug = ? ORDER BY created_at ASC"
    ).bind(slug).all();

    if (!rows.results || rows.results.length === 0) {
      return json([]);
    }

    const comments: Comment[] = rows.results.map((row: any) => ({
      id: row.id,
      author: row.author,
      email: row.email || "",
      content: row.content,
      targetSlug: row.target_slug,
      createdAt: row.created_at,
    }));

    return json(comments);
  } catch (e: any) {
    console.error("GET /api/comments error:", e);
    return json([]);
  }
}

// ============================================================
// POST /api/comments — 提交评论（公开）
// ============================================================

async function handlePostComment(ctx: APIContext): Promise<Response> {
  const db = getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "无效的请求体" }, 400);
  }

  const author = (body.author || "").trim() || "访客";
  const email = (body.email || "").trim();
  const content = (body.content || "").trim();
  const targetSlug = (body.slug || "").trim();

  if (!targetSlug) {
    return json({ error: "缺少文章标识" }, 400);
  }

  if (!content) {
    return json({ error: "评论内容不能为空" }, 400);
  }

  if (content.length > 500) {
    return json({ error: "评论内容不能超过 500 字" }, 400);
  }

  if (author.length > 20) {
    return json({ error: "昵称不能超过 20 字" }, 400);
  }

  try {
    const result = await db.prepare(
      "INSERT INTO comments (author, email, content, target_slug) VALUES (?, ?, ?, ?)"
    ).bind(author, email, content, targetSlug).run();

    const row = await db.prepare(
      "SELECT * FROM comments WHERE id = ?"
    ).bind(result.meta.last_row_id).first();

    return json({
      id: (row as any).id,
      author: (row as any).author,
      email: (row as any).email || "",
      content: (row as any).content,
      targetSlug: (row as any).target_slug,
      createdAt: (row as any).created_at,
    });
  } catch (e: any) {
    console.error("POST /api/comments error:", e);
    return json({ error: "提交失败，请稍后重试" }, 500);
  }
}

// ============================================================
// DELETE /api/comments?id=X — 删除评论（需登录）
// ============================================================

async function handleDeleteComment(ctx: APIContext): Promise<Response> {
  const db = getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  try {
    await requireAuth(ctx.request, getKV());
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const url = new URL(ctx.request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "缺少参数: id" }, 400);

  try {
    await db.prepare(
      "DELETE FROM comments WHERE id = ?"
    ).bind(Number(id)).run();

    return json({ success: true });
  } catch (e: any) {
    console.error("DELETE /api/comments error:", e);
    return json({ error: "删除失败" }, 500);
  }
}

// ============================================================
// 主入口 — handleComments
// ============================================================

export async function handleComments(ctx: APIContext): Promise<Response> {
  switch (ctx.request.method) {
    case "GET":
      return handleGetComments(ctx);
    case "POST":
      return handlePostComment(ctx);
    case "DELETE":
      return handleDeleteComment(ctx);
    default:
      return json({ error: "Method Not Allowed" }, 405);
  }
}
