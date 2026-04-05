import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
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
          target: env.VITE_API_BASE_URL || 'http://localhost:7184',
          changeOrigin: true,
        },
      },
    },
  };
});
