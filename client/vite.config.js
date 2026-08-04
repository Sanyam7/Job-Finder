import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      // The workspace package is plain ESM source; Vite needs the explicit entry.
      '@verihire/shared': path.resolve(process.cwd(), '../shared/index.js'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      // Same-origin in development too, so the SameSite=Strict refresh cookie behaves
      // exactly as it will in production behind nginx.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        /**
         * Split the heavy, rarely-changing dependencies into their own chunks so an app
         * code change does not invalidate the whole vendor bundle in users' caches.
         * `charts` matters most — Recharts is large and only the admin portal needs it.
         */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          redux: ['@reduxjs/toolkit', 'react-redux', 'redux-persist'],
          query: ['@tanstack/react-query'],
          forms: ['react-hook-form', 'yup', '@hookform/resolvers'],
          charts: ['recharts'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
