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
  avif: "image/avif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
};

// 不在上表中的扩展名一律按「下载」处理，绝不以 image/svg+xml 或
// text/html 直出——那是把上传目录变成 XSS 载荷投放点。
const DOWNLOAD_ONLY_EXT = new Set(["svg", "html", "htm", "xhtml", "xml", "js", "mjs"]);

const ALLOWED_SERVE_EXT = new Set(Object.keys(MIME_TYPES));

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

  // 只接受白名单内的单段文件名：拒绝多级路径与任何未登记的扩展名。
  // 上传侧已经把扩展名限制在同一张白名单，这里是出站侧的第二道闸。
  const segments = filePath.split("/");
  if (segments.length !== 1) {
    return new Response("Not Found", { status: 404 });
  }
  const ext = (segments[0].split(".").pop() || "").toLowerCase();
  if (!ALLOWED_SERVE_EXT.has(ext)) {
    return new Response("Not Found", { status: 404 });
  }
  if (DOWNLOAD_ONLY_EXT.has(ext)) {
    // 双保险：即使白名单将来误放宽，这类扩展名也只作下载处理
    return new Response("Not Found", { status: 404 });
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
        // 兜底：即便 Content-Type 被误配，也不让浏览器猜成可执行类型
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${segments[0]}"`,
        "Cache-Control": cacheControl,
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
};
