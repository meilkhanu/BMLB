import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      // 语义色：值来自 src/styles/tokens.css 的 CSS 变量（浅/深两套在那里定义）。
      // 页面里请用 text-ink / text-ink-2 / text-ink-muted / text-accent，别再写死色值。
      colors: {
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-muted': 'var(--ink-muted)',
        accent: 'var(--accent)',
      },
    },
  },
  plugins: [typography],
  darkMode: 'class',
};
