// ============================================================
// src/lib/db.ts
// 统一数据访问抽象层 — Workers (D1/KV/R2) / ECS (better-sqlite3)
//
// 运行时检测：Node.js 环境 → better-sqlite3
//             Workers 环境 → cloudflare:workers
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

let _cfEnv: any = null;

function getCfEnv(): any {
  if (_cfEnv) return _cfEnv;
  try {
    // 动态 import — Workers 环境
    const mod = require('cloudflare:workers') as any;
    _cfEnv = mod.env;
  } catch {
    _cfEnv = undefined;
  }
  return _cfEnv;
}

// ============================================================
// Node.js 环境 — better-sqlite3
// ============================================================

let _nodeDb: any = null;
let _nodeDbInstance: any = null;

function getNodeDb(): any {
  if (_nodeDbInstance) return _nodeDbInstance;
  if (_nodeDb) return _nodeDb; // 已初始化但未连接

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

    // —— 创建 KV 模拟表 ——
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

// ============================================================
// D1 兼容包装器（给 better-sqlite3 加 D1 风格的 API）
// ============================================================

function wrapNodeDb(rawDb: any): D1Compat {
  const stmtCache = new Map<string, any>();

  return {
    prepare(sql: string) {
      let stmt = stmtCache.get(sql);
      if (!stmt) {
        stmt = rawDb.prepare(sql);
        stmtCache.set(sql, stmt);
      }
      return {
        bind(...params: any[]) {
          return {
            all(): Promise<{ results: any[] }> {
              try {
                const results = 'all' in stmt ? stmt.all(...params) : stmt.bind(params).all();
                return Promise.resolve({ results });
              } catch (e: any) {
                return Promise.reject(e);
              }
            },
            first<T = any>(): Promise<T | null> {
              try {
                const result = 'get' in stmt ? stmt.get(...params) : stmt.bind(params).get();
                return Promise.resolve(result ?? null);
              } catch (e: any) {
                return Promise.reject(e);
              }
            },
            run(): Promise<{ meta: { last_row_id?: number; changes?: number } }> {
              try {
                const info = 'run' in stmt ? stmt.run(...params) : stmt.bind(params).run();
                return Promise.resolve({
                  meta: {
                    last_row_id: info.lastInsertRowid,
                    changes: info.changes,
                  },
                });
              } catch (e: any) {
                return Promise.reject(e);
              }
            },
            get<T = any>(...p: any[]): T | null {
              try {
                return stmt.get(...(p.length ? p : params)) ?? null;
              } catch {
                return null;
              }
            },
          };
        },
      };
    },
    exec(sql: string) {
      rawDb.exec(sql);
    },
  };
}

// ============================================================
// KV 兼容包装器（ECS 用 SQLite 表模拟 Cloudflare KV）
// ============================================================

function createNodeKV(rawDb: any): KVCompat {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const row = rawDb
          .prepare('SELECT value, expires_at FROM kv_store WHERE key = ?')
          .get(key);
        if (!row) return null;
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
          rawDb.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
          return null;
        }
        return row.value;
      } catch {
        return null;
      }
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
      const expiresAt = opts?.expirationTtl
        ? new Date(Date.now() + opts.expirationTtl * 1000).toISOString()
        : null;
      rawDb
        .prepare('INSERT OR REPLACE INTO kv_store (key, value, expires_at) VALUES (?, ?, ?)')
        .run(key, value, expiresAt);
    },
    async delete(key: string): Promise<void> {
      rawDb.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
    },
  };
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 获取数据库实例（D1 兼容 API）
 * Workers → D1 binding
 * ECS     → better-sqlite3 (带 D1 兼容层)
 */
export function getDb(): D1Compat | null {
  if (isNode()) {
    const rawDb = getNodeDb();
    return rawDb ? wrapNodeDb(rawDb) : null;
  }

  // Workers 环境
  const env = getCfEnv();
  return (env as any)?.DB ?? null;
}

/**
 * 获取 KV 存储（类 Cloudflare KV API）
 * Workers → KV binding
 * ECS     → SQLite kv_store 表
 */
export function getKV(): KVCompat | null {
  if (isNode()) {
    const rawDb = getNodeDb();
    return rawDb ? createNodeKV(rawDb) : null;
  }

  const env = getCfEnv();
  const kv = (env as any)?.CONFIG;
  return kv ?? null;
}

/**
 * 获取对象存储（R2 兼容）
 * Workers → R2 binding
 * ECS     → null（上传走本地文件系统，由 upload.ts 处理）
 */
export function getBucket(): BucketCompat | null {
  if (isNode()) return null; // ECS 不需要 bucket 对象

  const env = getCfEnv();
  return (env as any)?.BUCKET ?? null;
}

// ============================================================
// 辅助：获取原始 better-sqlite3 实例（ECS 特有操作）
// ============================================================

export function getRawDb(): any {
  if (!isNode()) return null;
  return getNodeDb();
}
