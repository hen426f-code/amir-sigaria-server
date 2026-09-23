import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
  strictPort: true,
  allowedHosts: true,
  headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    },
  },
  build: {
    target: 'es2020',
    outDir: 'public',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
  rollupOptions: {
      output: { inlineDynamicImports: true, manualChunks: undefined },
    },
  },
  optimizeDeps: {
    exclude: [],
    include: ['three'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
