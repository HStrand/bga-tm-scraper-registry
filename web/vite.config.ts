import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7184',
        changeOrigin: true,
      },
    },
  },
});
