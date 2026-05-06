import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': { target: 'http://backend:3000', changeOrigin: true },
      '/health': { target: 'http://backend:3000', changeOrigin: true },
      '/uploads': { target: 'http://backend:3000', changeOrigin: true },
    },
  },
})
