import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { mdAsModulePlugin } from './challenges/package/md-vite-plugin.ts'

export default defineConfig({
  plugins: [mdAsModulePlugin(), vue(), tailwindcss()],
  resolve: {
    alias: {
      // just-bash's browser bundle references node:zlib for its gzip
      // coreutils, which the arena does not need.
      'node:zlib': fileURLToPath(new URL('./src/shared/lib/zlib-stub.ts', import.meta.url)),
      '@engine': fileURLToPath(new URL('./engine', import.meta.url)),
      '@challenges': fileURLToPath(new URL('./challenges', import.meta.url)),
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
