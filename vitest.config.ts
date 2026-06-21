import path from 'path'
import { defineConfig } from 'vitest/config'

// Standalone test config (kept separate from vite.config.ts so the PWA/React
// plugins don't load for unit tests). Pure-logic tests run in the node
// environment; the `@` alias mirrors the app so future store/lib tests resolve.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts', 'src/**/*.test.ts', 'functions/**/*.test.ts'],
    // Booting Miniflare (a real local D1 in workerd) for the backend authority
    // tests costs a few seconds; give the suite headroom over the 5s default.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
