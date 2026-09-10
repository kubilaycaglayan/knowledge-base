import "../clockify-page.js";

export default defineContentScript({
  matches: ["https://app.clockify.me/*"],
  runAt: "document_start",
  world: "MAIN",
  main() {},
});
