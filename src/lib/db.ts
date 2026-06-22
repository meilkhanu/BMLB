// ============================================================
// src/lib/db.ts — Workers 版（main 分支）
// 使用 cloudflare:workers 原生绑定 + 保留 isNode 分支给 ECS
// ============================================================

// —— 运行时检测 ——
export const isNode = (): boolean =>
  typeof process !== 'undefined' &&
  typeof process.versions !== 'undefined' &&
  typeof process.versions.node !== 'undefined';

// —— 类型 ——
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

// ============================================================
// Workers 环境 — 使用 cloudflare:workers 原生绑定
// ============================================================

import { env as _workersEnv } from 'cloudflare:workers';

let _cfEnv: any = null;

function getCfEnv(): any {
  if (_cfEnv) return _cfEnv;
  _cfEnv = _workersEnv ?? (globalThis as any).__cfEnv;
  return _cfEnv;
}

// ============================================================
// Node.js 环境 — better-sqlite3（ECS 用，isNode 分支用单独版本）
// ============================================================

let _nodeDb: any = null;
let _nodeDbInstance: any = null;

function getNodeDb(): any {
  if (_nodeDbInstance) return _nodeDbInstance;
  if (_nodeDb) return _nodeDb;

  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'bmlb.db');
    _nodeDb = new Database(dbPath);
    _nodeDb.pragma('journal_mode = WAL');
    _nodeDb.pragma('foreign_keys = ON');

    _nodeDb.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT,
        expires_at TEXT
      )
    `);

    _nodeDbInstance = _nodeDb;
    return _nodeDb;
  } catch (e) {
    console.error('[db] better-sqlite3 初始化失败:', e);
    return null;
  }
}

function wrapNodeDb(rawDb: any): D1Compat {
  const stmtCache = new Map<string, any>();
  return {
    prepare(sql: string) {
      let stmt = stmtCache.get(sql);
      if (!stmt) { stmt = rawDb.prepare(sql); stmtCache.set(sql, stmt); }
      return {
        bind(...params: any[]) {
          return {
            all(): Promise<{ results: any[] }> {
              try { const results = stmt.all(...params); return Promise.resolve({ results }); }
              catch (e: any) { return Promise.reject(e); }
            },
            first<T = any>(): Promise<T | null> {
              try { return Promise.resolve(stmt.get(...params) ?? null); }
              catch (e: any) { return Promise.reject(e); }
            },
            run(): Promise<{ meta: { last_row_id?: number; changes?: number } }> {
              try {
                const info = stmt.run(...params);
                return Promise.resolve({ meta: { last_row_id: info.lastInsertRowid, changes: info.changes } });
              } catch (e: any) { return Promise.reject(e); }
            },
            get<T = any>(...p: any[]): T | null {
              try { return stmt.get(...(p.length ? p : params)) ?? null; } catch { return null; }
            },
          };
        },
      };
    },
    exec(sql: string) { rawDb.exec(sql); },
  };
}

function createNodeKV(rawDb: any): KVCompat {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const row = rawDb.prepare('SELECT value, expires_at FROM kv_store WHERE key = ?').get(key);
        if (!row) return null;
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
          rawDb.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
          return null;
        }
        return row.value;
      } catch { return null; }
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
      const expiresAt = opts?.expirationTtl ? new Date(Date.now() + opts.expirationTtl * 1000).toISOString() : null;
      rawDb.prepare('INSERT OR REPLACE INTO kv_store (key, value, expires_at) VALUES (?, ?, ?)').run(key, value, expiresAt);
    },
    async delete(key: string): Promise<void> {
      rawDb.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
    },
  };
}

// ============================================================
// 公开 API
// ============================================================

export function getDb(): D1Compat | null {
  if (isNode()) {
    const rawDb = getNodeDb();
    return rawDb ? wrapNodeDb(rawDb) : null;
  }
  const env = getCfEnv();
  return (env as any)?.DB ?? null;
}

export function getKV(): KVCompat | null {
  if (isNode()) {
    const rawDb = getNodeDb();
    return rawDb ? createNodeKV(rawDb) : null;
  }
  const env = getCfEnv();
  return (env as any)?.CONFIG ?? null;
}

export function getBucket(): BucketCompat | null {
  if (isNode()) return null;
  const env = getCfEnv();
  return (env as any)?.BUCKET ?? null;
}

export function getRawDb(): any {
  if (!isNode()) return null;
  return getNodeDb();
}
