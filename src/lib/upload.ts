// ============================================================
// src/lib/upload.ts
// 图片上传 — 由 [...all].ts 调用
// Workers → R2 binding  /  ECS → 本地 public/uploads/
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
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  // 注意：不在此处放开 image/svg+xml。
  // SVG 可内嵌 <script>，一旦经 /uploads/ 以 image/svg+xml 直出，
  // 就是存储型 XSS 的真入口。本站上传场景（封面/配图/相册）从未用过 SVG。
  // 若将来确需矢量图，先改为「上传即转 PNG」或强制走 CDN 隔离域名。
];

const ALLOWED_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "avif",
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "txt",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  "mp4",
]);

const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
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
  return `${ts}-${random}.${ext}`;
}

/** 从原始文件名的最后一个扩展名（已小写化）。 */
function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

// —— POST /api/upload ——
async function handleUploadRequest(ctx: APIContext): Promise<Response> {
  // 鉴权（所有环境统一走 session；ECS 的 session 同样持久化在 data/app.db 的 kv_store 表中）
  const kv = getKV();
  if (!kv) {
    console.error("[upload] FATAL: KV 存储不可用");
    return json({ error: "运行时不可用" }, 500);
  }
  const authed = await verifySession(ctx.request, kv);
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

  // 文件名校验：必须有一个落盘扩展名，且在白名单内。
  // 只查 file.type 是不够的——它来自客户端 multipart 头，可随意伪造；
  // 而真正决定了「/uploads/ 出去时按什么 MIME 直出」的是磁盘上的扩展名。
  if (!file.name || !file.name.includes(".")) {
    return json({ error: "文件名缺少扩展名" }, 400);
  }
  const ext = extOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return json({ error: `不支持的扩展名: .${ext}` }, 400);
  }

  // 类型校验（MIME 与扩展名双闸，任一不符即拒）
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(file.type);
  const isDoc = ALLOWED_DOC_TYPES.includes(file.type);

  if (!isImage && !isAudio && !isDoc) {
    return json(
      { error: `不支持的文件类型: ${file.type}，仅支持图片、音频或文档(PDF/Word/PPT/TXT)` },
      400
    );
  }

  // MIME 与扩展名必须自洽：防 image/png 头 + .svg 落盘的绕过组合
  const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
  const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "flac", "m4a", "mp4"]);
  const DOC_EXT = new Set(["pdf", "doc", "docx", "ppt", "pptx", "txt"]);
  const extMatchesMime =
    (isImage && IMAGE_EXT.has(ext)) ||
    (isAudio && AUDIO_EXT.has(ext)) ||
    (isDoc && DOC_EXT.has(ext));
  if (!extMatchesMime) {
    return json(
      { error: `文件类型与扩展名不匹配: ${file.type} / .${ext}` },
      400
    );
  }

  const maxSize = isDoc ? 50 * 1024 * 1024 : isAudio ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    return json({ error: `文件过大（${isDoc ? '文档最大 50MB' : isAudio ? '音频最大 50MB' : '图片最大 20MB'}）` }, 400);
  }

  const key = generateKey(file.name);
  const buffer = await file.arrayBuffer();

  // —— ECS 环境：写入 data/uploads/（不受 git clean / astro build 影响）——
  if (isNode()) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, key), Buffer.from(buffer));
    return json({ success: true, url: `/uploads/${key}`, key, size: file.size, type: file.type });
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
