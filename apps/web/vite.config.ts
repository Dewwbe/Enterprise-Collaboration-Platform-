import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Lets the frontend call `/api/v1/...` in dev without CORS juggling;
      // the NestJS API's actual base URL is still configured via VITE_API_URL
      // for production builds (see src/api/client.ts).
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
