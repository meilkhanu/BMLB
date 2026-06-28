import type { APIRoute } from 'astro';
import { getDb } from '../lib/db';
import { SITE_CONFIG } from '../config';

export const GET: APIRoute = async ({ url }) => {
  const db = await getDb();

  let posts: any[] = [];
  if (db) {
    try {
      const { results } = await db
        .prepare(
          "SELECT slug, title, excerpt, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 20"
        )
        .all();
      posts = results || [];
    } catch (e: any) {
      console.error('[rss] D1 query failed:', e?.message || e);
    }
  }

  const siteUrl = url.origin;

  const items = posts
    .map((p) => {
      const title = escapeXml(p.title || '');
      const link = `${siteUrl}/blog/${p.slug}`;
      const description = escapeXml(p.excerpt || '');
      const pubDate = p.published_at ? new Date(p.published_at + (p.published_at.includes('T') ? '' : 'T00:00:00Z')).toUTCString() : '';
      return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description>${description}</description>
      <guid isPermaLink="true">${link}</guid>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_CONFIG.siteName)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(SITE_CONFIG.siteName)} — 个人博客</description>
    <language>zh-CN</language>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
