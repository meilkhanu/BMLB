// ============================================================
// src/lib/search.ts
// GET /api/search?q=关键字
// 同时搜索 posts + about_works，返回统一格式的结果列表
// 中文关键字使用 LIKE 子串匹配（与站点当前规模匹配，零额外依赖）
// ============================================================

import type { APIContext } from "astro";
import { getDb } from "./db";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeJsonArr(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val !== "string") return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface SearchResult {
  type: "post" | "work";
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  tags: string[];
  publishedAt: string;
  category?: string;   // 仅文章
  featured?: boolean;  // 仅作品
  href: string;        // /blog/xxx 或 /work/xxx（无 slug 作品不可点）
}

export interface SearchResponse {
  query: string;
  total: number;
  results: SearchResult[];
}

export async function handleSearch(ctx: APIContext): Promise<Response> {
  const url = new URL(ctx.request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) return json({ query: "", total: 0, results: [] } satisfies SearchResponse);
  if (q.length > 100) return json({ error: "关键词过长" }, 400);

  const db = await getDb();
  if (!db) return json({ error: "运行时不可用" }, 500);

  // 转义 LIKE 通配符，防止用户输入 % _ 破坏匹配
  const escaped = q.replace(/[%_]/g, (m) => "\\" + m);
  const like = `%${q}%`;
  const likeEsc = `%${escaped}%`;
  // 使用 ESCAPE 子句让反斜杠转义生效
  const escapeClause = " ESCAPE '\\'";

  const results: SearchResult[] = [];

  try {
    // ---- 搜索已发布文章 ----
    const { results: postRows } = await db
      .prepare(
        `SELECT id, slug, title, excerpt, content, category_id, tags, cover_image, published_at
         FROM posts
         WHERE status = 'published'
           AND (title LIKE ?${escapeClause}
             OR excerpt LIKE ?${escapeClause}
             OR content LIKE ?${escapeClause}
             OR tags LIKE ?${escapeClause})
         ORDER BY published_at DESC
         LIMIT 30`
      )
      .bind(likeEsc, likeEsc, likeEsc, likeEsc)
      .all();

    for (const row of postRows || []) {
      const content = row.content || "";
      const excerpt = row.excerpt || "";
      // 优先使用 excerpt；若 excerpt 为空，从 content 中提取关键字附近的片段
      let snippet = excerpt;
      if (!snippet && content) {
        const idx = content.toLowerCase().indexOf(q.toLowerCase());
        if (idx >= 0) {
          const start = Math.max(0, idx - 40);
          snippet = (start > 0 ? "…" : "") + content.slice(start, start + 160) + "…";
        } else {
          snippet = content.slice(0, 160);
        }
      }
      results.push({
        type: "post",
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: snippet.slice(0, 160),
        image: row.cover_image || "",
        tags: safeJsonArr(row.tags),
        publishedAt: row.published_at || "",
        category: row.category_id,
        href: `/blog/${row.slug}`,
      });
    }

    // ---- 搜索作品集 ----
    const { results: workRows } = await db
      .prepare(
        `SELECT id, slug, title, description, content, tags, image, featured
         FROM about_works
         WHERE (title LIKE ?${escapeClause}
             OR description LIKE ?${escapeClause}
             OR content LIKE ?${escapeClause}
             OR tags LIKE ?${escapeClause})
         ORDER BY featured DESC, sort_order ASC, id ASC
         LIMIT 30`
      )
      .bind(likeEsc, likeEsc, likeEsc, likeEsc)
      .all();

    for (const row of workRows || []) {
      const desc = row.description || "";
      const content = row.content || "";
      let snippet = desc;
      if (!snippet && content) {
        const idx = content.toLowerCase().indexOf(q.toLowerCase());
        if (idx >= 0) {
          const start = Math.max(0, idx - 40);
          snippet = (start > 0 ? "…" : "") + content.slice(start, start + 160) + "…";
        } else {
          snippet = content.slice(0, 160);
        }
      }
      const slug = row.slug || "";
      results.push({
        type: "work",
        id: row.id,
        slug,
        title: row.title,
        excerpt: snippet.slice(0, 160),
        image: row.image || "",
        tags: safeJsonArr(row.tags),
        publishedAt: "",
        featured: !!row.featured,
        // 无 slug 的作品不可点击跳转
        href: slug ? `/work/${slug}` : "",
      });
    }

    return json({
      query: q,
      total: results.length,
      results,
    } satisfies SearchResponse);
  } catch (e: any) {
    console.error("[search] error:", e?.message || e);
    return json({ error: "搜索失败" }, 500);
  }
}
