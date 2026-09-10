const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("./popup.js"), "utf8");
const styles = fs.readFileSync(require.resolve("./popup.css"), "utf8");

class Element {
  constructor(id) {
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.multiple = id === "label";
    this.options = [];
    this.onclick = null;
    this.onchange = null;
  }
  get selectedOptions() { return this.options.filter((option) => option.selected); }
  append(option) { this.options.push(option); }
  replaceChildren() { this.options = []; }
  insertAdjacentHTML() {}
  querySelector() { return null; }
}

function createPopup({ token = null, currentTimer = null, statusByPath = {}, deferHistory = false } = {}) {
  const elements = Object.fromEntries([
    "status", "path", "label", "description", "toggle", "sessions", "error",
    "loading", "auth", "workspace", "email", "password", "login", "google-login", "logout", "options",
  ].map((id) => [id, new Element(id)]));
  const state = { token, activeTimer: null, calls: [] };
  const storage = {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.map((key) => [key, state[key]]));
    },
    async set(values) { Object.assign(state, values); },
    async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete state[key]; },
    async clear() { for (const key of Object.keys(state)) if (key !== "calls") delete state[key]; },
  };
  const responses = new Map([
    ["/auth/login", { token: "signed-in-token" }],
    ["/paths", [{ id: "path-1", name: "Learning", status: "ACTIVE" }]],
    ["/calendar/labels", [{ id: "label-1", name: "Algorithms", color: "#2878D5" }]],
    ["/timers/current", currentTimer],
    ["/time-entries?page=0&size=20", []],
    ["/timers", { id: "timer-1", pathId: "path-1", startedAt: "2026-09-01T10:00:00Z", running: true }],
  ]);
  const context = {
    document: {
      getElementById: (id) => elements[id],
      createElement: (tag) => tag === "option" ? { value: "", textContent: "", selected: false } : new Element(tag),
    },
    chrome: { storage: { local: storage } },
    KnowApiConfig: { apiBase: (value) => value || "http://localhost:8080/api/v1" },
    KnowCore: {
      activePaths: (paths) => paths.filter((path) => path.status === "ACTIVE"),
      timerLabels: (labels) => labels,
      timerStatus: (timer) => timer ? "Running" : "No active timer",
      timerIsRunning: (timer) => Boolean(timer?.running),
      timerStartPayload: (pathId, labelIds, description) => ({ pathId: pathId || null, labelIds, description: description || null, source: "CHROME_EXTENSION" }),
      formatTimer: () => "00:00:00",
    },
    KnowGoogleAuth: {},
    fetch: async (url, options = {}) => {
      const path = new URL(url).pathname.replace("/api/v1", "") + (new URL(url).search || "");
      state.calls.push({ path, options });
      if (deferHistory && path === "/time-entries?page=0&size=20") return new Promise(() => {});
      const value = responses.get(path);
      const status = statusByPath[path] || 200;
      return { ok: status >= 200 && status < 300, status, url, redirected: false, headers: { get: () => "application/json" }, text: async () => value == null ? "" : JSON.stringify(value) };
    },
    location: { reload: () => { state.reloaded = true; } },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (callback) => { state.timeout = callback; return 1; },
    clearTimeout: () => {},
    console: { warn: () => {} },
  };
  vm.runInNewContext(source, context);
  return { elements, state, storage };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("hides the loading state after bootstrap", () => {
  assert.match(styles, /\.loading-state\[hidden\]\{display:none\}/);
});

test("signs in, stores the token, and loads the timer workspace", async () => {
  const popup = createPopup();
  popup.elements.email.value = "person@example.com";
  popup.elements.password.value = "secret";
  popup.elements.login.onclick && await popup.elements.login.onclick();
  // The initial token lookup and the login/load chain are asynchronous.
  await flush();
  await flush();
  await flush();

  assert.ok(popup.state.calls.some(({ path, options }) => path === "/auth/login" && options.method === "POST"));
  assert.equal(popup.elements.workspace.hidden, false);
  assert.equal(popup.elements.auth.hidden, true);
  assert.equal(popup.elements.toggle.textContent, "Start timer");
});

test("shows the timer workspace while slow session history is still loading", async () => {
  const popup = createPopup({ token: "token", deferHistory: true });
  await flush();
  await flush();
  await flush();
  await flush();

  assert.equal(popup.elements.loading.hidden, true);
  assert.equal(popup.elements.workspace.hidden, false);
  assert.equal(popup.elements.auth.hidden, true);
  assert.equal(popup.elements.sessions.textContent, "");
});

test("starts a server timer with selected path, labels, description, and extension source", async () => {
  const popup = createPopup({ token: "token" });
  await flush();
  await flush();
  await flush();
  popup.elements.path.value = "path-1";
  popup.elements.label.options[0].selected = true;
  popup.elements.description.value = "Read algorithms";
  await popup.elements.toggle.onclick();

  const start = popup.state.calls.find(({ path, options }) => path === "/timers" && options.method === "POST");
  assert.ok(start);
  assert.deepEqual(JSON.parse(start.options.body), { pathId: "path-1", labelIds: ["label-1"], description: "Read algorithms", source: "CHROME_EXTENSION" });
  assert.equal(popup.state.activeTimer.id, "timer-1");
  assert.equal(popup.elements.toggle.textContent, "Stop timer");
});

test("stops the server timer and clears its local active state", async () => {
  const popup = createPopup({
    token: "token",
    currentTimer: { id: "timer-1", startedAt: "2026-09-01T10:00:00Z", running: true },
  });
  await flush();
  await flush();
  await flush();
  await popup.elements.toggle.onclick();

  assert.ok(popup.state.calls.some(({ path, options }) => path === "/timers/stop" && options.method === "POST"));
  assert.equal(popup.state.activeTimer, undefined);
  assert.equal(popup.elements.toggle.textContent, "Start timer");
});

test("logs out by clearing extension storage and reloading", async () => {
  const popup = createPopup({ token: "token" });
  await flush();
  await flush();
  await flush();
  await popup.elements.logout.onclick();

  assert.equal(popup.state.token, undefined);
  assert.equal(popup.state.reloaded, true);
});

test("clears an expired token and reloads when the API returns unauthorized", async () => {
  const popup = createPopup({ token: "expired-token", statusByPath: { "/paths": 401 } });
  await flush();
  await flush();
  await flush();

  assert.equal(popup.state.token, undefined);
  assert.equal(popup.state.activeTimer, undefined);
  assert.equal(popup.state.reloaded, true);
  assert.equal(popup.elements.error.textContent, "Sign in failed or the API is unavailable.");
});
