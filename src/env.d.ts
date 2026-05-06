/// <reference types="@cloudflare/workers-types" />
/// <reference path="../.astro/types.d.ts" />

// ============================================================
// Cloudflare Workers 环境类型
// ============================================================

interface Env {
  CONFIG: KVNamespace;
  DB: D1Database;
  IMAGES: R2Bucket;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
    };
  }
}
