import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'PAO Card Trainer',
        short_name: 'PAO Trainer',
        description: 'Drill a Person-Action-Object memory system for a shuffled deck of cards.',
        theme_color: '#0E1512',
        background_color: '#0E1512',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@data': path.resolve(__dirname, 'src/data'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/domain/**/*.test.ts'],
  },
});
