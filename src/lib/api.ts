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
