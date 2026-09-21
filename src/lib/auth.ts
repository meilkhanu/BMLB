// ============================================================
// src/lib/auth.ts
// 认证业务逻辑 — 纯handler函数，由 [...all].ts 调用
//
// GET  /api/auth  → 检查登录状态
// POST /api/auth  → 登录 / 首次 SETUP / 登出
//
// 部署：ECS（SQLite kv_store）
// ============================================================

import type { APIContext } from "astro";
import { getDb, getKV, isNode } from "./db";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// ============================================================
// Env 类型（简化）
// ============================================================

export interface Env {
  DB: any;
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

// —— 密码哈希：scrypt$salt$derivedHex ——
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

type VerifyResult = "ok" | "ok-legacy" | "fail";

async function verifyPassword(password: string, stored: string): Promise<VerifyResult> {
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return "fail";
    const [, salt, expectedHex] = parts;
    let expected: Buffer;
    try {
      expected = Buffer.from(expectedHex, "hex");
    } catch {
      return "fail";
    }
    const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
    if (derived.length !== expected.length) return "fail";
    return timingSafeEqual(derived, expected) ? "ok" : "fail";
  }

  // 旧格式：裸 SHA-256 hex（无盐）。比对成功标记为 ok-legacy，由调用方触发升级。
  const inputHash = await sha256(password);
  return inputHash === stored ? "ok-legacy" : "fail";
}

function isSecureRequest(): boolean {
  // 本地 dev 是 http，ECS 走 nginx https 反代（由 ecosystem.config.cjs 注入 PROTOCOL）
  if (isNode()) {
    const proto = process.env.PROTOCOL || "";
    return proto === "https";
  }
  return true;
}

function setCookie(value: string, maxAge = 86400) {
  const secure = isSecureRequest() ? ' Secure;' : '';
  return `auth_token=${value}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clearCookie() {
  const secure = isSecureRequest() ? ' Secure;' : '';
  return `auth_token=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`;
}

// ============================================================
// Session 管理（通过 KV 兼容层）
// ============================================================

async function createSession(kv: NonNullable<ReturnType<typeof getKV>>) {
  const token = crypto.randomUUID();
  await kv.put(
    `session:${token}`,
    JSON.stringify({ created_at: new Date().toISOString() }),
    { expirationTtl: 86400 }
  );
  return token;
}

export async function verifySession(request: Request, kv: NonNullable<ReturnType<typeof getKV>>): Promise<boolean> {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/auth_token=([^;]+)/);
  if (!match) return false;
  const session = await kv.get(`session:${match[1]}`);
  return !!session;
}

// ============================================================
// GET /api/auth — 检查登录状态
// ============================================================

async function handleGetAuth(ctx: APIContext): Promise<Response> {
  const kv = getKV();
  if (!kv) {
    console.error("[auth] KV binding missing");
    return json({ error: "运行时不可用（KV 存储丢失）" }, 500);
  }

  const authed = await verifySession(ctx.request, kv);
  return json({ logged_in: authed });
}

// ============================================================
// POST /api/auth — 登录 / 登出 / 首次 SETUP
// ============================================================

async function handlePostAuth(ctx: APIContext): Promise<Response> {
  const kv = getKV();
  if (!kv) {
    console.error("[auth] KV binding missing");
    return json({ error: "运行时不可用（KV 存储丢失）" }, 500);
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

  const storedHash = await kv.get("admin_password_hash");

  // 首次设置密码（SETUP 模式）
  if (!storedHash) {
    const newHash = await hashPassword(password);
    await kv.put("admin_password_hash", newHash);
    const token = await createSession(kv);
    return json(
      { success: true, setup: true },
      200,
      { "Set-Cookie": setCookie(token) }
    );
  }

  // 正常登录
  const verdict = await verifyPassword(password, storedHash);
  if (verdict === "fail") {
    return json({ error: "密码错误" }, 401);
  }

  // 旧格式哈希：登录成功即无缝升级为 scrypt
  if (verdict === "ok-legacy") {
    await kv.put("admin_password_hash", await hashPassword(password));
    console.log("[auth] admin password hash upgraded to scrypt");
  }

  const token = await createSession(kv);
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
  const kv = getKV();
  if (!kv) {
    console.error("[auth] FATAL: KV 存储不可用");
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
