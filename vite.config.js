import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Mr3d-draw/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
