// ============================================================
// src/lib/db.ts — ECS (Node.js) 版本
// 无 cloudflare:workers 依赖，用 createRequire 加载 better-sqlite3
// ============================================================

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const _require = createRequire(import.meta.url);

export const isNode = (): boolean =>
  typeof process !== "undefined" &&
  typeof process.versions !== "undefined" &&
  typeof process.versions.node !== "undefined";

// ============================================================
// D1 兼容类型
// ============================================================

export interface D1Compat {
  prepare(sql: string): any;
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
// SQLite 初始化 + 自动建表
// ============================================================

let _db: any = null;

function ensureDb(): any {
  if (_db) return _db;

  const BetterSqlite3 = _require("better-sqlite3");
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const dbPath = resolve(dataDir, "app.db");

  _db = new BetterSqlite3(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // ---------- 业务表 ----------

  _db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      slug          TEXT UNIQUE NOT NULL,
      title         TEXT NOT NULL,
      content       TEXT NOT NULL,
      excerpt       TEXT DEFAULT '',
      category_id   TEXT NOT NULL,
      tags          TEXT DEFAULT '[]',
      cover_image   TEXT,
      published_at  TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now')),
      status        TEXT DEFAULT 'draft'
    );
    CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);
    CREATE INDEX IF NOT EXISTS idx_posts_category_status_date ON posts(category_id, status, published_at);

