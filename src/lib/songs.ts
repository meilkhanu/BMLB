// ============================================================
// src/lib/songs.ts
// 歌曲管理 API — 由 [...all].ts 调用
//
// GET    /api/songs         → 获取全部歌曲列表
// POST   /api/songs         → 新增歌曲（需登录）
// PUT    /api/songs?id=X    → 更新歌曲（需登录）
// DELETE /api/songs?id=X    → 删除歌曲（需登录）
// ============================================================

import type { APIContext } from "astro";
import { verifySession, type Env } from "./auth";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEnv(locals: APIContext["locals"]): Env | undefined {
  return (locals as any).runtime?.env as Env | undefined;
}

function getDb(env: Env) {
  return env.DB;
}

// —— GET /api/songs ——
async function handleGetSongs(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  try {
    const { results } = await getDb(env)
      .prepare("SELECT * FROM songs ORDER BY sort_order ASC, id ASC")
      .all();
    return json(results || []);
  } catch (e: any) {
    console.error("[songs] GET error:", e);
    return json({ error: "查询失败" }, 500);
  }
}

// —— POST /api/songs ——
async function handleCreateSong(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  const authed = await verifySession(ctx.request, env);
  if (!authed) return json({ error: "未登录" }, 401);

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "无效的 JSON" }, 400);
  }

  const { title, artist, album, coverUrl, audioUrl, duration, sortOrder } = body;
  if (!title || !audioUrl) {
    return json({ error: "歌曲标题和音频 URL 为必填项" }, 400);
  }

  try {
    const result = await getDb(env)
      .prepare(
        `INSERT INTO songs (title, artist, album, cover_url, audio_url, duration, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        title,
        artist || "",
        album || "",
        coverUrl || "",
        audioUrl,
        duration || 0,
        sortOrder || 0
      )
      .run();
    return json({ success: true, id: result.meta.last_row_id });
  } catch (e: any) {
    console.error("[songs] POST error:", e);
    return json({ error: "创建失败" }, 500);
  }
}

// —— PUT /api/songs?id=X ——
async function handleUpdateSong(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  const authed = await verifySession(ctx.request, env);
  if (!authed) return json({ error: "未登录" }, 401);

  const url = new URL(ctx.request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "缺少 id 参数" }, 400);

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "无效的 JSON" }, 400);
  }

  const fields: Record<string, string> = {
    title: "title",
    artist: "artist",
    album: "album",
    coverUrl: "cover_url",
    audioUrl: "audio_url",
    duration: "duration",
    sortOrder: "sort_order",
  };

  const updates: string[] = [];
  const values: any[] = [];

  for (const [key, col] of Object.entries(fields)) {
    if (body[key] !== undefined) {
      updates.push(`${col} = ?`);
      values.push(body[key]);
    }
  }

  if (updates.length === 0) {
    return json({ error: "没有要更新的字段" }, 400);
  }

  values.push(id);

  try {
    await getDb(env)
      .prepare(`UPDATE songs SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();
    return json({ success: true });
  } catch (e: any) {
    console.error("[songs] PUT error:", e);
    return json({ error: "更新失败" }, 500);
  }
}

// —— DELETE /api/songs?id=X ——
async function handleDeleteSong(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) return json({ error: "运行时不可用" }, 500);

  const authed = await verifySession(ctx.request, env);
  if (!authed) return json({ error: "未登录" }, 401);

  const url = new URL(ctx.request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "缺少 id 参数" }, 400);

  try {
    await getDb(env)
      .prepare("DELETE FROM songs WHERE id = ?")
      .bind(id)
      .run();
    return json({ success: true });
  } catch (e: any) {
    console.error("[songs] DELETE error:", e);
    return json({ error: "删除失败" }, 500);
  }
}

// —— 主入口 ——
export async function handleSongs(ctx: APIContext): Promise<Response> {
  const method = ctx.request.method;

  if (method === "GET") return handleGetSongs(ctx);
  if (method === "POST") return handleCreateSong(ctx);
  if (method === "PUT") return handleUpdateSong(ctx);
  if (method === "DELETE") return handleDeleteSong(ctx);

  return json({ error: "Method Not Allowed" }, 405);
}
