import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    allowedHosts: ['fotos-belt.proyectopd.com.ar'],
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api': 'http://localhost:3003',
    },
  },
})
