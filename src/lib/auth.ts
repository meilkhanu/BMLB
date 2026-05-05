// ============================================================
// src/lib/auth.ts
// 认证业务逻辑 — 纯handler函数，由 [...all].ts 调用
//
// GET  /api/auth  → 检查登录状态
// POST /api/auth  → 登录 / 首次 SETUP / 登出
// ============================================================

import type { APIContext } from "astro";

// ============================================================
// Env 类型
// ============================================================

export interface Env {
  CONFIG: KVNamespace;
  DB: D1Database;
}

function getEnv(locals: APIContext["locals"]): Env | undefined {
  return (locals as any).runtime?.env as Env | undefined;
}

// ============================================================
// 工具函数
// ============================================================

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function setCookie(value: string, maxAge = 86400) {
  return `auth_token=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function clearCookie() {
  return "auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

// ============================================================
// Session 管理
// ============================================================

async function createSession(env: Env) {
  const token = crypto.randomUUID();
  await env.CONFIG.put(
    `session:${token}`,
    JSON.stringify({ created_at: new Date().toISOString() }),
    { expirationTtl: 86400 }
  );
  return token;
}

export async function verifySession(request: Request, env: Env): Promise<boolean> {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/auth_token=([^;]+)/);
  if (!match) return false;
  const session = await env.CONFIG.get(`session:${match[1]}`);
  return !!session;
}

// ============================================================
// GET /api/auth — 检查登录状态
// ============================================================

async function handleGetAuth(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) {
    console.error("[auth] D1 binding missing — env is undefined");
    return json({ error: "运行时不可用（D1 binding丢失）" }, 500);
  }

  const authed = await verifySession(ctx.request, env);
  return json({ logged_in: authed });
}

// ============================================================
// POST /api/auth — 登录 / 登出 / 首次 SETUP
// ============================================================

async function handlePostAuth(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) {
    console.error("[auth] D1 binding missing — env is undefined");
    return json({ error: "运行时不可用（D1 binding丢失）" }, 500);
  }

  let body: Record<string, string>;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "无效的请求体" }, 400);
  }

  // —— 登出 ——
  if (body.action === "logout") {
    return json(
      { success: true },
      200,
      { "Set-Cookie": clearCookie() }
    );
  }

  // —— 登录 / SETUP ——
  const { password } = body;
  if (!password || password.length < 4) {
    return json({ error: "密码至少 4 位" }, 400);
  }

  const storedHash = await env.CONFIG.get("admin_password_hash");

  // 首次设置密码（SETUP 模式）
  if (!storedHash) {
    const newHash = await sha256(password);
    await env.CONFIG.put("admin_password_hash", newHash);
    const token = await createSession(env);
    return json(
      { success: true, setup: true },
      200,
      { "Set-Cookie": setCookie(token) }
    );
  }

  // 正常登录
  const inputHash = await sha256(password);
  if (inputHash !== storedHash) {
    return json({ error: "密码错误" }, 401);
  }

  const token = await createSession(env);
  return json(
    { success: true },
    200,
    { "Set-Cookie": setCookie(token) }
  );
}

// ============================================================
// 主入口 — handleAuth
// ============================================================

export async function handleAuth(ctx: APIContext): Promise<Response> {
  // 启动时断言
  const env = getEnv(ctx.locals);
  if (!env) {
    console.error("[auth] FATAL: runtime.env is undefined — D1/KV bindings missing");
  }

  switch (ctx.request.method) {
    case "GET":
      return handleGetAuth(ctx);
    case "POST":
      return handlePostAuth(ctx);
    default:
      return json({ error: "Method Not Allowed" }, 405);
  }
}
