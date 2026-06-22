// ============================================================
// src/lib/upload.ts
// 图片上传 — 由 [...all].ts 调用
// Workers → R2  /  ECS → 本地 public/uploads/
//
// POST /api/upload  → 接收 multipart/form-data
// ============================================================

import type { APIContext } from "astro";
import { getDb, getKV, getBucket, isNode } from "./db";
import { verifySession } from "./auth";

// —— R2 公开访问基础 URL ——
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

// —— 生成唯一文件名 ——
function generateKey(originalName: string): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "png";
  const ts = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `uploads/${ts}-${random}.${ext}`;
}

// —— POST /api/upload ——
async function handleUploadRequest(ctx: APIContext): Promise<Response> {
  // 鉴权（两种环境都需要）
  const authed = await verifySession(ctx.request, getKV());
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

  // —— ECS 环境：写入本地 public/uploads/ ——
  if (isNode()) {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const uploadDir = path.join(process.cwd(), "public", "uploads");
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, key), Buffer.from(buffer));
      const url = `/uploads/${key}`;
      return json({ success: true, url, key, size: file.size, type: file.type });
    } catch (e: any) {
      console.error("[upload] ECS local write error:", e);
      return json({ error: "上传失败，请稍后重试" }, 500);
    }
  }

  // —— Workers 环境：上传到 R2 ——
  const bucket = getBucket();
  if (!bucket) {
    return json({ error: "运行时不可用（R2 binding 缺失）" }, 500);
  }

  try {
    await bucket.put(key, buffer, {
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
