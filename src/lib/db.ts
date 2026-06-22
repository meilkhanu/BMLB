// ============================================================
// src/lib/db.ts — ECS/Node.js 专用版（isNode 分支）
// Node.js ESM 模式，用 createRequire 加载 CJS 模块
// ============================================================

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);

export interface D1Compat {
  prepare(sql: string): {
    bind(...params: any[]): {
      all(): Promise<{ results: any[] }>;
      first<T = any>(): Promise<T | null>;
      run(): Promise<{ meta: { last_row_id?: number; changes?: number } }>;
      get<T = any>(...params: any[]): T | null;
    };
    all(): Promise<{ results: any[] }>;
    first<T = any>(): Promise<T | null>;
    run(): Promise<{ meta: { last_row_id?: number; changes?: number } }>;
    get<T = any>(...params: any[]): T | null;
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

  const Database = _require('better-sqlite3').default || _require('better-sqlite3');
  const path = _require('path');
  const fs = _require('fs');

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'bmlb.db');
  _nodeDb = new Database(dbPath);
  _nodeDb.pragma('journal_mode = WAL');
  _nodeDb.pragma('foreign_keys = ON');

  _nodeDb.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, expires_at TEXT);
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, excerpt TEXT DEFAULT '', category_id TEXT NOT NULL, tags TEXT DEFAULT '[]', cover_image TEXT, published_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'draft');
    CREATE TABLE IF NOT EXISTS songs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '', album TEXT DEFAULT '', cover_url TEXT DEFAULT '', audio_url TEXT NOT NULL, duration INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT NOT NULL DEFAULT '访客', email TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, target_slug TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS now_status (id INTEGER PRIMARY KEY CHECK (id = 1), start_date TEXT NOT NULL, end_date TEXT NOT NULL, phase TEXT NOT NULL, description TEXT NOT NULL, progress INTEGER DEFAULT 0, reading_title TEXT DEFAULT '', reading_subtitle TEXT DEFAULT '', learning_title TEXT DEFAULT '', learning_subtitle TEXT DEFAULT '', researching_title TEXT DEFAULT '', researching_subtitle TEXT DEFAULT '', listening_title TEXT DEFAULT '', listening_subtitle TEXT DEFAULT '', badge_text TEXT DEFAULT '', project_description TEXT DEFAULT '', project_screenshot TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS now_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, activity_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS now_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT NOT NULL DEFAULT '访客', email TEXT DEFAULT '', content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS about_config (id INTEGER PRIMARY KEY CHECK (id = 1), hero_image TEXT DEFAULT '/images/d402c0a48dd402c0a48d.avif', hero_subtitle TEXT DEFAULT '', breadcrumb_sub TEXT DEFAULT '关于', intro_title TEXT DEFAULT '自我介绍', intro_paragraphs TEXT DEFAULT '[]', basic_title TEXT DEFAULT '基础信息', basic_items TEXT DEFAULT '[]', skills_title TEXT DEFAULT '技能栈', status_title TEXT DEFAULT '当前状态', status_text TEXT DEFAULT '', alt_title TEXT DEFAULT '', alt_description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS about_skills (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS about_works (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '', tags TEXT DEFAULT '[]', image TEXT DEFAULT '', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS about_links (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '', url TEXT NOT NULL, action_text TEXT DEFAULT 'Visit →', sort_order INTEGER DEFAULT 0);
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
            get<T = any>(...p: any[]): T | null { return stmt.get(...(p.length ? p : params)) ?? null; },
          };
        },
        all(): Promise<{ results: any[] }> {
          const results = stmt.all();
          return Promise.resolve({ results: Array.isArray(results) ? results : [results] });
        },
        first<T = any>(): Promise<T | null> {
          return Promise.resolve(stmt.get() ?? null);
        },
        run(): Promise<{ meta: { last_row_id?: number; changes?: number } }> {
          const info = stmt.run();
          return Promise.resolve({ meta: { last_row_id: info.lastInsertRowid, changes: info.changes } });
        },
        get<T = any>(...p: any[]): T | null { return stmt.get(...p) ?? null; },
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

export function getBucket(): null { return null; }

export const isNode = () => true;

export function getRawDb(): any { return getNodeDb(); }
