import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base: works on GitHub Pages under /Kalyta/ and anywhere else.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // a new version waits until the user taps Update (see src/lib/update.ts)
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Kalyta',
        short_name: 'Kalyta',
        description: 'Personal finance that lives in your own Google Sheet.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // bank logos: keep them so accounts don't lose their pictures offline
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              (url.hostname === 'www.google.com' && url.pathname.startsWith('/s2/favicons')) ||
              (url.hostname.endsWith('.gstatic.com') && url.pathname.startsWith('/favicon')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'logos',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
