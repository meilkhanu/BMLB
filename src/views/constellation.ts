/**
 * 星图视野（constellation）
 *
 * 交互模型（方案 v5 定稿）：
 *   - 默认拖动 = 平移相机（camera.x / camera.y），整个星盘跟随
 *   - 滚轮 / 触控板双指 / 双指捏合 = 缩放，zoom ∈ [0.75, 1.35]，锚定指针下的世界点
 *   - 轻点卡片（位移 < 4px）= 跳转 /blog/<slug>
 *   - 长按卡片 300ms / 按住左上 ⠿ 手柄 = 定星模式，该卡脱离相机单独移动
 *   - 边界 = 带阻尼的弹性星团（无无限世界开关）
 *
 * 渲染：
 *   - #canvas-stage 统一 perspective:1200px + transform-style:preserve-3d
 *   - 每帧按卡片中心到视口中心的距离 t 计算 scale / rotateX / rotateY / translateZ
 *   - 单卡单条 transform 字符串一次写入（实测 45 卡 0.3ms/帧）
 *
 * 性能：
 *   - 距视口中心 > 1.25 × R → visibility:hidden + pointer-events:none + 关 blur
 *   - backdrop-filter 只对 t < 0.75 的可见卡启用
 *   - 连线在拖动中暂停重算，松手补画
 */

import type { ViewModule } from "./registry";

interface StarCardData {
  slug: string;
  title: string;
  excerpt: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  tags: string[];
  coverImage: string;
  publishedAt: string;
  index: number;
}

interface StarNode {
  data: StarCardData;
  x: number; // 螺旋世界坐标
  y: number;
  px: number; // 定星后的世界坐标
  py: number;
  el: HTMLElement | null;
  pinned: boolean;
  blurred: boolean;
  focused: boolean;
}

// —— 常量（方案定稿值）——
const TILT_DEG = 22; // 最大倾斜角
const Z_LIFT = 120; // 中心最大前凸
const SCALE_EDGE = 0.6; // 边缘最小缩放
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.35;
const SPACING = 168; // 螺旋基础间距
const GOLDEN = 2.399963229728653; // 黄金角
const EDGE_LIMIT = 200; // 相机活动半径 = 最外圈 + 该值
const OVERSCROLL = 0.35; // 越界阻尼系数
const CLICK_SLOP = 4; // 位移 < 4px 视为点击
const LONG_PRESS_MS = 300;
const CULL_FACTOR = 1.25; // 视口剔除半径倍数
const BLUR_T = 0.75; // t < 该值才启用 backdrop-filter
const FOCUS_T = 0.35; // t < 该值判定为聚焦卡
const LINK_T = 0.85; // 连线两端 t > 该值则淡出
const LS_KEY = "bmlb-starmap";

const CATEGORY_EMOJI: Record<string, string> = {
  notes: "✎",
  critique: "❖",
  stack: "⚙",
  body: "❋",
  transit: "➶",
  archive: "▣",
};

/** 六边形格心吸附（pointy-top axial 坐标），保证螺旋槽位不重叠、间距均匀 */
function hexSnap(x: number, y: number): { x: number; y: number } {
  const size = SPACING;
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  let rx = Math.round(q),
    rz = Math.round(r);
  const ry = -rx - rz;
  const dx = Math.abs(rx - q),
    dz = Math.abs(rz - r),
    dy = Math.abs(ry - (-q - r));
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) rz = -rx - ry;
  return {
    x: size * (Math.sqrt(3) * rx + (Math.sqrt(3) / 2) * rz),
    y: size * ((3 / 2) * rz),
  };
}

function spiralSlot(n: number): { x: number; y: number } {
  const r = SPACING * Math.sqrt(n);
  const a = n * GOLDEN;
  return hexSnap(r * Math.cos(a), r * Math.sin(a));
}

function fmtDate(s: string): string {
  if (!s) return "----.--.--";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function esc(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c,
  );
}

// —— 模块级状态：mount/unmount 之间共享，便于彻底清理 ——
let cleanupFn: (() => void) | null = null;

