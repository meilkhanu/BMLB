import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'server',           // 关键：支持动态渲染，不是纯静态
  adapter: cloudflare(),      // 使用 Cloudflare 适配器
  integrations: [react(), tailwind()],    // 启用 React 和 Tailwind CSS
  vite: {
    ssr: {
      external: ['node:async_hooks']  // Cloudflare 环境需要
    }
  }
});
