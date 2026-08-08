import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  publicDir: false,
  plugins: [vue()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    strictPort: true,
  },
});
