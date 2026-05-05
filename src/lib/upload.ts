// ============================================================
// src/lib/upload.ts
// 图片上传到 R2 — 由 [...all].ts 调用
//
// POST /api/upload  → 接收 multipart/form-data，上传到 R2
// ============================================================

import type { APIContext } from "astro";
import { verifySession, type Env } from "./auth";

// —— R2 公开访问基础 URL ——
// Cloudflare R2 S3 endpoint; 需在 Cloudflare 控制台开启 Public Access
const R2_PUBLIC_BASE =
  "https://pub-5eb99be06b64411bbfd2b80c94822c5f.r2.dev";

// —— 限制 ——
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEnv(locals: APIContext["locals"]): Env | undefined {
  return (locals as any).runtime?.env as Env | undefined;
}

// —— 生成唯一文件名 ——
function generateKey(originalName: string): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "png";
  const ts = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `uploads/${ts}-${random}.${ext}`;
}

// —— POST /api/upload 内部实现 ——
async function doUpload(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) {
    return json({ error: "运行时不可用（R2 binding 缺失）" }, 500);
  }

  // 检查 R2 绑定
  if (!env.IMAGES) {
    console.error("[upload] IMAGES binding missing — 请在 Cloudflare Pages 设置中绑定 R2 bucket");
    return json({ error: "存储服务未配置（R2 binding 缺失）" }, 500);
  }

  // 鉴权
  const authed = await verifySession(ctx.request, env);
  if (!authed) {
    return json({ error: "未登录" }, 401);
  }

  // 解析 multipart
  let formData: FormData;
  try {
    formData = await ctx.request.formData();
  } catch {
    return json({ error: "无效的表单数据" }, 400);
  }

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File)) {
    return json({ error: "缺少文件" }, 400);
  }

  // 类型校验
  if (!ALLOWED_TYPES.includes(file.type)) {
    return json(
      { error: `不支持的图片类型: ${file.type}，仅支持 PNG/JPEG/WebP/GIF/SVG/AVIF` },
      400
    );
  }

  // 大小校验
  if (file.size > MAX_FILE_SIZE) {
    return json({ error: `文件过大（最大 5MB）` }, 400);
  }

  const key = generateKey(file.name);
  const buffer = await file.arrayBuffer();

  try {
    await env.IMAGES.put(key, buffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  } catch (e: any) {
    console.error("[upload] R2 put error:", e);
    return json({ error: "上传失败，请稍后重试" }, 500);
  }

  const url = `${R2_PUBLIC_BASE}/${key}`;

  return json({
    success: true,
    url,
    key,
    size: file.size,
    type: file.type,
  });
}

// —— 主入口 ——
export async function handleUpload(ctx: APIContext): Promise<Response> {
  if (ctx.request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }
  return doUpload(ctx);
}
