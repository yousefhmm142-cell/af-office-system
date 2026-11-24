import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Laravel API runs beside the app; in development requests to /api go to it.
const api = 'http://127.0.0.1:8000'

export default defineConfig({
  // Older phones must still run the site.
  build: { target: ['chrome80', 'safari13'] },
  plugins: [react()],
  server: { proxy: { '/api': { target: api, changeOrigin: true } } },
  preview: { proxy: { '/api': { target: api, changeOrigin: true } } },
})
