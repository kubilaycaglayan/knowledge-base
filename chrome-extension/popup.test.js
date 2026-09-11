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
    this.hidden = id === "settings-menu" || id === "timer-start-editor";
    this.disabled = false;
    this.multiple = false;
    this.options = [];
    this.children = [];
    this.onclick = null;
    this.onchange = null;
  }
  get selectedOptions() { return this.options.filter((option) => option.selected); }
  append(...items) {
    if (this.id === "label" || this.id === "path") this.options.push(...items);
    else this.children.push(...items);
  }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  replaceChildren() { this.options = []; this.children = []; }
  insertAdjacentHTML() {}
  querySelector() { return null; }
}

function createPopup({ token = null, currentTimer = null, statusByPath = {}, deferHistory = false } = {}) {
  const elements = Object.fromEntries([
    "status", "timer-details", "timer-start-editor", "timer-started-at", "save-timer-start", "cancel-timer-start", "path", "label", "selected-labels", "description", "toggle", "sessions", "error",
    "loading", "auth", "workspace", "email", "password", "login", "google-login", "logout", "options", "settings-menu-toggle", "settings-menu",
  ].map((id) => [id, new Element(id)]));
  const state = { token, activeTimer: null, calls: [], diagnostics: [], errors: [] };
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
    ["/labels?scope=TIME_ENTRY", [{ id: "label-1", name: "Algorithms", color: "#2878D5" }]],
    ["/calendar/labels", [{ id: "calendar-only", name: "Calendar only", color: "#999999" }]],
    ["/timers/current", currentTimer],
    ["/time-entries?page=0&size=20", []],
    ["/timers", { id: "timer-1", pathId: "path-1", startedAt: "2026-09-01T10:00:00Z", running: true }],
  ]);
  const context = {
    document: {
      getElementById: (id) => elements[id],
      createElement: (tag) => tag === "option" ? { value: "", textContent: "", selected: false } : new Element(tag),
    },
    chrome: { storage: { local: storage }, runtime: { getManifest: () => ({ version: "test-version" }), openOptionsPage: () => { state.optionsOpened = true; } } },
    crypto: { randomUUID: () => `uuid-${state.diagnostics.length}-${state.calls.length}` },
    performance: { now: () => 100 },
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
    console: {
      info: (...args) => state.diagnostics.push(args),
      error: (...args) => state.errors.push(args),
    },
  };
  vm.runInNewContext(source, context);
  return { elements, state, storage };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("hides the loading state after bootstrap", () => {
  assert.match(styles, /\.loading-state\[hidden\]\{display:none\}/);
  assert.match(styles, /\.timer-start-editor\[hidden\]\{display:none\}/);
});

