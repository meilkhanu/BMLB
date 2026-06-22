// ============================================================
// src/lib/db.ts — Workers 版（main 分支）
// ============================================================

export interface D1Compat {
  prepare(sql: string): {
    bind(...params: any[]): {
      all(): Promise<{ results: any[] }>;
      first<T = any>(): Promise<T | null>;
      run(): Promise<{ meta: { last_row_id?: number; changes?: number } }>;
      get<T = any>(...params: any[]): T | null;
    };
  };
  exec(sql: string): void;
}

export interface KVCompat {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface BucketCompat {
  put(key: string, data: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<void>;
}

// Workers 环境下 isNode 始终返回 false（upload.ts 需要此函数）
export const isNode = (): boolean => false;

// ============================================================
// Workers 绑定 — 从 cloudflare:workers 获取
// ============================================================

import { env as _workersEnv } from 'cloudflare:workers';

let _cfEnv: any = null;
function getCfEnv(): any {
  if (_cfEnv) return _cfEnv;
  _cfEnv = _workersEnv ?? (globalThis as any).__cfEnv;
  return _cfEnv;
}

export function getDb(): D1Compat | null {
  const env = getCfEnv();
  return (env as any)?.DB ?? null;
}

export function getKV(): KVCompat | null {
  const env = getCfEnv();
  return (env as any)?.CONFIG ?? null;
}

export function getBucket(): BucketCompat | null {
  const env = getCfEnv();
  return (env as any)?.BUCKET ?? null;
}

export function getRawDb(): any { return null; }
