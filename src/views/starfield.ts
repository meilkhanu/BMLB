/**
 * 星空背景 + 光标拖尾粒子（纯 Canvas，零 DOM）
 *
 * 设计约束：
 *   - 绝对不拦截指针事件：canvas 是 pointer-events:none，且本模块只用
 *     stage 上已存在的监听器（不新增捕获型监听）
 *   - 视差：星空按相机位移的 0.15 倍平移，制造深空纵深
 *   - 休眠：指针静止 1s 后停掉拖尾的绘制与粒子更新（星空仍保留），
 *     离开视口 / unmount 时彻底停 rAF
 *   - unmount 必须清理：rAF、resize、pointermove 全部移除
 */

import type { StarNode } from './constellation';

interface Star {
  /** 世界坐标（随相机做视差平移） */
  wx: number;
  wy: number;
  /** 视口坐标（不随相机动，最远层） */
  vx: number;
  vy: number;
  r: number; // 半径 0.5~1.8
  a: number; // 亮度 0.1~0.6
  tint: boolean; // 是否主题青
  tw: number; // 闪烁相位
  depth: number; // 视差系数 0 / 0.15 / 0.3
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 → 0
  decay: number;
  tint: boolean;
}

const STAR_COUNT = 168; // 120~180 取中
const PARALLAX = 0.15; // 主层视差倍率
const PARALLAX_FAR = 0.3; // 远景层（更慢）
const SPARK_MAX = 64; // 粒子上限，严控开销
const SPARK_DECAY = 0.055; // 每秒生命衰减（约 18s 走完一生；配合休眠 x4 加速淡出）
const LINK_CARD_DIST = 120; // 距卡片边缘多近开始连线
const IDLE_MS = 1000; // 无操作多久后休眠

export interface StarfieldHandle {
  /** 供渲染循环引用：把当前相机喂进来（用于视差与近卡连线） */
  setCamera(x: number, y: number): void;
  /** 由 constellation 的 pointermove 调用，输入为 stage 内坐标 */
  onPointerMove(lx: number, ly: number): void;
  /** 供近卡连线查询可见卡（避免循环依赖，由外部注入） */
  setNodes(list: StarNode[]): void;
  destroy(): void;
}

