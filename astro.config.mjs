import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

const deployTarget = process.env.DEPLOY_TARGET || 'workers';
const isNode = deployTarget === 'ecs';

export default defineConfig({
  output: 'server',
  adapter: isNode
    ? node({ mode: 'standalone' })
    : cloudflare(),
  integrations: [react(), tailwind()],
  viewTransitions: true,
  vite: {
    build: {
      rollupOptions: isNode ? {
        external: ['cloudflare:workers']
      } : {}
    }
  }
});
