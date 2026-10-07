/**
 * 视图注册表（多 UI 架构核心）
 *
 * 新增一种 UI 的做法：
 *   1. 把 id 加进 SiteViewMode
 *   2. 实现一个 ViewModule（mount / unmount）
 *   3. 往 VIEW_REGISTRY 注册，并在 BaseLayout 的 #view-dropdown 里加一个 .view-option
 * 导航、快捷键（1/2）、localStorage 记忆、switchView 的解锁逻辑全部自动复用，无需改动。
 */

export type SiteViewMode = 'classic' | 'constellation' /* | 'terminal' | 'grid' ... */;

export interface ViewModule {
  readonly id: SiteViewMode;
  readonly label: string;
  mount(): void;
  unmount(): void;
}

import { constellationView } from './constellation';

/** 经典视图：内容由服务端渲染在 #home-classic 里，显隐交给 CSS（[data-ui]），无需 JS 参与 */
export const classicView: ViewModule = {
  id: 'classic',
  label: '经典视图',
  mount() { /* CSS 负责显示 #home-classic */ },
  unmount() { /* 无 JS 副作用 */ },
};

export const VIEW_REGISTRY: Record<SiteViewMode, ViewModule> = {
  classic: classicView,
  constellation: constellationView,
};

declare global {
  interface Window {
    __bmlbViews?: Record<SiteViewMode, ViewModule>;
  }
}
