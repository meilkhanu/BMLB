// ============================================================
// src/pages/api/auth.ts
// 认证接口（Astro API 路由，自动获得 Cloudflare bindings）
//
// GET  /api/auth  → 检查登录状态
// POST /api/auth  → 登录 / 首次 SETUP
//        body: { password }  → 登录
//        body: { action: "logout" }  → 登出
// ============================================================

import type { APIRoute } from "astro";

// ============================================================
// 工具函数
// ============================================================

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
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

async function createSession(env: any) {
  const token = crypto.randomUUID();
  await env.CONFIG.put(
    `session:${token}`,
    JSON.stringify({ created_at: new Date().toISOString() }),
    { expirationTtl: 86400 }
  );
  return token;
}

export async function verifySession(request: Request, env: any): Promise<boolean> {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/auth_token=([^;]+)/);
  if (!match) return false;
  const session = await env.CONFIG.get(`session:${match[1]}`);
  return !!session;
}

// ============================================================
// GET /api/auth — 检查登录状态
// ============================================================

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env;
  if (!env) return json({ error: "运行时不可用" }, 500);

  const authed = await verifySession(request, env);
  return json({ logged_in: authed });
};

// ============================================================
// POST /api/auth — 登录 / 登出 / 首次 SETUP
// ============================================================

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env;
  if (!env) return json({ error: "运行时不可用" }, 500);

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的请求体" }, 400);
  }

  // —— 登出 ——
  if (body.action === "logout") {
    return json(
      { success: true },
      { status: 200, headers: { "Set-Cookie": clearCookie() } }
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
      { status: 200, headers: { "Set-Cookie": setCookie(token) } }
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
    { status: 200, headers: { "Set-Cookie": setCookie(token) } }
  );
};
