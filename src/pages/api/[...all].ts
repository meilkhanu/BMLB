// ============================================================
// src/pages/api/[...all].ts
// 唯一的 API catch-all 路由 — 避免 Cloudflare Pages
// 因多 API 文件而降级到 Functions runtime
// ============================================================

import type { APIContext } from "astro";
import { handleAuth } from "../../lib/auth";
import { handlePosts } from "../../lib/posts";
import { handleUpload } from "../../lib/upload";

export const ALL = async (ctx: APIContext): Promise<Response> => {
  const url = new URL(ctx.request.url);

  if (url.pathname.startsWith("/api/auth")) {
    return handleAuth(ctx);
  }

  if (url.pathname.startsWith("/api/posts")) {
    return handlePosts(ctx);
  }

  if (url.pathname.startsWith("/api/upload")) {
    return handleUpload(ctx);
  }

  return new Response("Not Found", { status: 404 });
};
