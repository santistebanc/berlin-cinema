import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();
const buildTime = new Date().toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin', timeZoneName: 'short',
});

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(`${gitHash} · ${buildTime}`),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        // Precache the app shell
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache movies.json: serve fresh when online, fall back to cache offline
            urlPattern: /\/movies\.json(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'movies-data',
              networkTimeoutSeconds: 5,
              expiration: { maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Cache poster images from critic.de
            urlPattern: /^https:\/\/www\.critic\.de\/.+\.(jpe?g|png|webp|gif)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'movie-posters',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts' },
          },
        ],
      },
      manifest: {
        name: 'OV Berlin',
        short_name: 'OV Berlin',
        description: 'Original version movies playing in Berlin cinemas',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: true,
  },
})