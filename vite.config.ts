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
            // Serve the cached copy instantly, then refresh from the network in
            // the background. Crucially, only cache 200s — never a Cloudflare
            // Access login redirect or an error — so a bad response can't poison
            // the cache and wedge the app on "failed to fetch". Bump the cache
            // name so existing clients drop the old CacheFirst entries on update.
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'game-data-v2',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [200] },
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
