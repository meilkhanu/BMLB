// ============================================================
// src/lib/api.ts
// 前端 API 封装 — 供 Astro 页面服务端/客户端调用
//
// 所有函数均返回强类型数据，调用方无需处理 fetch 细节
// ============================================================

// —— 类型定义（与 D1 蛇形列名 → 驼峰转换对齐） ——

export interface Post {
  id: number;
  slug: string;
  title: string;
  content: string;          // HTML
  excerpt: string;
  categoryId: string;       // notes / critique / stack / body / transit / archive
  tags: string[];
  coverImage: string;
  publishedAt: string;      // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  status: "draft" | "published";
}

export interface AuthCheckResult {
  logged_in: boolean;
}

export interface AuthResult {
  success: boolean;
  setup?: boolean;
  error?: string;
}

// —— 基础请求 ——

const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

// —— 公开接口 ——

/** 获取已发布文章列表，可按分类筛选 */
export async function getPosts(category?: string, limit = 20): Promise<Post[]> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  params.set("limit", String(Math.min(limit, 50)));
  return request<Post[]>(`/posts?${params.toString()}`);
}

/** 获取单篇文章（仅已发布） */
export async function getPostBySlug(slug: string): Promise<Post | null> {
  try {
    return await request<Post>(`/posts?slug=${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

// —— 管理接口（需 Cookie 鉴权，服务端调用时透传） ——

/** 获取管理列表（含草稿，需登录） */
export async function getAdminPosts(cookieHeader?: string): Promise<Post[]> {
  const options: RequestInit = {};
  if (cookieHeader) {
    options.headers = { Cookie: cookieHeader };
  }
  return request<Post[]>(`/posts?admin=1`, options);
}

/** 获取管理端单篇（含草稿，需登录） */
export async function getAdminPostBySlug(slug: string, cookieHeader?: string): Promise<Post | null> {
  try {
    const options: RequestInit = {};
    if (cookieHeader) {
      options.headers = { Cookie: cookieHeader };
    }
    return await request<Post>(`/posts?slug=${encodeURIComponent(slug)}&admin=1`, options);
  } catch {
    return null;
  }
}

/** 检查登录状态 */
export async function checkAuth(): Promise<AuthCheckResult> {
  return request<AuthCheckResult>("/auth");
}

/** 登录 / 首次设置密码 */
export async function login(password: string): Promise<AuthResult> {
  return request<AuthResult>("/auth", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

/** 登出 */
export async function logout(): Promise<AuthResult> {
  return request<AuthResult>("/auth", {
    method: "POST",
    body: JSON.stringify({ action: "logout" }),
  });
}

/** 创建文章（需登录） */
export async function createPost(data: Partial<Post> & { slug: string; title: string; content: string; categoryId: string }): Promise<Post> {
  return request<Post>("/posts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 更新文章（需登录） */
export async function updatePost(slug: string, data: Partial<Post>): Promise<Post> {
  return request<Post>("/posts", {
    method: "PUT",
    body: JSON.stringify({ slug, ...data }),
  });
}

/** 删除文章（需登录） */
export async function deletePost(slug: string): Promise<{ success: boolean; deleted: string }> {
  return request("/posts", {
    method: "DELETE",
    body: JSON.stringify({ slug }),
  });
}

// —— About 页面 ——

export interface AboutConfig {
  heroImage: string;
  heroSubtitle: string;
  breadcrumbSub: string;
  introTitle: string;
  introParagraphs: string[];
  basicTitle: string;
  basicItems: { label: string; value: string }[];
  skillsTitle: string;
  statusTitle: string;
  statusText: string;
  altTitle: string;
  altDescription: string;
}

export interface AboutSkill {
  id: number;
  name: string;
  sortOrder: number;
}

export interface AboutWork {
  id: number;
  title: string;
  description: string;
  tags: string[];
  image: string;
  sortOrder: number;
}

export interface AboutLink {
  id: number;
  title: string;
  description: string;
  url: string;
  actionText: string;
  sortOrder: number;
}

export interface AboutData {
  config: AboutConfig;
  skills: AboutSkill[];
  works: AboutWork[];
  links: AboutLink[];
}

/** 获取全部 about 数据（公开） */
export async function getAboutData(): Promise<AboutData> {
  return request<AboutData>("/about");
}

/** 更新 about 配置（需登录） */
export async function updateAboutConfig(data: Partial<AboutConfig>): Promise<AboutConfig> {
  return request<AboutConfig>("/about/config", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/** 获取技能列表（公开） */
export async function getAboutSkills(): Promise<AboutSkill[]> {
  return request<AboutSkill[]>("/about/skills");
}

/** 新增技能（需登录） */
export async function createAboutSkill(data: { name: string; sortOrder?: number }): Promise<AboutSkill> {
  return request<AboutSkill>("/about/skills", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 删除技能（需登录） */
export async function deleteAboutSkill(id: number): Promise<{ success: boolean }> {
  return request("/about/skills?id=" + id, {
    method: "DELETE",
  });
}

/** 获取作品列表（公开） */
export async function getAboutWorks(): Promise<AboutWork[]> {
  return request<AboutWork[]>("/about/works");
}

/** 新增作品（需登录） */
export async function createAboutWork(data: { title: string; description?: string; tags?: string[]; image?: string; sortOrder?: number }): Promise<AboutWork> {
  return request<AboutWork>("/about/works", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 更新作品（需登录） */
export async function updateAboutWork(data: Partial<AboutWork> & { id: number }): Promise<AboutWork> {
  return request<AboutWork>("/about/works", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/** 删除作品（需登录） */
export async function deleteAboutWork(id: number): Promise<{ success: boolean }> {
  return request("/about/works?id=" + id, {
    method: "DELETE",
  });
}

/** 获取链接列表（公开） */
export async function getAboutLinks(): Promise<AboutLink[]> {
  return request<AboutLink[]>("/about/links");
}

/** 新增链接（需登录） */
export async function createAboutLink(data: { title: string; description?: string; url: string; actionText?: string; sortOrder?: number }): Promise<AboutLink> {
  return request<AboutLink>("/about/links", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 更新链接（需登录） */
export async function updateAboutLink(data: Partial<AboutLink> & { id: number }): Promise<AboutLink> {
  return request<AboutLink>("/about/links", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/** 删除链接（需登录） */
export async function deleteAboutLink(id: number): Promise<{ success: boolean }> {
  return request("/about/links?id=" + id, {
    method: "DELETE",
  });
}
