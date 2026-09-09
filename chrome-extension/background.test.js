const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("./background.js"), "utf8").replace(/^import .*\n/, "");

function createBackground({ token = null, apiBase = undefined, response = null, openPopupFailure = false } = {}) {
  let handler;
  const state = { token, apiBase, response, calls: [] };
  const context = {
    chrome: {
      runtime: {
        onInstalled: { addListener: () => {} },
        onMessage: { addListener: (listener) => { handler = listener; } },
        getURL: (path) => `chrome-extension://${path}`,
      },
      action: { openPopup: async () => { if (openPopupFailure) throw new Error("popup unavailable"); state.popupOpened = true; } },
      tabs: { create: async (details) => { state.fallbackTab = details; } },
      storage: { local: {
        get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, state[key]])),
        remove: async () => {},
      } },
    },
    fetch: async (url, options) => {
      state.calls.push({ url, options });
      const current = state.response || { status: 200, ok: true, body: { imported: 1, skipped: 0, createdPaths: 0 } };
      return {
        status: current.status,
        ok: current.ok ?? current.status < 400,
        url,
        redirected: false,
        headers: { get: () => "application/json" },
        text: async () => typeof current.body === "string" ? current.body : JSON.stringify(current.body || ""),
        json: async () => current.body,
      };
    },
    console: { warn: () => {} },
  };
  vm.runInNewContext(source, context);
  return { state, handler };
}

const payload = { timeentries: [{ description: "Focus", timeInterval: { start: "2026-09-01T10:00:00Z", end: "2026-09-01T11:00:00Z" } }] };

test("requires an extension login before importing Clockify data", async () => {
  const { handler, state } = createBackground();
  let result;
  assert.equal(handler({ type: "KNOW_CLOCKIFY_IMPORT", payload }, { origin: "https://app.clockify.me" }, (value) => { result = value; }), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(JSON.stringify(result), JSON.stringify({ ok: false, needsLogin: true, error: "Sign in through the Know extension first." }));
  assert.equal(state.calls.length, 0);
});

test("posts a valid import using the stored token and API base", async () => {
  const { handler, state } = createBackground({ token: "token", apiBase: "https://know.example/api/v1" });
  let result;
  handler({ type: "KNOW_CLOCKIFY_IMPORT", payload }, { origin: "https://app.clockify.me" }, (value) => { result = value; });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(JSON.stringify(result), JSON.stringify({ ok: true, summary: { imported: 1, skipped: 0, createdPaths: 0 } }));
  assert.equal(state.calls[0].url, "https://know.example/api/v1/imports/clockify");
  assert.equal(state.calls[0].options.headers.Authorization, "Bearer token");
  assert.deepEqual(JSON.parse(state.calls[0].options.body), payload);
});

test("rejects Clockify import messages from another origin", () => {
  const { handler, state } = createBackground({ token: "token" });
  const result = handler({ type: "KNOW_CLOCKIFY_IMPORT", payload }, { origin: "https://evil.example" }, () => {});

  assert.equal(result, false);
  assert.equal(state.calls.length, 0);
});

test("returns actionable responses for expired tokens and blocked origins", async () => {
  for (const response of [
    { status: 401, body: "expired" },
    { status: 403, body: "blocked" },
  ]) {
    const { handler } = createBackground({ token: "token", response });
    let result;
    handler({ type: "KNOW_CLOCKIFY_IMPORT", payload }, { origin: "https://app.clockify.me" }, (value) => { result = value; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.ok, false);
    assert.match(result.error, /Know/);
  }
});

test("falls back to the popup tab when the action popup cannot open", async () => {
  const { handler, state } = createBackground({ openPopupFailure: true });

  assert.equal(handler({ type: "KNOW_OPEN_POPUP" }, {}, () => {}), false);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(state.fallbackTab.url, "chrome-extension://popup.html");
  assert.equal(state.popupOpened, undefined);
});
