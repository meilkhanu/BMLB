// ============================================================
// src/lib/db.ts — ECS/Node.js 专用版（isNode 分支）
// 只使用 better-sqlite3，不导入 cloudflare:workers
// 复制此文件到 A:\web_build\src\lib\db.ts（在 isNode 分支下）
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

let _nodeDb: any = null;

function getNodeDb(): any {
  if (_nodeDb) return _nodeDb;

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

  return _nodeDb;
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
              const results = stmt.all(...params);
              return Promise.resolve({ results: Array.isArray(results) ? results : [results] });
            },
            first<T = any>(): Promise<T | null> {
              return Promise.resolve(stmt.get(...params) ?? null);
            },
            run(): Promise<{ meta: { last_row_id?: number; changes?: number } }> {
              const info = stmt.run(...params);
              return Promise.resolve({ meta: { last_row_id: info.lastInsertRowid, changes: info.changes } });
            },
            get<T = any>(...p: any[]): T | null {
              return stmt.get(...(p.length ? p : params)) ?? null;
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
      const row = rawDb.prepare('SELECT value, expires_at FROM kv_store WHERE key = ?').get(key);
      if (!row) return null;
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        rawDb.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
        return null;
      }
      return row.value;
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

export function getDb(): D1Compat | null {
  const rawDb = getNodeDb();
  return rawDb ? wrapNodeDb(rawDb) : null;
}

export function getKV(): KVCompat | null {
  const rawDb = getNodeDb();
  return rawDb ? createNodeKV(rawDb) : null;
}

export function getBucket(): null {
  return null;
}

/** 始终为 true — ECS 运行在 Node.js */
export const isNode = () => true;

export function getRawDb(): any {
  return getNodeDb();
}
