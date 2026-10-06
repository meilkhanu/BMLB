// ============================================================
// src/lib/rate-limit.ts
// 登录限流 — 内存滑窗，进程内生效
//
// 背景：/api/auth 原本无任何速率限制，弱口令可被无限次暴力枚举。
// 这里为「登录失败」与「登录尝试（不分成败）」各设一道闸：
//   - 失败计数：同一标识 5 次失败 → 锁 15 分钟（这是主闸）
//   - 总尝试数：同一标识 15 分钟内最多 20 次（防穷举边界）
//
// 说明：ECS 单进程 pm2 部署下，内存态足够；重启即清空，代价可接受。
// 若日后扩到多实例，换成 SQLite kv_store 计数即可（同库、无新依赖）。
// ============================================================

// —— 失败闸 ——
const FAIL_MAX = 5;              // 允许的连续失败次数
const FAIL_WINDOW_MS = 15 * 60 * 1000;  // 计数窗口
const LOCK_MS = 15 * 60 * 1000;  // 触发后的锁定时长

// —— 总尝试闸 ——
const TOTAL_MAX = 20;            // 窗口内总尝试上限
const TOTAL_WINDOW_MS = 15 * 60 * 1000;

interface FailRecord {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

/** 内存态。模块级 Map，进程存活期间有效。 */
const failures = new Map<string, FailRecord>();
const attempts = new Map<string, number[]>();

/** 清理过期条目，避免 Map 无限增长（每次检查时顺带扫一遍，成本极低）。 */
function prune(now: number): void {
  for (const [key, rec] of failures) {
    if (rec.lockedUntil < now && now - rec.firstAt > FAIL_WINDOW_MS) {
      failures.delete(key);
    }
  }
  for (const [key, list] of attempts) {
    const live = list.filter((t) => now - t < TOTAL_WINDOW_MS);
    if (live.length === 0) attempts.delete(key);
    else attempts.set(key, live);
  }
}

/**
 * 判断某标识当前是否被限流。
 * @param key 限流标识，建议为「登录名/IP」的组合
 */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  prune(now);
  const rec = failures.get(key);
  if (rec && rec.lockedUntil > now) return true;
  return false;
}

/** 返回剩余锁定秒数（用于错误提示）；未锁定返回 0。 */
export function lockRemaining(key: string): number {
  const now = Date.now();
  const rec = failures.get(key);
  if (!rec || rec.lockedUntil <= now) return 0;
  return Math.ceil((rec.lockedUntil - now) / 1000);
}

/**
 * 记录一次尝试（成功或失败都算，用于总数闸）。
 * @returns 是否已超过总数上限
 */
export function recordAttempt(key: string): boolean {
  const now = Date.now();
  prune(now);
  const list = attempts.get(key) ?? [];
  list.push(now);
  attempts.set(key, list);
  return list.length > TOTAL_MAX;
}

/** 记录一次登录失败；达到阈值则上锁。 */
export function recordFailure(key: string): void {
  const now = Date.now();
  const rec = failures.get(key);
  if (!rec || now - rec.firstAt > FAIL_WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= FAIL_MAX) {
    rec.lockedUntil = now + LOCK_MS;
  }
}

/** 登录成功：清掉该标识的失败计数（不清总尝试，让窗口自然滑出）。 */
export function clearFailures(key: string): void {
  failures.delete(key);
}

/**
 * 从请求中提取限流标识。取「客户端 IP + 登录名」的组合：
 * 单看 IP 会误伤 NAT 后的同一建筑，单看登录名又漏掉分布式试探。
 */
export function rateLimitKey(request: Request, login: string): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return `${ip}|${login || "-"}`;
}
