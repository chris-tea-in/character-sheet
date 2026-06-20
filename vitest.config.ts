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
    include: ['shared/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