export const constellationView: ViewModule = {
  id: "constellation",
  label: "星图视野",

  mount() {
    // 硬防重入：卡片容器里还有卡片说明上一套没退净（SPA 重放 / 重复 mount），
    // 必须先彻底 unmount 再重建，否则会出现两套卡片叠加、其中一套的 rAF 已被取消而永远静止
    if (cleanupFn) cleanupFn();
    const existingCards = document.getElementById('canvas-cards');
    if (existingCards && existingCards.childElementCount > 0) {
      existingCards.replaceChildren();
    }
    const stage = document.getElementById('canvas-stage') as HTMLElement | null;
    const cardsWrap = document.getElementById(
      "canvas-cards",
    ) as HTMLElement | null;
    const linksLayer = document.getElementById(
      "canvas-links",
    ) as HTMLElement | null;
    const dataEl = document.getElementById(
      "star-cards-data",
    ) as HTMLElement | null;
    if (!stage || !cardsWrap || !linksLayer || !dataEl) return;

    let cards: StarCardData[] = [];
    try {
      cards = JSON.parse(dataEl.dataset.cards || "[]");
    } catch {
      /* ignore */
    }

    stage.classList.remove("hidden");
    stage.setAttribute("aria-hidden", "false");

    // —— 空态 ——
    if (cards.length === 0) {
      stage.insertAdjacentHTML(
        "beforeend",
        `
        <div class="star-empty absolute inset-0 flex items-center justify-center px-6">
          <div class="max-w-md w-full rounded-2xl border border-white/10 bg-[rgba(18,22,34,.72)] backdrop-blur-md p-8 text-center">
            <div class="text-4xl mb-4 opacity-60">✧</div>
            <h2 class="font-xiaolai text-xl font-bold text-[#EAEAEA] mb-2">星图还是一片暗空</h2>
            <p class="text-sm text-[#8B94A7] leading-relaxed mb-6">每一篇文章都会成为这里的一颗星。<br>写第一篇，星盘就会开始运转。</p>
            <a href="/admin" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#22D3EE]/15 border border-[#22D3EE]/30 text-[#22D3EE] text-sm font-medium hover:bg-[#22D3EE]/25 transition-colors">去后台写第一篇</a>
          </div>
        </div>`,
      );
      cleanupFn = () => {
        // 只摘掉空态卡，保留 SSR 骨架
        const empty = stage.querySelector(".star-empty");
        if (empty && empty.parentNode) empty.parentNode.removeChild(empty);
        stage.classList.add("hidden");
        stage.setAttribute("aria-hidden", "true");
        cleanupFn = null;
      };
      return;
    }

    // —— 读持久化 ——
    let pinnedMap: Record<string, { x: number; y: number }> = {};
    let savedZoom = 1;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        pinnedMap =
          o && typeof o.pinned === "object" && o.pinned ? o.pinned : {};
        if (typeof o.zoom === "number")
          savedZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, o.zoom));
      }
    } catch {
      /* ignore */
    }

    // —— 相机 ——
    const camera = { x: 0, y: 0, zoom: savedZoom };

    // —— 节点：螺旋入轨（index 由 SSR 按 publishedAt 倒序给出，确定性）——
    const nodes: StarNode[] = cards.map((c) => {
      const slot = spiralSlot(c.index);
      const p = pinnedMap[c.slug];
      return {
        data: c,
        x: slot.x,
        y: slot.y,
        px: p ? p.x : 0,
        py: p ? p.y : 0,
        el: null,
        pinned: !!p,
        blurred: false,
        focused: false,
      };
    });

    const savePinned = () => {
      const obj: Record<string, { x: number; y: number }> = {};
      nodes.forEach((n) => {
        if (n.pinned)
          obj[n.data.slug] = { x: Math.round(n.px), y: Math.round(n.py) };
      });
      try {
        localStorage.setItem(
          LS_KEY,
          JSON.stringify({
            ui: "constellation",
            pinned: obj,
            zoom: camera.zoom,
          }),
        );
      } catch {
        /* ignore */
      }
    };

    let rMax = 0;
    nodes.forEach((n) => {
      rMax = Math.max(rMax, Math.hypot(n.x, n.y));
    });
    const rCam = rMax + EDGE_LIMIT;

    // —— 建卡 ——
    const frag = document.createDocumentFragment();
    nodes.forEach((n) => {
      const d = n.data;
      const el = document.createElement("div");
      el.className = "star-card";
      el.dataset.slug = d.slug;
      el.style.setProperty("--cat", d.categoryColor);
      el.innerHTML = `
        <span class="star-handle" aria-hidden="true">⠿</span>
        <div class="star-cover">${
          d.coverImage
            ? `<img src="${esc(d.coverImage)}" alt="" loading="lazy" decoding="async">`
            : `<span class="star-cover-fallback" style="background:linear-gradient(135deg,${d.categoryColor},${d.categoryColor}55)">${CATEGORY_EMOJI[d.categoryId] || "✦"}</span>`
        }</div>
        <div class="star-badge">${esc(d.categoryName)}</div>
        <div class="star-body">
          <h3 class="star-title">${esc(d.title)}</h3>
          <p class="star-excerpt">${esc(d.excerpt)}</p>
          <div class="star-meta"><span>NO.${String(d.index + 1).padStart(3, "0")}</span><span>${fmtDate(d.publishedAt)}</span></div>
          <div class="star-tags">${d.tags
            .slice(0, 3)
            .map((t) => `<span>#${esc(t)}</span>`)
            .join("")}</div>
        </div>`;
      n.el = el;
      frag.appendChild(el);
    });
    cardsWrap.appendChild(frag);

    // —— 连线（仅同分类且螺旋索引相邻）——
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute(
      "class",
      "absolute inset-0 w-full h-full pointer-events-none",
    );
    linksLayer.appendChild(svg);
    interface LinkPair {
      a: StarNode;
      b: StarNode;
      el: SVGLineElement;
      ox1?: number; oy1?: number; ox2?: number; oy2?: number; oop?: number;
    }
    const linkPairs: LinkPair[] = [];
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i - 1].data.categoryId !== nodes[i].data.categoryId) continue;
      const ln = document.createElementNS(svgNS, "line");
      ln.setAttribute("stroke", nodes[i].data.categoryColor);
      ln.setAttribute("stroke-width", "1");
      ln.setAttribute("opacity", "0");
      svg.appendChild(ln);
      linkPairs.push({ a: nodes[i - 1], b: nodes[i], el: ln });
    }

    // —— 控制条 ——
    const controls = document.createElement("div");
    controls.className = "star-controls";
    controls.innerHTML = `
      <button type="button" data-act="center" title="回到中心">⌂</button>
      <button type="button" data-act="unpin" title="解除所有定星">✥</button>
      <span class="star-count">${nodes.length} 星</span>`;
    stage.appendChild(controls);

    // —— 几何辅助 ——
    const rect = () => stage.getBoundingClientRect();
    const cardW = () =>
      window.innerWidth >= 768 ? 256 : Math.min(window.innerWidth * 0.78, 240);
    const cardH = () => Math.round(cardW() * 0.69);
    /** 世界坐标 → 屏幕坐标（已含相机与缩放） */
    const toScreen = (n: StarNode, cx: number, cy: number) =>
      n.pinned
        ? { x: n.px, y: n.py }
        : {
            x: (n.x - camera.x) * camera.zoom + cx,
            y: (n.y - camera.y) * camera.zoom + cy,
          };

    // 只读调试探针：供验收脚本断言内部状态（不改动任何逻辑）
    (window as any).__starDebug = () => ({
      camera: { ...camera },
      rCam,
      rMax,
      nodeCount: nodes.length,
      linkCount: linkPairs.length,
      visible: nodes.filter((n) => n.el && n.el.style.visibility !== "hidden")
        .length,
      culled: nodes.filter((n) => n.el && n.el.style.visibility === "hidden")
        .length,
      pinned: nodes
        .filter((n) => n.pinned)
        .map((n) => ({
          slug: n.data.slug,
          px: Math.round(n.px),
          py: Math.round(n.py),
        })),
      nearest: (() => {
        const r = rect(),
          cx = r.width / 2,
          cy = r.height / 2;
        const scored = nodes.map((n) => ({
          slug: n.data.slug,
          d: Math.hypot(toScreen(n, cx, cy).x - cx, toScreen(n, cx, cy).y - cy),
        }));
        scored.sort((a, b) => a.d - b.d);
        return scored.slice(0, 2);
      })(),
      cards: nodes
        .filter((n) => n.el)
        .map((n) => {
          const r = rect(),
            cx = r.width / 2,
            cy = r.height / 2;
          const s = toScreen(n, cx, cy);
          const dx = s.x - cx,
            dy = s.y - cy;
          const R = Math.min(r.width, r.height) * 0.5 + 120;
          const t = Math.min(1, Math.hypot(dx, dy) / R);
          return {
            slug: n.data.slug,
            t: +t.toFixed(3),
            blurred: n.blurred,
            focused: n.focused,
            z: n.el?.style.zIndex,
            tf: n.el?.style.transform || "",
          };
        }),
    });

    // —— 帧循环 ——
    let rafId = 0;
    let gestureBusy = false; // 拖动中暂停连线重算
    let zoomSpring = 0; // 缩放回弹目标（0 = 无）
    let linksDirty = true; // 连线是否需要重算（相机/缩放/定星变化时置脏，静止帧零开销）

    const render = () => {
      rafId = requestAnimationFrame(render);
      const r = rect();
      const cx = r.width / 2,
        cy = r.height / 2;
      const R = Math.min(r.width, r.height) * 0.5 + 120;
      const z = camera.zoom;
      const cw = cardW(),
        ch = cardH();

      // 缩放回弹（控制条回到中心时的平滑过渡）
      if (zoomSpring) {
        const target = zoomSpring;
        camera.zoom += (target - camera.zoom) * 0.16;
        linksDirty = true;
        if (Math.abs(target - camera.zoom) < 0.002) {
          camera.zoom = target;
          zoomSpring = 0;
        }
      }

      // 相机越界阻尼：超过活动半径时按 OVERSCROLL 阻滞（越拉越沉）
      const dCam = Math.hypot(camera.x, camera.y);
      if (dCam > rCam) {
        const k = rCam + (dCam - rCam) * OVERSCROLL;
        camera.x = (camera.x / dCam) * k;
        camera.y = (camera.y / dCam) * k;
        linksDirty = true;
      }

      for (const n of nodes) {
        const el = n.el;
        if (!el) continue;
        const s = toScreen(n, cx, cy);
        const dx = s.x - cx,
          dy = s.y - cy;
        const dist = Math.hypot(dx, dy);
        const t = Math.min(1, dist / R);

        const cull = dist > R * CULL_FACTOR;
        if (cull) {
          if (el.style.visibility !== 'hidden') {
            el.style.visibility = 'hidden';
            el.style.pointerEvents = 'none';
          }
          // 剔除时同步复位状态类，避免残留（否则回可见时会闪一下旧皮肤）
          if (n.blurred) { n.blurred = false; el.classList.remove('star-blur'); }
          if (n.focused) { n.focused = false; el.classList.remove('star-focus'); }
          continue;
        }
        if (el.style.visibility === "hidden") {
          el.style.visibility = "";
          el.style.pointerEvents = "";
        }

        const scale = Math.max(SCALE_EDGE, 1 - t * 0.4) * z;
        const rotY = (dx / R) * TILT_DEG;
        const rotX = -(dy / R) * TILT_DEG;
        const tz = (1 - t) * Z_LIFT;

        el.style.zIndex = String(100 + Math.round(tz));
        el.style.transform = `translate(-50%,-50%) translate3d(${(s.x - cw / 2).toFixed(1)}px,${(s.y - ch / 2).toFixed(1)}px,${tz.toFixed(1)}px) scale(${scale.toFixed(3)}) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;

        const wantBlur = t < BLUR_T;
        if (wantBlur !== n.blurred) {
          n.blurred = wantBlur;
          el.classList.toggle("star-blur", wantBlur);
        }
        const wantFocus = t < FOCUS_T;
        if (wantFocus !== n.focused) {
          n.focused = wantFocus;
          el.classList.toggle("star-focus", wantFocus);
        }
      }

      // 连线：仅当相机/缩放/定星发生变化时重算（linksDirty），静止帧零开销
      if (!gestureBusy && linksDirty) {
        linksDirty = false;
        for (const p of linkPairs) {
          const sa = toScreen(p.a, cx, cy),
            sb = toScreen(p.b, cx, cy);
          const ta = Math.min(1, Math.hypot(sa.x - cx, sa.y - cy) / R);
          const tb = Math.min(1, Math.hypot(sb.x - cx, sb.y - cy) / R);
          const op =
            ta > LINK_T || tb > LINK_T
              ? 0
              : 0.34 * (1 - Math.max(ta, tb) / LINK_T);
          // 数值缓存比较，避免 getAttribute 读 DOM
          if (p.ox1 === sa.x && p.oy1 === sa.y && p.ox2 === sb.x && p.oy2 === sb.y && p.oop === op) continue;
          p.ox1 = sa.x; p.oy1 = sa.y; p.ox2 = sb.x; p.oy2 = sb.y; p.oop = op;
          const el = p.el;
          el.setAttribute('x1', sa.x.toFixed(1));
          el.setAttribute('y1', sa.y.toFixed(1));
          el.setAttribute('x2', sb.x.toFixed(1));
          el.setAttribute('y2', sb.y.toFixed(1));
          el.setAttribute('opacity', op.toFixed(3));
        }
      }
    };
    render();

    // —— 手势 ——
    let pointerId = -1;
    let startX = 0,
      startY = 0;
    let camStartX = 0,
      camStartY = 0;
    let movedDist = 0;
    let longPressTimer = 0;
    let pinTarget: StarNode | null = null;

    const clearLongPress = () => {
      if (longPressTimer) {
        window.clearTimeout(longPressTimer);
        longPressTimer = 0;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (pointerId !== -1) return; // 只跟第一根
      const target = e.target as HTMLElement;
      const card = target.closest?.(".star-card") as HTMLElement | null;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      camStartX = camera.x;
      camStartY = camera.y;
      movedDist = 0;
      gestureBusy = true;
      zoomSpring = 0;

      // 3D 变换后 hit-test 可能落到容器（背面/边缘），用坐标 proximity 反查兜底
      let hit: StarNode | null = null;
      if (card) {
        hit = nodes.find((x) => x.el === card) || null;
      }
      if (!hit) {
        const r = rect();
        const cx = r.width / 2,
          cy = r.height / 2;
        const px = e.clientX - r.left,
          py = e.clientY - r.top;
        const cw = cardW(),
          chh = cardH();
        let best = Infinity;
        for (const n of nodes) {
          if (!n.el || n.el.style.visibility === 'hidden') continue;
          // toScreen 返回相对视口中心的坐标，换算成相对左上角再比较
          const s = toScreen(n, cx, cy);
          const sx = s.x + cx,
            sy = s.y + cy;
          if (Math.abs(sx - px) < cw / 2 && Math.abs(sy - py) < chh / 2) {
            const d = (sx - px) ** 2 + (sy - py) ** 2;
            if (d < best) {
              best = d;
              hit = n;
            }
          }
        }
      }
      const cardNode = hit;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      // 1) 手柄：直接定星
      if (cardNode && target.closest('.star-handle')) {
        const r = rect(),
          cx = r.width / 2,
          cy = r.height / 2;
        cardNode.pinned = true;
        cardNode.px = cx;
        cardNode.py = cy; // 定星卡锚在视口中心
        pinTarget = cardNode;
        linksDirty = true;
        cardNode.el?.classList.add('star-pinning');
        savePinned();
        e.preventDefault();
        return;
      }
      // 2) 长按卡片（鼠标/触控笔）：进定星模式
      if (cardNode && e.pointerType !== 'touch') {
        longPressTimer = window.setTimeout(() => {
          longPressTimer = 0;
          const n = cardNode;
          if (!n) return;
          const r = rect(),
            cx = r.width / 2,
            cy = r.height / 2;
          n.pinned = true;
          n.px = cx;
          n.py = cy;
          pinTarget = n;
          linksDirty = true;
          n.el?.classList.add('star-pinning');
          savePinned();
          if (navigator.vibrate) navigator.vibrate(15);
        }, LONG_PRESS_MS);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX,
        dy = e.clientY - startY;
      const d = Math.hypot(dx, dy);
      if (d > movedDist) movedDist = d;
      if (movedDist > CLICK_SLOP) clearLongPress();

      if (pinTarget) {
        // 定星卡：锚点跟手（屏幕坐标，钉子钉在指下）
        const r = rect();
        pinTarget.px = r.width / 2 + dx;
        pinTarget.py = r.height / 2 + dy;
        linksDirty = true;
      } else {
        // 漫游：相机反向平移
        camera.x = camStartX - dx;
        camera.y = camStartY - dy;
        linksDirty = true;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      clearLongPress();
      try {
        stage.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      gestureBusy = false;
      pointerId = -1;

      if (pinTarget) {
        pinTarget.el?.classList.remove("star-pinning");
        savePinned();
        pinTarget = null;
        linksDirty = true;
        return;
      }
      // 轻点（未位移）→ 跳转（同样用坐标反查，规避 3D hit-test 落到容器的问题）
      if (movedDist < CLICK_SLOP) {
        const r = rect();
        const cx = r.width / 2,
          cy = r.height / 2;
        const px = e.clientX - r.left,
          py = e.clientY - r.top;
        const cw = cardW(),
          chh = cardH();
        let slug: string | null = null;
        let best = Infinity;
        for (const n of nodes) {
          if (!n.el || n.el.style.visibility === 'hidden') continue;
          // toScreen 返回的是相对视口中心的坐标，这里换算成相对左上角再比较
          const s = toScreen(n, cx, cy);
          const sx = s.x + cx,
            sy = s.y + cy;
          if (Math.abs(sx - px) < cw / 2 && Math.abs(sy - py) < chh / 2) {
            const d = (sx - px) ** 2 + (sy - py) ** 2;
            if (d < best) {
              best = d;
              slug = n.data.slug;
            }
          }
        }
        if (slug) window.location.href = '/blog/' + encodeURIComponent(slug);
      }
    };

    // 滚轮 / 触控板：缩放锚定指针下的世界点
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomSpring = 0;
      const r = rect();
      const cx = r.width / 2,
        cy = r.height / 2;
      // 指针在旧缩放下的世界偏移
      const wx = (e.clientX - r.left - cx) / camera.zoom;
      const wy = (e.clientY - r.top - cy) / camera.zoom;
      const prev = camera.zoom;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.008 : 0.0016));
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev * factor));
      camera.zoom = next;
      // 补偿相机，使指针下的世界点保持不动
      const k = next / prev;
      camera.x = wx - (wx - camera.x) / k;
      camera.y = wy - (wy - camera.y) / k;
      linksDirty = true;
    };

    // 双指捏合
    let pinchStart = 0,
      pinchZoomStart = 1;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinchStart = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchZoomStart = camera.zoom;
      clearLongPress();
      // 打断正在进行的单指手势
      pointerId = -1;
      gestureBusy = true;
      if (pinTarget) {
        pinTarget.el?.classList.remove("star-pinning");
        pinTarget = null;
        linksDirty = true;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchStart) return;
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      camera.zoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, pinchZoomStart * (d / pinchStart)),
      );
      linksDirty = true;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStart = 0;
        gestureBusy = false;
        savePinned();
      }
    };

    const onControlClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      if (btn.dataset.act === "center") {
        camera.x = 0;
        camera.y = 0;
        zoomSpring = 1;
        gestureBusy = false;
        linksDirty = true;
      } else if (btn.dataset.act === "unpin") {
        const had = nodes.some((n) => n.pinned);
        nodes.forEach((n) => {
          n.pinned = false;
          n.el?.classList.remove("star-pinning");
        });
        if (had) linksDirty = true;
        savePinned();
      }
    };
    controls.addEventListener("click", onControlClick);

    const onResize = () => {
      /* 卡片位置每帧读 getBoundingClientRect，自适应无需额外处理；但 R 变了阈值也变，需重算连线 */
      linksDirty = true;
    };
    window.addEventListener("resize", onResize);

    const onCtx = (e: Event) => e.preventDefault();

    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointercancel", onPointerUp);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", onTouchEnd);
    stage.addEventListener("contextmenu", onCtx);

    // —— 六项清理（switchView 统一调用 unmount）——
    // 纪律：只清理本模块动态创建的内容（卡片/连线/控制条/空态）。
    // #canvas-links、#canvas-cards、#star-cards-data 是 Astro SSR 节点，必须原样保留，
    // 否则 SPA 导航回首页时 SSR 数据已丢，星图永远起不来。
    const dynamicNodes: (ChildNode | null)[] = [
      ...cardsWrap.children,
      ...linksLayer.children,
      controls,
      stage.querySelector(".star-empty"),
    ];
    cleanupFn = () => {
      cancelAnimationFrame(rafId);
      clearLongPress();
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerUp);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("resize", onResize);
      controls.removeEventListener("click", onControlClick);
      dynamicNodes.forEach((n) => {
        try {
          n && n.parentNode && n.parentNode.removeChild(n);
        } catch {
          /* ignore */
        }
      });
      nodes.forEach((n) => {
        n.el = null;
      });
      stage.classList.add("hidden");
      stage.setAttribute("aria-hidden", "true");
      cleanupFn = null;
    };
  },

  unmount() {
    if (cleanupFn) cleanupFn();
  },
};
