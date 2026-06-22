import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  (globalThis as any).__cfEnv = context.locals.runtime?.env ?? null;
  return next();
});
