import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // сборка открывается из любой подпапки, в том числе на GitHub Pages
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 800 }, // three.js целиком — около 640 КБ
});
