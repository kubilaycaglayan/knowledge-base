import { defineConfig } from "wxt";

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: "Know time tracker",
    version: "0.1.0",
    description: "Explicitly track time against your Know paths and items.",
    permissions: ["storage"],
    host_permissions: ["http://localhost:8080/*"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    options_ui: {
      open_in_tab: true,
    },
  },
  dev: {
    reloadCommand: "Alt+R",
  },
  webExt: {
    disabled: true,
  },
});
