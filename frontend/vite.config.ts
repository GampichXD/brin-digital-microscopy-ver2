import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(), 
    react(),
    VitePWA({
      selfDestroying: true, // KILL SWITCH: Membunuh paksa semua Service Worker lama di semua perangkat pengguna!
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'favicon.svg', 'icons.svg'],
      manifest: {
        name: 'BRIN Digital Microscopy',
        short_name: 'DIGIMIC',
        description: 'Vision berbasis OpenCV dan inferensi YOLO pada perangkat Edge Computing Jetson Orin Nano.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true // Penting untuk proxy koneksi WebSocket
      }
    }
  }
})