    CREATE TABLE IF NOT EXISTS now_status (
      id                 INTEGER PRIMARY KEY CHECK (id = 1),
      start_date         TEXT NOT NULL,
      end_date           TEXT NOT NULL,
      phase              TEXT NOT NULL,
      description        TEXT NOT NULL,
      progress           INTEGER DEFAULT 0,
      reading_title      TEXT DEFAULT '',
      reading_subtitle   TEXT DEFAULT '',
      learning_title     TEXT DEFAULT '',
      learning_subtitle  TEXT DEFAULT '',
      researching_title  TEXT DEFAULT '',
      researching_subtitle TEXT DEFAULT '',
      listening_title    TEXT DEFAULT '',
      listening_subtitle TEXT DEFAULT '',
      badge_text         TEXT DEFAULT '',
      project_description TEXT DEFAULT '',
      project_screenshot TEXT DEFAULT '',
      updated_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS now_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      activity_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_now_activity_date ON now_activity(activity_date);

    CREATE TABLE IF NOT EXISTS now_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      author     TEXT NOT NULL DEFAULT '访客',
      email      TEXT DEFAULT '',
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS about_config (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      hero_image      TEXT DEFAULT '',
      hero_subtitle   TEXT DEFAULT '',
      breadcrumb_sub  TEXT DEFAULT '',
      intro_title     TEXT DEFAULT '',
      intro_paragraphs TEXT DEFAULT '[]',
      basic_title     TEXT DEFAULT '',
      basic_items     TEXT DEFAULT '[]',
      skills_title    TEXT DEFAULT '',
      status_title    TEXT DEFAULT '',
      status_text     TEXT DEFAULT '',
      alt_title       TEXT DEFAULT '',
      alt_description TEXT DEFAULT '',
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    -- 新字段：Hero 管理 + 头像（渐进式迁移，已有表不会丢失数据）
    ALTER TABLE about_config ADD COLUMN index_hero_image TEXT DEFAULT '/images/hero-bg.avif';
    ALTER TABLE about_config ADD COLUMN index_hero_position TEXT DEFAULT 'center 40%';
    ALTER TABLE about_config ADD COLUMN about_hero_position TEXT DEFAULT 'center 15%';
    ALTER TABLE about_config ADD COLUMN avatar TEXT DEFAULT '/images/avatar.avif';

    CREATE TABLE IF NOT EXISTS about_skills (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS about_works (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      description TEXT DEFAULT '',
      tags       TEXT DEFAULT '[]',
      image      TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS about_links (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      url         TEXT NOT NULL,
      action_text TEXT DEFAULT '',
      sort_order  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      author      TEXT NOT NULL DEFAULT '访客',
      email       TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL,
      target_slug TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_slug);

    CREATE TABLE IF NOT EXISTS songs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      artist      TEXT NOT NULL DEFAULT '',
      album       TEXT DEFAULT '',
      cover_url   TEXT DEFAULT '',
      audio_url   TEXT NOT NULL,
      duration    INTEGER DEFAULT 0,
      sort_order  INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kv_store (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      expires_at  INTEGER
    );
  `);

  console.log("[db] SQLite initialized:", dbPath);
  return _db;
}

// ============================================================
// D1 兼容包装器
// ============================================================

class D1Result {
  constructor(public results: any[] = []) {}
}

class D1Statement {
  private stmt: any;

  constructor(db: any, sql: string) {
    this.stmt = db.prepare(sql);
  }

  bind(...params: any[]) {
    const stmt = this.stmt;
    return {
      all: () => {
        const rows = stmt.all(...params);
        return Promise.resolve(new D1Result(rows));
      },
      first: <T = any>() => {
        const row = stmt.get(...params) as T | undefined;
        return Promise.resolve(row ?? null);
      },
      run: () => {
        const info = stmt.run(...params);
        return Promise.resolve({
          meta: { last_row_id: info.lastInsertRowid, changes: info.changes },
        });
      },
      get: <T = any>(...extraParams: any[]): T | null => {
        const p = extraParams.length > 0 ? extraParams : params;
        const row = stmt.get(...p) as T | undefined;
        return row ?? null;
      },
    };
  }

  all() {
    const rows = this.stmt.all();
    return Promise.resolve(new D1Result(rows));
  }

  first<T = any>(): Promise<T | null> {
    const row = this.stmt.get() as T | undefined;
    return Promise.resolve(row ?? null);
  }

  run() {
    const info = this.stmt.run();
    return Promise.resolve({
      meta: { last_row_id: info.lastInsertRowid, changes: info.changes },
    });
  }

  get<T = any>(...params: any[]): T | null {
    const row = this.stmt.get(...params) as T | undefined;
    return row ?? null;
  }
}

class D1CompatImpl implements D1Compat {
  constructor(private db: any) {}
  prepare(sql: string) {
    return new D1Statement(this.db, sql);
  }
  exec(sql: string) {
    this.db.exec(sql);
  }
}

// ============================================================
// KV 存储（SQLite kv_store 表实现）
// ============================================================

class SqliteKV implements KVCompat {
  constructor(private db: any) {}

  async get(key: string): Promise<string | null> {
    const row = this.db
      .prepare("SELECT value, expires_at FROM kv_store WHERE key = ?")
      .get(key) as { value: string; expires_at: number | null } | undefined;
    if (!row) return null;
    if (row.expires_at && Date.now() / 1000 > row.expires_at) {
      this.db.prepare("DELETE FROM kv_store WHERE key = ?").run(key);
      return null;
    }
    return row.value;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = opts?.expirationTtl
      ? Math.floor(Date.now() / 1000) + opts.expirationTtl
      : null;
    this.db
      .prepare(
        "INSERT OR REPLACE INTO kv_store (key, value, expires_at) VALUES (?, ?, ?)"
      )
      .run(key, value, expiresAt);
  }

  async delete(key: string): Promise<void> {
    this.db.prepare("DELETE FROM kv_store WHERE key = ?").run(key);
  }
}

// ============================================================
// 导出
// ============================================================

let _d1: D1CompatImpl | null = null;
let _kv: SqliteKV | null = null;

function ensureEcs(): { d1: D1CompatImpl; kv: SqliteKV } {
  if (_d1 && _kv) return { d1: _d1, kv: _kv };
  const db = ensureDb();
  _d1 = new D1CompatImpl(db);
  _kv = new SqliteKV(db);
  return { d1: _d1, kv: _kv };
}

export function getDb(): D1Compat {
  if (isNode()) return ensureEcs().d1;
  return null as any;
}

export function getKV(): KVCompat {
  if (isNode()) return ensureEcs().kv;
  return null as any;
}

export function getBucket(): BucketCompat | null {
  return null;
}

export function getRawDb(): any {
  if (isNode()) return ensureDb();
  return null;
}
