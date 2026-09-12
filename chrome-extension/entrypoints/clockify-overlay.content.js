import "../clockify-overlay.js";
import "../clockify-settings.js";

export default defineContentScript({
  matches: ["https://app.clockify.me/*"],
  runAt: "document_start",
  main() {},
});
