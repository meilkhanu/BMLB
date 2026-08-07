// ============================================================
// src/lib/stats.ts — 全站访问统计（PV / UV）
//
// GET  /api/stats → { views, visitors }   服务端 60s 缓存
// POST /api/stats → 记录一次访问（views+1，新访客 visitors+1）
//
// UV 口径：ip+ua 的 md5 哈希去重（不存原始 IP），全站历史唯一访客
// ============================================================

import type { APIContext } from "astro";
import { getDb } from "./db";
import { md5 } from "./md5";

// —— bot / crawler 过滤 ——
const BOT_RE =
	/bot|crawl|spider|slurp|semrush|ahrefs|curl|wget|python-requests|headless|phantomjs|lighthouse|preview|monitor|scanner/i;

// —— GET 结果内存缓存（60s，避免每次刷新都查库）——
let cache: { data: { views: number; visitors: number }; ts: number } | null = null;
const CACHE_TTL = 60_000;

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function getClientIp(ctx: APIContext): string {
	const xff = ctx.request.headers.get("x-forwarded-for");
	if (xff) return xff.split(",")[0].trim();
	const real = ctx.request.headers.get("x-real-ip");
	if (real) return real.trim();
	return (ctx as any).clientAddress || "unknown";
}

// ============================================================
// GET — 读取全站总数
// ============================================================
async function handleGetStats(): Promise<Response> {
	if (cache && Date.now() - cache.ts < CACHE_TTL) {
		return json(cache.data);
	}

	try {
		const db = await getDb();
		const row = (await db.prepare(
			"SELECT views, visitors FROM site_stats WHERE id = 1"
		).all()) as any;
		const r = row?.results?.[0] || { views: 0, visitors: 0 };
		cache = { data: { views: r.views, visitors: r.visitors }, ts: Date.now() };
		return json(cache.data);
	} catch (e) {
		console.error("[stats] GET failed:", e);
		return json({ error: "stats unavailable" }, 500);
	}
}

// ============================================================
// POST — 记录一次访问
// ============================================================
async function handleTrack(ctx: APIContext): Promise<Response> {
	try {
		const ua = ctx.request.headers.get("user-agent") || "";

		// 爬虫 / 无 UA 直接放行不计数
		if (!ua || BOT_RE.test(ua)) {
			return new Response(null, { status: 204 });
		}

		const ip = getClientIp(ctx);
		const hash = md5(`${ip}|${ua}`);

		const db = await getDb();

		// 新访客判定（INSERT OR IGNORE 返回 changes=1 即为首次）
		const ins = await db.prepare(
			"INSERT OR IGNORE INTO visitor_log (hash) VALUES (?)"
		).bind(hash).run();
		const isNew = (ins as any)?.meta?.changes > 0 || (ins as any)?.changes > 0;

		if (isNew) {
			await db.prepare(
				"UPDATE site_stats SET views = views + 1, visitors = visitors + 1, updated_at = datetime('now') WHERE id = 1"
			).run();
		} else {
			await db.prepare(
				"UPDATE site_stats SET views = views + 1, updated_at = datetime('now') WHERE id = 1"
			).run();
		}

		cache = null; // 让下次 GET 重新查库
		return new Response(null, { status: 204 });
	} catch (e) {
		console.error("[stats] track failed:", e);
		return new Response(null, { status: 204 }); // 统计失败不影响访客体验
	}
}

// ============================================================
// 路由入口
// ============================================================
export async function handleStats(ctx: APIContext): Promise<Response> {
	const method = ctx.request.method;
	if (method === "GET") return handleGetStats();
	if (method === "POST") return handleTrack(ctx);
	return json({ error: "Method Not Allowed" }, 405);
}
