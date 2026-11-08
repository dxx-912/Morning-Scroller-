/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }
import { videoApi } from './server/videoApi'

// The site's public address, for the "open it on your phone" QR code.
// Vercel's per-deployment and branch URLs ask visitors to log in to Vercel,
// so link to the production domain instead. Vercel provides it at build time;
// VITE_PUBLIC_URL overrides it (e.g. for a custom domain).
const PUBLIC_URL =
  process.env.VITE_PUBLIC_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __PUBLIC_URL__: JSON.stringify(PUBLIC_URL.replace(/\/$/, '')),
  },
  plugins: [
    react(),
    tailwindcss(),
    // GET /api/video/:shortcode, so reels play in the app's own player (dev/preview only).
    videoApi(),
    // `npm run dev:https` serves over HTTPS with a self-signed cert. Phones only
    // allow service workers (offline + install) on HTTPS or localhost.
    process.env.HTTPS ? basicSsl() : null,
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Saved Feed',
        short_name: 'Saved Feed',
        description: 'Your Instagram saves, reshuffled into a calm daily feed.',
        theme_color: '#0b0b0d',
        background_color: '#0b0b0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        navigateFallback: 'index.html',
        // Server routes (video lookups, the login refresh page) must reach the network.
        navigateFallbackDenylist: [/^\/api\//],
      },
      // Flip to true to test the service worker during `npm run dev`.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true, // listen on your LAN IP so your phone can connect
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
