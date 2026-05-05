// ============================================================
// src/pages/api/[...all].ts
// 单一 API 入口点（catch-all 路由）
//
// 目的：避免多 API 路由被 Cloudflare Pages 误判为 Functions 项目，
//       确保以单 Worker 模式运行，从而正确挂载 D1 / KV bindings。
//
// 路由分发：
//   /api/auth/*  → handleAuth()
//   /api/posts/* → handlePosts()
// ============================================================

import type { APIContext } from "astro";
import { handleAuth } from "../../lib/auth";
import { handlePosts } from "../../lib/posts";
import { handleUpload } from "../../lib/upload";

export const ALL = async (ctx: APIContext): Promise<Response> => {
  const { url } = ctx;
  const pathname = url.pathname;

  // —— 认证接口 ——
  if (pathname.startsWith("/api/auth")) {
    return handleAuth(ctx);
  }

  // —— 文章接口 ——
  if (pathname.startsWith("/api/posts")) {
    return handlePosts(ctx);
  }

  // —— 图片上传接口 ——
  if (pathname.startsWith("/api/upload")) {
    return handleUpload(ctx);
  }

  // —— 未知路由 ——
  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
};
