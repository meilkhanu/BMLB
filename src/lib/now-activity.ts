// ============================================================
// src/lib/now-activity.ts
// /now 页面微日志（Activity Feed）— 由 [...all].ts 调用
//
// GET    /api/now/activity       → 获取全部活动（公开）
// POST   /api/now/activity       → 新增活动（需登录）
// DELETE /api/now/activity?id=X  → 删除活动（需登录）
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
// Activity 接口
// ============================================================

interface NowActivity {
  id: number;
  content: string;
  activityDate: string;
  createdAt: string;
}

// 默认种子数据（表为空时返回）
const DEFAULT_ACTIVITIES: NowActivity[] = [
  { id: 0, content: "完成归档页设计",  activityDate: "04-30", createdAt: "" },
  { id: 0, content: "优化首页卡片层级", activityDate: "04-29", createdAt: "" },
  { id: 0, content: "构思 /now 页面结构", activityDate: "04-28", createdAt: "" },
  { id: 0, content: "统一配色系统",     activityDate: "04-27", createdAt: "" },
];

// ============================================================
// GET /api/now/activity — 获取全部活动（公开）
// ============================================================

async function handleGetActivity(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  try {
    const rows = await env.DB.prepare(
      "SELECT * FROM now_activity ORDER BY activity_date DESC, id DESC"
    ).all();

    if (!rows.results || rows.results.length === 0) {
      return json(DEFAULT_ACTIVITIES);
    }

    const activities: NowActivity[] = rows.results.map((row: any) => ({
      id: row.id,
      content: row.content,
      activityDate: row.activity_date,
      createdAt: row.created_at,
    }));

    return json(activities);
  } catch (e: any) {
    console.error("GET /api/now/activity error:", e);
    return json(DEFAULT_ACTIVITIES);
  }
}

// ============================================================
// POST /api/now/activity — 新增活动（需登录）
// ============================================================

async function handlePostActivity(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  try {
    await requireAuth(ctx.request, env);
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

  const { content, activityDate } = body;
  if (!content || !activityDate) {
    return json({ error: "缺少必填字段: content, activityDate" }, 400);
  }

  try {
    const result = await env.DB.prepare(
      "INSERT INTO now_activity (content, activity_date) VALUES (?, ?)"
    ).bind(content, activityDate).run();

    const row = await env.DB.prepare(
      "SELECT * FROM now_activity WHERE id = ?"
    ).bind(result.meta.last_row_id).first();

    return json({
      id: (row as any).id,
      content: (row as any).content,
      activityDate: (row as any).activity_date,
      createdAt: (row as any).created_at,
    });
  } catch (e: any) {
    console.error("POST /api/now/activity error:", e);
    return json({ error: "新增失败" }, 500);
  }
}

// ============================================================
// DELETE /api/now/activity?id=X — 删除活动（需登录）
// ============================================================

async function handleDeleteActivity(ctx: APIContext): Promise<Response> {
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
      "DELETE FROM now_activity WHERE id = ?"
    ).bind(Number(id)).run();

    return json({ success: true });
  } catch (e: any) {
    console.error("DELETE /api/now/activity error:", e);
    return json({ error: "删除失败" }, 500);
  }
}

// ============================================================
// 主入口 — handleNowActivity
// ============================================================

export async function handleNowActivity(ctx: APIContext): Promise<Response> {
  switch (ctx.request.method) {
    case "GET":
      return handleGetActivity(ctx);
    case "POST":
      return handlePostActivity(ctx);
    case "DELETE":
      return handleDeleteActivity(ctx);
    default:
      return json({ error: "Method Not Allowed" }, 405);
  }
}
