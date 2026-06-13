/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { componentTagger } from 'lovable-tagger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './setupTests.ts',
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === 'PLUGIN_WARNING' ||
          warning.message?.includes('baseUrl') ||
          warning.message?.includes('tsconfig')
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  esbuild: {
    target: 'es2020',
  },
}));