import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    mode: "worker",   // ✅ 强制 Worker runtime
  }),
  integrations: [react(), tailwind()],
  vite: {
    ssr: {
      external: ['node:async_hooks']
    }
  }
});