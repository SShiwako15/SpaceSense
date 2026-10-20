import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5080',
        changeOrigin: true,
      },
    },
  },
});
