import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // just-bash's browser bundle references node:zlib for its gzip
      // coreutils, which the arena does not need.
      'node:zlib': fileURLToPath(new URL('./src/vendor/zlib-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4517',
    },
  },
})
