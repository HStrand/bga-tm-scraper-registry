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
        // The game engine (tm-engine) is a separate Functions app; it also serves under /api.
        '/engine-api': {
          target: env.VITE_ENGINE_API_BASE_URL || 'http://localhost:7102',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/engine-api/, '/api'),
        },
      },
    },
  };
});
