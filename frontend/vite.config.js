import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
  },
  // [FIX: Phase 1] Vite dev proxy — forwards all /api/* requests to the FastAPI backend.
  // Prevents "Unexpected token '<'" errors caused by Vite returning index.html for API routes.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
