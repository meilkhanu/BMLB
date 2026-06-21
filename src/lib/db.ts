import { env as cloudflareEnv } from 'cloudflare:workers';

export function getDb() {
  return (cloudflareEnv as any)?.DB;
}
