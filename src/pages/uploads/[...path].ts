// ============================================================
// src/pages/uploads/[...path].ts
// ECS 环境：从 data/uploads/ 提供上传的图片/音频文件
// Workers 环境：不使用此路由（文件存储在 R2，返回完整 URL）
// ============================================================

import type { APIContext } from "astro";
import { isNode } from "../../lib/db";

// 常见 MIME 类型映射
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
};

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return MIME_TYPES[ext] || "application/octet-stream";
}

export const GET = async ({ params }: APIContext): Promise<Response> => {
  if (!isNode()) {
    return new Response("Not Found", { status: 404 });
  }

  const filePath = params.path;
  if (!filePath) {
    return new Response("Not Found", { status: 404 });
  }

  // 安全检查：防止路径遍历攻击
  if (filePath.includes("..") || filePath.includes("\0") || filePath.startsWith("/")) {
    return new Response("Bad Request", { status: 400 });
  }

  const fs = await import("fs/promises");
  const path = await import("path");
  const fullPath = path.join(process.cwd(), "data", "uploads", filePath);

  try {
    const fileBuffer = await fs.readFile(fullPath);
    const contentType = getMimeType(filePath);
    const cacheControl = "public, max-age=31536000, immutable";

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
};
