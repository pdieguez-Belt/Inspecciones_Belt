import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['fotos-belt.proyectopd.com.ar'],
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'fotos-belt.proyectopd.com.ar',
      overlay: false,
      timeout: 5000,
    },
    proxy: {
      '/api': 'http://localhost:3004',
    },
  },
})
