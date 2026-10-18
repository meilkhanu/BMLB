/**
 * src/views/track.ts
 * 移动端「星轨」视图 —— 星图在手机上没法用（卡片要缩到 0.5 才能塞下 20 张，字全糊），
 * 所以 <768px 改成一条纵向的星轨：左侧一条发光轨道，卡片沿轨排布，原生滚动。
 *
 * 只在 constellationView.mount() 里按屏宽分流，仍然复用同一个视图模式（'constellation'），
 * 因此 localStorage / 切换器 / SPA 逻辑都不用改。
 */

export interface TrackCardData {
  slug: string;
  title: string;
  excerpt: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  coverImage: string;
  publishedAt: string;
  index: number;
}

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );

const fmtDate = (s: string) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s || "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function mountTrack(stage: HTMLElement, cards: TrackCardData[]): () => void {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const wrap = document.createElement("div");
  wrap.className = "star-track";
  wrap.innerHTML = `
    <div class="track-spine" aria-hidden="true"></div>
    <header class="track-head">
      <h2 class="track-title">星轨</h2>
      <p class="track-sub">${cards.length} 篇 · 向上滑动</p>
    </header>
    <ol class="track-list">
      ${cards
        .map((d) => {
          const cover = d.coverImage
            ? `<div class="track-cover"><img src="${esc(d.coverImage)}" alt="" loading="lazy" decoding="async"></div>`
            : `<div class="track-cover track-cover--fallback" style="background:linear-gradient(135deg,${esc(d.categoryColor)},${esc(d.categoryColor)}44)"><span>${esc(d.categoryName)}</span></div>`;
          return `
        <li class="track-item" style="--cat:${esc(d.categoryColor)}">
          <span class="track-dot" aria-hidden="true"></span>
          <a class="track-card" href="/blog/${encodeURIComponent(d.slug)}">
            ${cover}
            <div class="track-body">
              <div class="track-meta">
                <span class="track-badge">${esc(d.categoryName)}</span>
                <span class="track-date">${esc(fmtDate(d.publishedAt))}</span>
              </div>
              <h3 class="track-card-title">${esc(d.title)}</h3>
              ${d.excerpt ? `<p class="track-excerpt">${esc(d.excerpt)}</p>` : ""}
            </div>
          </a>
        </li>`;
        })
        .join("")}
    </ol>
  `;
  stage.appendChild(wrap);

  // 逐条浮现（尊重「减少动态效果」：直接显示）
  let io: IntersectionObserver | null = null;
  const items = Array.from(wrap.querySelectorAll(".track-item"));
  if (reduce || typeof IntersectionObserver === "undefined") {
    items.forEach((el) => el.classList.add("is-in"));
  } else {
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io?.unobserve(e.target);
          }
        });
      },
      { root: wrap, threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    items.forEach((el) => io!.observe(el));
  }

  return () => {
    io?.disconnect();
    wrap.remove();
  };
}
