// ============================================================
// functions/api/auth.js
// 认证接口：首次设置密码 / 登录 / 登出 / 状态检查
//
// 安全策略：
// - 密码 SHA-256 哈希存储在 KV (CONFIG.admin_password_hash)
// - 登录成功后生成 session token，存入 KV 并设 TTL
// - Cookie: httpOnly + Secure + SameSite=Strict
// - 首次访问时自动进入 SETUP 模式（接受任意密码作为初始密码）
// ============================================================

/**
 * 路由分发：单个 /api/auth 端点，通过 method + body 区分操作
 */
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "GET") {
    return handleCheck(request, env);
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "login";
    if (action === "logout") return handleLogout();
    return handleLogin(body, env);
  }

  return json({ error: "Method not allowed" }, 405);
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

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function setCookie(value, maxAge = 86400) {
  return `auth_token=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function clearCookie() {
  return "auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

// ============================================================
// 登录 / 首次设置密码
// ============================================================

async function handleLogin(body, env) {
  const { password } = body;
  if (!password || password.length < 4) {
    return json({ error: "密码至少 4 位" }, 400);
  }

  const storedHash = await env.CONFIG.get("admin_password_hash");

  // —— 首次设置密码（SETUP 模式） ——
  if (!storedHash) {
    const newHash = await sha256(password);
    await env.CONFIG.put("admin_password_hash", newHash);
    const token = await createSession(env);
    return json(
      { success: true, setup: true },
      {
        status: 200,
        headers: { "Set-Cookie": setCookie(token) },
      }
    );
  }

  // —— 正常登录 ——
  const inputHash = await sha256(password);
  if (inputHash !== storedHash) {
    return json({ error: "密码错误" }, 401);
  }

  const token = await createSession(env);
  return json(
    { success: true },
    {
      status: 200,
      headers: { "Set-Cookie": setCookie(token) },
    }
  );
}

// ============================================================
// 登出
// ============================================================

async function handleLogout() {
  return json(
    { success: true },
    {
      status: 200,
      headers: { "Set-Cookie": clearCookie() },
    }
  );
}

// ============================================================
// 状态检查
// ============================================================

async function handleCheck(request, env) {
  const authed = await verifySession(request, env);
  return json({ logged_in: authed });
}

// ============================================================
// Session 管理（基于 KV + TTL）
// ============================================================

async function createSession(env) {
  const token = crypto.randomUUID();
  // KV 支持 expirationTtl（秒），设 24 小时
  await env.CONFIG.put(`session:${token}`, JSON.stringify({
    created_at: new Date().toISOString(),
  }), { expirationTtl: 86400 });
  return token;
}

async function verifySession(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/auth_token=([^;]+)/);
  if (!match) return false;
  const token = match[1];
  const session = await env.CONFIG.get(`session:${token}`);
  return !!session;
}

// ============================================================
// 导出鉴权辅助函数（供 posts.js 等复用）
// ============================================================

export { verifySession, json };
