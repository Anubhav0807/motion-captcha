import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, requests to /api are proxied to your backend.
// Set VITE_DEV_PROXY_TARGET in .env.local (e.g. http://localhost:8080).
export default defineConfig(({ mode }) => {
  const target = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target, changeOrigin: true } },
    },
  };
});
