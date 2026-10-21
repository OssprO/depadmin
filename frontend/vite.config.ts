import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Same-origin in dev, as in production behind nginx: no CORS needed. `vite preview`
    // reuses it; the browser tests point it at their own API with API_URL.
    proxy: {
      '/api': process.env['API_URL'] ?? 'http://localhost:3000',
    },
  },
});
