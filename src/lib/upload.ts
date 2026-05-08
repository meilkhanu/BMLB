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
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
];

const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/mp4",
  "audio/x-m4a",
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

// —— POST /api/upload ——
async function handleUploadRequest(ctx: APIContext): Promise<Response> {
  const env = getEnv(ctx.locals);
  if (!env) {
    return json({ error: "运行时不可用（R2 binding 缺失）" }, 500);
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
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(file.type);

  if (!isImage && !isAudio) {
    return json(
      { error: `不支持的文件类型: ${file.type}，仅支持图片(PNG/JPEG/WebP/GIF/SVG/AVIF)或音频(MP3/WAV/OGG/FLAC/M4A)` },
      400
    );
  }

  // 大小校验
  const maxSize = isAudio ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    return json({ error: `文件过大（${isAudio ? '音频最大 50MB' : '图片最大 5MB'}）` }, 400);
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
  return handleUploadRequest(ctx);
}