/** 挂载星空层；返回供 constellation 调用的句柄 */
export function mountStarfield(stage: HTMLElement): StarfieldHandle | null {
  const canvas = document.getElementById('starfield-bg') as HTMLCanvasElement | null;
  if (!canvas) return null;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;

  let W = 0, H = 0, dpr = 1;
  const stars: Star[] = [];

  const resize = () => {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
    dirty = true;
  };

  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  const seedStars = () => {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      // 三层深度：0 = 挂在世界上随相机全速动（实际给 0.15），
      // 1 = 远景（0.3 反而更慢？这里 depth 直接存视差系数，见 update）
      const layer = i % 3;
      const depth = layer === 0 ? PARALLAX : layer === 1 ? PARALLAX_FAR : 0;
      stars.push({
        wx: rand(-W * 0.5, W * 1.5),
        wy: rand(-H * 0.5, H * 1.5),
        vx: rand(0, W),
        vy: rand(0, H),
        r: rand(0.5, 1.8),
        a: rand(0.1, 0.6),
        tint: Math.random() < 0.1, // 10% 主题青
        tw: rand(0, Math.PI * 2),
        depth,
      });
    }
  };

  const cam = { x: 0, y: 0 };
  let nodes: StarNode[] = [];
  const sparks: Spark[] = [];
  const pointer = { x: -999, y: -999, active: false, lastMove: 0 };
  let rafId = 0;
  let alive = true;
  let dirty = true; // 星空是否需要重绘（相机变化才脏；静止时零成本）

  // 只更新星空 + 拖尾；不画卡片（卡片是 DOM）
  const draw = (ts: number) => {
    if (!alive) return;
    rafId = requestAnimationFrame(draw);
    const idle = ts - pointer.lastMove > IDLE_MS;

    // —— 拖尾粒子（休眠时跳过）——
    if (idle) {
      // 休眠：淡出存量后清空
      if (sparks.length) {
        for (let i = sparks.length - 1; i >= 0; i--) {
          sparks[i].life -= SPARK_DECAY * 4;
          if (sparks[i].life <= 0) sparks.splice(i, 1);
        }
        dirty = true; // 淡出也要重绘
      }
    } else if (pointer.active) {
      // 更新
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94; // 阻尼
        p.vy *= 0.94;
        p.life -= SPARK_DECAY;
        if (p.life <= 0) sparks.splice(i, 1);
      }
      dirty = true; // 有粒子就要画
    }

    if (!dirty && !sparks.length) return; // 静止帧：零绘制
    dirty = false;
    ctx.clearRect(0, 0, W, H);

    // —— 1. 星空 ——
    for (const s of stars) {
      // 世界层随相机视差移动（取模回绕，形成无限深空）；纯视口层不动
      let sx: number, sy: number;
      if (s.depth > 0) {
        sx = (((s.wx - cam.x * s.depth) % (W + 200)) + W + 200) % (W + 200) - 100;
        sy = (((s.wy - cam.y * s.depth) % (H + 200)) + H + 200) % (H + 200) - 100;
      } else {
        sx = s.vx;
        sy = s.vy;
      }
      // 闪烁（极慢，不抢注意力）
      const tw = 0.82 + 0.18 * Math.sin(ts * 0.0011 + s.tw);
      const alpha = s.a * tw;
      if (s.tint) {
        // 主题青 + 外发光
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.r * 4);
        g.addColorStop(0, `rgba(34,211,238,${alpha})`);
        g.addColorStop(1, 'rgba(34,211,238,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(190,245,255,${Math.min(1, alpha + 0.25)})`;
      } else {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // —— 2. 拖尾粒子绘制（坐标/生命已在上面更新）——
    if (sparks.length) {
      // 相邻粒子连线
      ctx.lineWidth = 0.5;
      for (let i = 0; i < sparks.length; i++) {
        const a = sparks[i];
        for (let j = i + 1; j < sparks.length; j++) {
          const b = sparks[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 74) {
            const alpha = 0.3 * a.life * b.life * (1 - d / 74);
            if (alpha < 0.012) continue;
            ctx.strokeStyle = a.tint || b.tint ? `rgba(120,225,245,${alpha})` : `rgba(255,255,255,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // 粒子本体
      for (const p of sparks) {
        const alpha = p.life * 0.85;
        ctx.fillStyle = p.tint ? `rgba(150,235,255,${alpha})` : `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1 * p.life + 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // —— 3. 距卡片边缘 <120px 时，从光标向卡片最近点连线 ——
    if (pointer.x > -100 && !idle) {
      for (const n of nodes) {
        const el = n.el;
        if (!el || el.style.visibility === 'hidden') continue;
        const b = el.getBoundingClientRect();
        const sr = stage.getBoundingClientRect();
        const bx = b.x - sr.x, by = b.y - sr.y;
        // 点到矩形最近点
        const nx = Math.max(bx, Math.min(pointer.x, bx + b.width));
        const ny = Math.max(by, Math.min(pointer.y, by + b.height));
        const d = Math.hypot(pointer.x - nx, pointer.y - ny);
        if (d < LINK_CARD_DIST) {
          const alpha = 0.34 * (1 - d / LINK_CARD_DIST);
          if (alpha < 0.02) continue;
          ctx.strokeStyle = `rgba(34,211,238,${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(nx, ny);
          ctx.stroke();
        }
      }
    }
  };

  resize();
  rafId = requestAnimationFrame(draw);
  window.addEventListener('resize', resize);

  return {
    setCamera(x, y) {
      // 只有相机真的变了才置脏；弹簧停在同一位置时不会重复触发全屏重绘
      if (x !== cam.x || y !== cam.y) {
        cam.x = x;
        cam.y = y;
        dirty = true;
      }
    },
    onPointerMove(lx, ly) {
      pointer.x = lx;
      pointer.y = ly;
      pointer.active = true;
      pointer.lastMove = performance.now();
      // 生成 1~2 颗，带轻微阻尼初速度（与移动方向相关的小偏移）
      if (sparks.length < SPARK_MAX) {
        const n = Math.random() < 0.5 ? 1 : 2;
        for (let i = 0; i < n; i++) {
          sparks.push({
            x: lx + (Math.random() - 0.5) * 6,
            y: ly + (Math.random() - 0.5) * 6,
            vx: (Math.random() - 0.5) * 1.6,
            vy: (Math.random() - 0.5) * 1.6 - 0.25,
            life: 1,
            decay: SPARK_DECAY,
            tint: Math.random() < 0.3,
          });
        }
      }
    },
    setNodes(list) {
      nodes = list;
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      sparks.length = 0;
      stars.length = 0;
      ctx.clearRect(0, 0, W, H);
    },
  };
}
