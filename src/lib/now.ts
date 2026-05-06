// ============================================================
// src/lib/now.ts
// /now 页面状态面板 CRUD — 纯 handler 函数，由 [...all].ts 调用
//
// GET  /api/now  → 获取当前状态（公开）
// PUT  /api/now  → 更新状态（需登录）
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

// D1 行 → JS 对象
function rowToStatus(row: any) {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    phase: row.phase,
    description: row.description,
    progress: row.progress ?? 0,
    updatedAt: row.updated_at,
  };
}

// 默认状态（表为空时返回）
const DEFAULT_STATUS = {
  id: 1,
  startDate: "2026-04-30",
  endDate: "2026-05-20",
  phase: "Phase 2",
  description: "目前主要投入个人网站第二阶段建设，优化 /archive、/now、/about 页面，统一视觉系统，完善交互体验，建立长期运营内容框架。",
  progress: 72,
  updatedAt: new Date().toISOString(),
};

// ============================================================
// GET /api/now — 获取状态
// ============================================================

async function handleGetNow(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  try {
    const row = await env.DB.prepare("SELECT * FROM now_status WHERE id = 1").first();
    if (!row) {
      return json(DEFAULT_STATUS);
    }
    return json(rowToStatus(row));
  } catch (e: any) {
    console.error("GET /api/now error:", e);
    return json(DEFAULT_STATUS);
  }
}

// ============================================================
// PUT /api/now — 更新状态（需登录）
// ============================================================

async function handlePutNow(ctx: APIContext): Promise<Response> {
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

  const { startDate, endDate, phase, description, progress } = body;

  // 校验必填字段
  if (!startDate || !endDate || !phase || !description) {
    return json({ error: "缺少必填字段: startDate, endDate, phase, description" }, 400);
  }

  try {
    // 检查记录是否存在
    const existing = await env.DB.prepare("SELECT id FROM now_status WHERE id = 1").first();

    if (existing) {
      // 更新
      await env.DB.prepare(
        `UPDATE now_status
         SET start_date = ?, end_date = ?, phase = ?, description = ?, progress = ?, updated_at = datetime('now')
         WHERE id = 1`
      ).bind(startDate, endDate, phase, description, progress ?? 0).run();
    } else {
      // 插入
      await env.DB.prepare(
        `INSERT INTO now_status (id, start_date, end_date, phase, description, progress)
         VALUES (1, ?, ?, ?, ?, ?)`
      ).bind(startDate, endDate, phase, description, progress ?? 0).run();
    }

    const row = await env.DB.prepare("SELECT * FROM now_status WHERE id = 1").first();
    return json(rowToStatus(row));
  } catch (e: any) {
    console.error("PUT /api/now error:", e);
    return json({ error: "服务器内部错误" }, 500);
  }
}

// ============================================================
// 主入口 — handleNow
// ============================================================

export async function handleNow(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) {
    console.error("[now] FATAL: runtime.env is undefined — D1 binding missing");
  }

  switch (ctx.request.method) {
    case "GET":
      return handleGetNow(ctx);
    case "PUT":
      return handlePutNow(ctx);
    default:
      return json({ error: "Method Not Allowed" }, 405);
  }
}
