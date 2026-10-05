import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: true,
    // The play-page tests click through whole turns and take 2-3 s each on an idle machine; the default
    // 5 s is too tight when the suite runs in parallel on a busy one.
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});