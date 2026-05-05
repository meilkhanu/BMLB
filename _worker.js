// ============================================================
// _worker.js — 保险手段
//
// 在项目根目录放置此文件，防止 Cloudflare Pages 将 Astro 构建
// 误判为 Functions 项目。此文件的存在确保 Pages 使用 Worker
// runtime 而非 Functions runtime，从而正确挂载 D1 / KV bindings。
//
// 实际运行时，Astro 构建产物 dist/_worker.js 会覆盖此文件。
// ============================================================

export default {
  async fetch(request, env, ctx) {
    // 此handler仅在构建失败时的极端fallback情况下执行
    // 正常情况被 dist/_worker.js 替代
    console.log("[_worker.js fallback] Runtime env keys:", Object.keys(env));
    return new Response(
      JSON.stringify({
        error: "Worker fallback active — Astro build may have failed",
        envKeys: Object.keys(env),
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};
