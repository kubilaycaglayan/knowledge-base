import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  // Prebundle the lazy-loaded settings field before browser tests navigate to it.
  // Otherwise Vite reloads the page when it first discovers the component.
  optimizeDeps: { include: ["vuetify/components/VTextField"] },
  server: {
    host: "0.0.0.0",
    port: 5177,
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "threads",
    css: true,
    exclude: [
      "node_modules",
      "scripts/**/*.test.mjs",
    ],
    server: { deps: { inline: ["vuetify"] } },
  },
});
