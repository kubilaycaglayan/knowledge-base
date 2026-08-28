import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  server: {
    host: "0.0.0.0",
    port: 5177,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:8080", changeOrigin: true } },
  },
  test: { environment: "jsdom", globals: true },
});
