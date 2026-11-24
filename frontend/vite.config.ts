import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The Laravel API runs beside the app; in development requests to /api go to it.
const api = 'http://127.0.0.1:8000'

export default defineConfig({
  // Older phones must still run the site.
  build: { target: ['chrome80', 'safari13'] },
  plugins: [
    react(),
    VitePWA({
      // The page is never reloaded under someone: a new version shows a small bar with a button.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo.webp'],
      manifest: {
        name: 'أبناء فارس أبو زايد · نظام المكاتب',
        short_name: 'أبناء فارس',
        description: 'نظام إدارة الفروع والموظفين',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F3F1EE',
        theme_color: '#8E1B2B',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app is kept on the phone, so it opens without internet.
        globPatterns: ['**/*.{js,css,html,woff2,png,webp,svg}'],
        skipWaiting: false,
        clientsClaim: false,
        navigateFallback: '/index.html',
        // The server's own addresses are never answered by the app page.
        navigateFallbackDenylist: [/^\/api\//, /^\/up$/],
      },
    }),
  ],
  server: { proxy: { '/api': { target: api, changeOrigin: true } } },
  preview: { proxy: { '/api': { target: api, changeOrigin: true } } },
})
