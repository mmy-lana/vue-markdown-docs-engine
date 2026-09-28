import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';

/**
 * Single-entry build config for the BaseModal test fixture.
 * Kept separate from `vite.config.ts` so the fixture never ships in `dist`.
 */
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url))
    }
  },
  build: {
    outDir: 'tests/.modal-dist',
    rollupOptions: {
      input: {
        modal: resolve(process.cwd(), 'tests/modal/index.html')
      }
    }
  }
});
