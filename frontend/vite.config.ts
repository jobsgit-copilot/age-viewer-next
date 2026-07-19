import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend (Express, :3001) serves the production build from
// `frontend/build` relative to the repo root — keep `outDir: 'build'`
// (NOT the Vite default `dist`) so that parity holds.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
  },
  server: {
    port: 3000,
    proxy: {
      // Same-origin proxy so the express-session `connect.sid` cookie
      // works without CORS/cross-site cookie issues.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
