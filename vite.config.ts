import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /^\/data\/.*\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-data',
              expiration: { maxEntries: 20 },
            },
          },
        ],
      },
      manifest: {
        name: 'D&D 5e Character Sheet',
        short_name: 'DnD Sheet',
        description: 'D&D 5e character sheet and NPC manager',
        theme_color: '#1c1c1c',
        background_color: '#1c1c1c',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
