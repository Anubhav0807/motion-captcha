import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In development the dashboard proxies /api and /v1 to the FastAPI backend, so the
// session cookie stays same-origin. In production, serve dist/ from the backend
// (DASHBOARD_DIST) or put both behind one reverse proxy.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8000';
  return {
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        '/api': { target, changeOrigin: false },
        '/v1': { target, changeOrigin: false },
      },
    },
  };
});
