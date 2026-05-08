// ============================================================
// src/lib/now-messages.ts
// /now 页面留言板 — 由 [...all].ts 调用
//
// GET    /api/now/messages       → 获取全部留言（公开）
// POST   /api/now/messages       → 提交留言（公开）
// DELETE /api/now/messages?id=X  → 删除留言（需登录）
// ============================================================

import type { APIContext } from "astro";
import { verifySession, type Env } from "./auth";

// ============================================================
// 工具函数
// ============================================================

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEnv(locals: APIContext["locals"]): Env | undefined {
  return (locals as any).runtime?.env as Env | undefined;
}

async function requireAuth(request: Request, env: Env) {
  const authed = await verifySession(request, env);
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

interface NowMessage {
  id: number;
  author: string;
  email: string;
  content: string;
  createdAt: string;
}

// 空表时的种子数据
const DEFAULT_MESSAGES: NowMessage[] = [
  { id: 0, author: "访客", email: "", content: "页面很有生命力。", createdAt: "" },
  { id: 0, author: "访客", email: "", content: "期待正式上线。", createdAt: "" },
  { id: 0, author: "访客", email: "", content: "设计语言很统一。", createdAt: "" },
];

// ============================================================
// GET /api/now/messages — 获取全部留言（公开）
// ============================================================

async function handleGetMessages(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  try {
    const rows = await env.DB.prepare(
      "SELECT * FROM now_messages ORDER BY created_at DESC"
    ).all();

    if (!rows.results || rows.results.length === 0) {
      return json(DEFAULT_MESSAGES);
    }

    const messages: NowMessage[] = rows.results.map((row: any) => ({
      id: row.id,
      author: row.author,
      email: row.email || '',
      content: row.content,
      createdAt: row.created_at,
    }));

    return json(messages);
  } catch (e: any) {
    console.error("GET /api/now/messages error:", e);
    return json(DEFAULT_MESSAGES);
  }
}

// ============================================================
// POST /api/now/messages — 提交留言（公开）
// ============================================================

async function handlePostMessage(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "无效的请求体" }, 400);
  }

  const author = (body.author || '').trim() || '访客';
  const email = (body.email || '').trim();
  const content = (body.content || '').trim();

  if (!content) {
    return json({ error: "留言内容不能为空" }, 400);
  }

  if (content.length > 500) {
    return json({ error: "留言内容不能超过 500 字" }, 400);
  }

  if (author.length > 20) {
    return json({ error: "昵称不能超过 20 字" }, 400);
  }

  try {
    const result = await env.DB.prepare(
      "INSERT INTO now_messages (author, email, content) VALUES (?, ?, ?)"
    ).bind(author, email, content).run();

    const row = await env.DB.prepare(
      "SELECT * FROM now_messages WHERE id = ?"
    ).bind(result.meta.last_row_id).first();

    return json({
      id: (row as any).id,
      author: (row as any).author,
      email: (row as any).email || '',
      content: (row as any).content,
      createdAt: (row as any).created_at,
    });
  } catch (e: any) {
    console.error("POST /api/now/messages error:", e);
    return json({ error: "提交失败，请稍后重试" }, 500);
  }
}

// ============================================================
// DELETE /api/now/messages?id=X — 删除留言（需登录）
// ============================================================

async function handleDeleteMessage(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  try {
    await requireAuth(ctx.request, env);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const url = new URL(ctx.request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "缺少参数: id" }, 400);

  try {
    await env.DB.prepare(
      "DELETE FROM now_messages WHERE id = ?"
    ).bind(Number(id)).run();

    return json({ success: true });
  } catch (e: any) {
    console.error("DELETE /api/now/messages error:", e);
    return json({ error: "删除失败" }, 500);
  }
}

// ============================================================
// 主入口 — handleNowMessages
// ============================================================

export async function handleNowMessages(ctx: APIContext): Promise<Response> {
  switch (ctx.request.method) {
    case "GET":
      return handleGetMessages(ctx);
    case "POST":
      return handlePostMessage(ctx);
    case "DELETE":
      return handleDeleteMessage(ctx);
    default:
      return json({ error: "Method Not Allowed" }, 405);
  }
}
