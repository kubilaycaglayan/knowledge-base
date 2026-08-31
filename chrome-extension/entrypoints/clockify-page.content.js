import "../clockify-page.js";

export default defineContentScript({
  matches: ["https://app.clockify.me/reports/detailed*"],
  runAt: "document_start",
  world: "MAIN",
  main() {},
});
