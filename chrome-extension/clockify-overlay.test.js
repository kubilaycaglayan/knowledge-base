const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const source = fs.readFileSync(require.resolve("./clockify-overlay.js"), "utf8");

function createOverlay({ response = { ok: true, summary: { imported: 1, skipped: 0, createdPaths: 0 } } } = {}) {
  const elements = {
    ".message": { textContent: "Watching detailed reports…", className: "message" },
    ".imported": { textContent: "0" },
    ".skipped": { textContent: "0" },
    ".paths": { textContent: "0" },
    ".counts": { hidden: true },
    ".login": { hidden: true, onclick: null },
  };
  let messageHandler;
  const routeHandlers = {};
  const shadow = {
    innerHTML: "",
    querySelector: (selector) => elements[selector],
  };
  const window = {
    top: null,
    location: { href: "https://app.clockify.me/reports/detailed" },
    addEventListener: (type, listener) => { if (type === "message") messageHandler = listener; else routeHandlers[type] = listener; },
    postMessage: () => {},
  };
  window.top = window;
  const sent = [];
  const context = {
    window,
    document: {
      documentElement: { appendChild: () => ({ id: "overlay", attachShadow: () => shadow }) },
      createElement: () => ({}),
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage: (message, callback) => { sent.push(message); callback(response); },
      },
    },
    KnowClockifyValidation: {
      validate: (payload) => payload && Array.isArray(payload.timeentries)
        ? { ok: true }
        : { ok: false, error: "Clockify report is invalid or too large." },
    },
    crypto: webcrypto,
    URL,
    TextEncoder,
    setTimeout,
  };
  vm.runInNewContext(source.replace('import "./clockify-validation.js";', ""), context);
  return {
    elements,
    sent,
    window,
    navigate: (href) => { window.location.href = href; routeHandlers.popstate?.(); },
    emit: (data, origin = "https://app.clockify.me", sourceWindow = window) => messageHandler({ source: sourceWindow, origin, data }),
  };
}

const report = { source: "know-clockify", type: "detailed-report", payload: { timeentries: [{ id: "entry-1" }] } };

test("forwards a valid report once and renders the import summary", async () => {
  const overlay = createOverlay();
  await overlay.emit(report);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(overlay.sent.length, 1);
  assert.equal(overlay.sent[0].type, "KNOW_CLOCKIFY_IMPORT");
  assert.equal(overlay.elements[".message"].textContent, "Imported 1 sessions from this report.");
  assert.equal(String(overlay.elements[".imported"].textContent), "1");
  assert.equal(overlay.elements[".counts"].hidden, false);

  await overlay.emit(report);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(overlay.sent.length, 1);
});

test("shows validation and empty-report messages without sending imports", async () => {
  const overlay = createOverlay();
  await overlay.emit({ source: "know-clockify", type: "detailed-report", payload: {} });
  assert.equal(overlay.sent.length, 0);
  assert.equal(overlay.elements[".message"].textContent, "Clockify report is invalid or too large.");

  await overlay.emit({ source: "know-clockify", type: "detailed-report", payload: { timeentries: [] } });
  assert.equal(overlay.sent.length, 0);
  assert.equal(overlay.elements[".message"].textContent, "No completed entries in this report.");
});

test("shows the overlay after SPA navigation to the detailed report", async () => {
  const overlay = createOverlay();
  overlay.navigate("https://app.clockify.me/dashboard");
  await overlay.emit(report);
  assert.equal(overlay.sent.length, 0);

  overlay.navigate("https://app.clockify.me/reports/detailed");
  await overlay.emit(report);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(overlay.sent.length, 1);
});

test("ignores messages from the wrong window or origin", async () => {
  const overlay = createOverlay();
  await overlay.emit(report, "https://evil.example");
  await overlay.emit(report, "https://app.clockify.me", {});

  assert.equal(overlay.sent.length, 0);
});