test("keeps account actions behind the compact settings menu", async () => {
  const popup = createPopup({ token: "token" });
  await flush();
  await flush();
  await flush();

  assert.equal(popup.elements["settings-menu"].hidden, true);
  await popup.elements["settings-menu-toggle"].onclick();
  assert.equal(popup.elements["settings-menu"].hidden, false);
  assert.equal(popup.elements["settings-menu-toggle"]["aria-expanded"], "true");
  await popup.elements.options.onclick();
  assert.equal(popup.state.optionsOpened, true);
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
  assert.equal(popup.elements.toggle.textContent, "▶");
  assert.equal(popup.elements.toggle["aria-label"], "Start timer");
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

test("loads only labels scoped for time-entry sessions", async () => {
  const popup = createPopup({ token: "token" });
  await flush();
  await flush();
  await flush();

  assert.ok(popup.state.calls.some(({ path }) => path === "/labels?scope=TIME_ENTRY"));
  assert.equal(popup.state.calls.some(({ path }) => path === "/calendar/labels"), false);
  assert.deepEqual(popup.elements.label.options.map((option) => option.value), ["", "label-1"]);
});

test("emits production-safe diagnostics for workspace loading and API requests", async () => {
  const popup = createPopup({ token: "private-token" });
  await flush();
  await flush();
  await flush();
  await flush();

  const serialized = JSON.stringify(popup.state.diagnostics);
  assert.match(serialized, /Workspace load started/);
  assert.match(serialized, /API response received/);
  assert.match(serialized, /Workspace load completed/);
  assert.doesNotMatch(serialized, /private-token/);
});

test("logs the failing workspace stage without exposing the token", async () => {
  const popup = createPopup({ token: "private-token", statusByPath: { "/paths": 500 } });
  await flush();
  await flush();
  await flush();

  const serialized = JSON.stringify(popup.state.errors);
  assert.match(serialized, /Load workspace/);
  assert.match(serialized, /load-paths-and-labels/);
  assert.doesNotMatch(serialized, /private-token/);
});

test("shows a sanitized diagnostic reference for production workspace failures", async () => {
  const popup = createPopup({ token: "private-token", statusByPath: { "/paths": 500 } });
  await flush();
  await flush();
  await flush();

  assert.match(popup.elements.error.textContent, /Sign in failed or the API is unavailable/);
  assert.match(popup.elements.error.textContent, /diagnostic popup-.*stage=load-paths-and-labels/);
  assert.doesNotMatch(popup.elements.error.textContent, /private-token/);
});

test("starts a server timer with selected path, labels, description, and extension source", async () => {
  const popup = createPopup({ token: "token" });
  await flush();
  await flush();
  await flush();
  popup.elements.path.value = "path-1";
  popup.elements.label.value = "label-1";
  await popup.elements.label.onchange();
  popup.elements.description.value = "Read algorithms";
  await popup.elements.toggle.onclick();

  const start = popup.state.calls.find(({ path, options }) => path === "/timers" && options.method === "POST");
  assert.ok(start);
  assert.deepEqual(JSON.parse(start.options.body), { pathId: "path-1", labelIds: ["label-1"], description: "Read algorithms", source: "CHROME_EXTENSION" });
  assert.equal(popup.state.activeTimer.id, "timer-1");
  assert.equal(popup.elements.toggle.textContent, "■");
  assert.equal(popup.elements.toggle["aria-label"], "Stop timer");
});

test("updates a running timer start through the native date and time picker", async () => {
  const popup = createPopup({
    token: "token",
    currentTimer: { id: "timer-1", pathId: "path-1", labelIds: ["label-1"], description: "Read algorithms", startedAt: "2026-09-01T10:00:00Z", running: true },
  });
  await flush();
  await flush();
  await flush();
  await popup.elements["timer-details"].onclick();
  popup.elements["timer-started-at"].value = "2026-09-01T09:30";
  assert.equal(popup.elements["timer-start-editor"].hidden, false);
  await popup.elements["timer-start-editor"].onsubmit({ preventDefault() {} });

  const update = popup.state.calls.find(({ path, options }) => path === "/timers/timer-1" && options.method === "PUT");
  assert.ok(update);
  assert.deepEqual(JSON.parse(update.options.body), {
    pathId: "path-1", labelIds: ["label-1"], startedAt: "2026-09-01T09:30:00.000Z", description: "Read algorithms",
  });
});

test("removes a label from the timer when its chip close button is clicked", async () => {
  const popup = createPopup({
    token: "token",
    currentTimer: { id: "timer-1", pathId: "path-1", labelIds: ["label-1"], startedAt: "2026-09-01T10:00:00Z", running: true },
  });
  await flush();
  await flush();
  await flush();
  await popup.elements["selected-labels"].children[0].children[1].onclick();

  const update = popup.state.calls.find(({ path, options }) => path === "/timers/timer-1" && options.method === "PUT");
  assert.ok(update);
  assert.deepEqual(JSON.parse(update.options.body).labelIds, []);
  assert.equal(popup.elements["selected-labels"].children.length, 0);
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
  assert.equal(popup.elements.toggle.textContent, "▶");
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
  assert.match(popup.elements.error.textContent, /^Sign in failed or the API is unavailable\. \[diagnostic popup-/);
});
