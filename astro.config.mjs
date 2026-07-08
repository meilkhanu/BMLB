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
  security: { checkOrigin: false },
  vite: {
    resolve: isNode ? {
      alias: {
        'cloudflare:workers': '/src/lib/cloudflare-workers-stub.ts'
      }
    } : {},
    build: {
      rollupOptions: {}
    }
  }
});
