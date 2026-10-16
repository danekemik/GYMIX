import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { offlineBuild } from './build/offline';

export default defineConfig({
  plugins: [react(), offlineBuild()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es',
  },
});