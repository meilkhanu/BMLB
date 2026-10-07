/**
 * 视图切换器（SPA 安全版）
 *
 * 为什么抽成独立 module script：Astro ClientRouter 的 SPA 导航会替换 <body>，
 * 挂在 <body> 内 <script is:inline> 上的 window 全局（switchView / __bmlbViews）
 * 会被丢弃，导致从 /about 返回首页后视图切换彻底失效。
 * 作为页面级 module script 引入后，Astro 会在每次导航（含 SPA）正确重放。
 *
 * 幂等设计：重复执行不叠加监听（按下标跳过的守卫）。
 */

import { VIEW_REGISTRY } from './registry';
import type { SiteViewMode } from './registry';

declare global {
  interface Window {
    switchView?: (next: SiteViewMode) => void;
    __bmlbViews?: typeof VIEW_REGISTRY;
    __bmlbSyncNav?: (next: SiteViewMode) => void;
    __viewSwitcherBound?: boolean;
  }
}

// registry 每次重放都刷新（constellation 模块的闭包状态靠 module 级变量跨导航保留）
window.__bmlbViews = VIEW_REGISTRY;

/** 切换视图的唯一出入口：unmount(prev) → dataset → 滚动锁 → mount(next) → 持久化 → 同步导航 */
window.switchView = function (next: SiteViewMode) {
  const root = document.documentElement;
  const prev = (root.dataset.ui || 'classic') as SiteViewMode;
  if (prev === next) return;

  // 1. 彻底销毁旧视图（rAF / 监听 / 定时器 / DOM）
  if (window.__bmlbViews && window.__bmlbViews[prev]) {
    try {
      window.__bmlbViews[prev].unmount();
    } catch (e) {
      console.error('[view] unmount 失败', e);
    }
  }
  // 2. 切状态
  root.dataset.ui = next;
  // 3. 滚动锁配对（constellation 是 fixed 全屏；切回必须解锁，否则页面死锁无法滚动）
  document.body.style.overflow = next === 'constellation' ? 'hidden' : '';
  // 4. 挂载新视图
  if (window.__bmlbViews && window.__bmlbViews[next]) {
    try {
      window.__bmlbViews[next].mount();
    } catch (e) {
      console.error('[view] mount 失败', e);
    }
  }
  // 5. 持久化
  try {
    localStorage.setItem('bmlb-ui', next);
  } catch {
    /* ignore */
  }
  // 6. 更新导航态
  window.__bmlbSyncNav && window.__bmlbSyncNav(next);
};

/** 同步导航栏图标的选中态 */
function syncNav() {
  const cur = (document.documentElement.dataset.ui || 'classic') as SiteViewMode;
  document.getElementById('view-icon-classic')?.classList.toggle('hidden', cur !== 'classic');
  document.getElementById('view-icon-constellation')?.classList.toggle('hidden', cur !== 'constellation');
  document.querySelectorAll('.view-option').forEach((opt) => {
    const on = (opt as HTMLElement).dataset.viewMode === cur;
    opt.querySelector('.view-check') &&
      ((opt.querySelector('.view-check') as HTMLElement).style.opacity = on ? '1' : '0');
    opt.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}
window.__bmlbSyncNav = syncNav;

/** 绑定导航控件。守卫保证 SPA 重放时不叠加监听。 */
function bindControls() {
  const wrap = document.getElementById('view-switcher');
  const btn = document.getElementById('view-switch-btn');
  const dd = document.getElementById('view-dropdown');
  if (!wrap || !btn || !dd) return;
  if ((wrap as any).__bound) return; // 本轮 DOM 已绑过
  (wrap as any).__bound = true;

  const open = (on: boolean) => {
    dd.classList.toggle('opacity-0', !on);
    dd.classList.toggle('invisible', !on);
    dd.classList.toggle('translate-y-1', !on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    open(dd.classList.contains('invisible'));
  });
  dd.querySelectorAll('.view-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      open(false);
      window.switchView && window.switchView((opt as HTMLElement).dataset.viewMode as SiteViewMode);
    });
  });
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('view-switcher');
  const dd = document.getElementById('view-dropdown');
  if (wrap && dd && !wrap.contains(e.target as Node)) {
    dd.classList.add('opacity-0', 'invisible', 'translate-y-1');
  }
});

document.addEventListener('keydown', (e) => {
  const dd = document.getElementById('view-dropdown');
  if (e.key === 'Escape' && dd) dd.classList.add('opacity-0', 'invisible', 'translate-y-1');
  const ae = document.activeElement;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
  // 数字键快捷切换（经典=1，星图=2）；仅在首页存在时才生效
  if (e.key === '1' && document.getElementById('view-switch-btn')) window.switchView && window.switchView('classic');
  if (e.key === '2' && document.getElementById('view-switch-btn')) window.switchView && window.switchView('constellation');
});

// SPA 导航后 DOM 重放：重新绑定 + 同步状态；并按需重挂星图
document.addEventListener('astro:page-load', () => {
  bindControls();
  syncNav();
  // SPA 回到首页且偏好是星图时：补挂 + 补写滚动锁（fixed 全屏与可滚动页面不可共存）
  if (document.documentElement.dataset.ui === 'constellation' && document.getElementById('canvas-stage')) {
    const cardsWrap = document.getElementById('canvas-cards');
    const alreadyMounted = cardsWrap && cardsWrap.childElementCount > 0;
    if (!alreadyMounted) {
      VIEW_REGISTRY.constellation.mount();
      document.body.style.overflow = 'hidden';
    }
  }
});

// 首屏执行：绑定控件 + 同步导航态
bindControls();
syncNav();

// 首屏恢复：head script 已按 localStorage 写好 data-ui，这里补挂 + 补滚动锁
if (document.documentElement.dataset.ui === 'constellation' && document.getElementById('canvas-stage')) {
  const cardsWrap = document.getElementById('canvas-cards');
  const alreadyMounted = cardsWrap && cardsWrap.childElementCount > 0;
  if (!alreadyMounted) {
    VIEW_REGISTRY.constellation.mount();
    document.body.style.overflow = 'hidden';
  }
}
