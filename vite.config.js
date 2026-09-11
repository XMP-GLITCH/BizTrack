import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'avatars/*.png', 'sounds/*.mp3'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      manifest: {
        name: 'BizTrack',
        short_name: 'BizTrack',
        description: 'Multi-Business Finance Tracker',
        theme_color: '#2C1810',
        background_color: '#2C1810',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        /**
         * Split the big dependencies into their own chunks.
         *
         * This does not shrink the first load much -- the same bytes still
         * arrive. What it changes is EVERY load after an update: app code
         * changes on most deploys, these libraries almost never do. Keeping
         * them separate means a new release invalidates the small app chunk
         * and leaves ~400 KB of vendor code in the service worker cache.
         *
         * For a user paying by the megabyte who gets an update every few days,
         * that is the difference between re-downloading the whole app and
         * re-downloading the part that actually changed.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "supabase";
          // Vite normalises ids to forward slashes, so a plain check is enough.
          if (id.includes("react-dom") || id.includes("node_modules/react/")) return "react";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("zustand")) return "store";
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
