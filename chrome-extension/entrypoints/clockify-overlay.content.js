import "../clockify-overlay.js";

export default defineContentScript({
  matches: ["https://app.clockify.me/*"],
  runAt: "document_start",
  main() {},
});
