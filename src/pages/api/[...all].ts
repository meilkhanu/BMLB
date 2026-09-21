// ============================================================
// src/pages/api/[...all].ts
// 唯一的 API catch-all 路由
// 统一分发到 src/lib 下的各 handler 模块
// ============================================================

import type { APIContext } from "astro";
import { handleAuth } from "../../lib/auth";
import { handlePosts } from "../../lib/posts";
import { handleUpload } from "../../lib/upload";
import { handleNow } from "../../lib/now";
import { handleNowActivity } from "../../lib/now-activity";
import { handleNowMessages } from "../../lib/now-messages";
import { handleComments } from "../../lib/comments";
import { handleSongs } from "../../lib/songs";
import { handleAbout } from "../../lib/about";
import { handleSearch } from "../../lib/search";
import { handleStats } from "../../lib/stats";

function dispatch(url: URL, ctx: APIContext): Promise<Response> | Response {
  if (url.pathname.startsWith("/api/stats")) return handleStats(ctx);
  if (url.pathname.startsWith("/api/search")) return handleSearch(ctx);
  if (url.pathname.startsWith("/api/auth")) return handleAuth(ctx);
  if (url.pathname.startsWith("/api/posts")) return handlePosts(ctx);
  if (url.pathname.startsWith("/api/comments")) return handleComments(ctx);
  if (url.pathname.startsWith("/api/upload")) return handleUpload(ctx);
  if (url.pathname.startsWith("/api/now/messages")) return handleNowMessages(ctx);
  if (url.pathname.startsWith("/api/now/activity")) return handleNowActivity(ctx);
  if (url.pathname.startsWith("/api/now")) return handleNow(ctx);
  if (url.pathname.startsWith("/api/about")) return handleAbout(ctx);
  if (url.pathname.startsWith("/api/songs")) return handleSongs(ctx);
  return new Response("Not Found", { status: 404 });
}

export const ALL = async (ctx: APIContext): Promise<Response> => {
  const url = new URL(ctx.request.url);
  try {
    return await dispatch(url, ctx);
  } catch (e: any) {
    // 业务层用 throw new Response(...) 表达 401/400 等语义，
    // 这里必须接住并原样返回，否则 Astro 会统一转成 500。
    if (e instanceof Response) return e;
    console.error("[api] unhandled error:", e?.stack || e);
    return new Response(JSON.stringify({ error: "服务器内部错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
