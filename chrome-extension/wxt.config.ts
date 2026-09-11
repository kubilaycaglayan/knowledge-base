import { defineConfig } from "wxt";

const apiOrigin = process.env.KNOW_API_BASE
  ? new URL(process.env.KNOW_API_BASE).origin
  : "http://localhost:8080";
const iconVariant = process.env.KNOW_EXTENSION_ENV === "production" ? "production" : "development";
const extensionKey = process.env.CHROME_EXTENSION_KEY?.trim();

if (process.env.KNOW_EXTENSION_ENV === "production") {
  const configuredApi = new URL(process.env.KNOW_API_BASE || "");
  if (configuredApi.protocol !== "https:" || configuredApi.hostname === "localhost" || configuredApi.hostname === "127.0.0.1")
    throw new Error("Production extension builds require a public HTTPS API host");
}

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: "Knowledge Base",
    version: "0.1.16",
    description: "Explicitly track time against your Knowledge Base paths and labels.",
    icons: {
      16: `icons/${iconVariant}/icon-16.png`,
      32: `icons/${iconVariant}/icon-32.png`,
      48: `icons/${iconVariant}/icon-48.png`,
      128: `icons/${iconVariant}/icon-128.png`,
    },
    permissions: ["storage", "identity"],
    host_permissions: [`${apiOrigin}/*`, "https://app.clockify.me/reports/detailed*"],
    ...(extensionKey ? { key: extensionKey } : {}),
    options_ui: {
      open_in_tab: true,
    },
  },
  vite: () => ({
    define: {
      __KNOW_API_BASE__: JSON.stringify(process.env.KNOW_API_BASE || ""),
      __KNOW_EXTENSION_ENV__: JSON.stringify(process.env.KNOW_EXTENSION_ENV || "development"),
    },
  }),
  dev: {
    reloadCommand: "Alt+R",
  },
  webExt: {
    disabled: true,
  },
});
