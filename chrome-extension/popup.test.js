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
    this.insertedHTML = [];
  }
  get selectedOptions() {
    return this.options.filter((option) => option.selected);
  }
  append(...items) {
    if (this.id === "label" || this.id === "path") this.options.push(...items);
    else this.children.push(...items);
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  getAttribute(name) {
    return this[name] ?? null;
  }
  focus() {
    this.focused = true;
  }
  replaceChildren() {
    this.options = [];
    this.children = [];
  }
  insertAdjacentHTML(position, html) {
    this.insertedHTML.push({ position, html });
  }
  querySelector() {
    return null;
  }
  contains(target) {
    return (
      target === this || this.children.some((child) => child.contains?.(target))
    );
  }
}

function createPopup({
  token = null,
  currentTimer = null,
  statusByPath = {},
  deferHistory = false,
  history = [],
  fixtureLabels,
  fixturePaths,
  prompt = () => null,
} = {}) {
  const elements = Object.fromEntries(
    [
      "status",
      "timer-details",
      "timer-start-editor",
      "timer-started-date",
      "timer-started-time",
      "save-timer-start",
      "cancel-timer-start",
      "path",
      "label",
      "selected-labels",
      "description",
      "toggle",
      "sessions",
      "error",
      "loading",
      "auth",
      "workspace",
      "email",
      "password",
      "login",
      "google-login",
      "logout",
      "options",
      "settings-menu-toggle",
      "settings-menu",
      "clockify-import-toggle",
      "labels-picker",
      "labels-toggle",
      "labels-summary",
      "new-label",
      "create-label",
    ].map((id) => [id, new Element(id)]),
  );
  const state = { token, activeTimer: null, calls: [] };
  const storage = {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.map((key) => [key, state[key]]));
    },
    async set(values) {
      Object.assign(state, values);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
    },
    async clear() {
      for (const key of Object.keys(state))
        if (key !== "calls") delete state[key];
    },
  };
  const responses = new Map([
    ["/auth/login", { token: "signed-in-token" }],
    [
      "/paths",
      fixturePaths || [{ id: "path-1", name: "Learning", status: "ACTIVE" }],
    ],
    [
      "/labels?scope=TIME_ENTRY",
      fixtureLabels || [
        { id: "label-1", name: "Algorithms", color: "#2878D5" },
      ],
    ],
    [
      "/calendar/labels",
      [{ id: "calendar-only", name: "Calendar only", color: "#999999" }],
    ],
    ["/timers/current", currentTimer],
    ["/time-entries?page=0&size=20", history],
    [
      "/timers",
      {
        id: "timer-1",
        pathId: "path-1",
        startedAt: "2026-09-01T10:00:00Z",
        running: true,
      },
    ],
  ]);
  const context = {
    window: { prompt },
    document: {
      addEventListener: (name, handler) => {
        state[name] = handler;
      },
      getElementById: (id) => elements[id],
      createElement: (tag) =>
        tag === "option"
          ? {
              value: "",
              textContent: "",
              selected: false,
              setAttribute(name, value) {
                this[name] = value;
              },
              getAttribute(name) {
                return this[name] ?? null;
              },
            }
          : new Element(tag),
    },
    chrome: {
      storage: { local: storage },
      runtime: {
        getManifest: () => ({ version: "test-version" }),
        openOptionsPage: () => {
          state.optionsOpened = true;
        },
      },
    },
    crypto: {
      randomUUID: () =>
        `uuid-${state.diagnostics.length}-${state.calls.length}`,
    },
    performance: { now: () => 100 },
    KnowApiConfig: {
      apiBase: (value) => value || "http://localhost:8080/api/v1",
    },
    KnowCore: {
      activePaths: (paths) => paths.filter((path) => path.status === "ACTIVE"),
      timerLabels: (labels) => labels,
      timerStatus: (timer) => (timer ? "Running" : "No active timer"),
      timerIsRunning: (timer) => Boolean(timer?.running),
      timerStartPayload: (pathId, labelIds, description) => ({
        pathId: pathId || null,
        labelIds,
        description: description || null,
        source: "CHROME_EXTENSION",
      }),
      formatTimer: () => "00:00:00",
      formatGroupDuration: (sessions) => {
        const minutes = Math.floor(
          sessions.reduce(
            (total, session) => total + (session.durationSeconds || 0),
            0,
          ) / 60,
        );
        return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      },
    },
    KnowGoogleAuth: {},
    KnowClockifySettings: {
      KEY: "clockifyImportEnabled",
      isEnabled: (value) => value !== false,
    },
    fetch: async (url, options = {}) => {
      const path =
        new URL(url).pathname.replace("/api/v1", "") +
        (new URL(url).search || "");
      state.calls.push({ path, options });
      if (deferHistory && path === "/time-entries?page=0&size=20")
        return new Promise(() => {});
      const value =
        options.method === "POST" && ["/paths", "/labels"].includes(path)
          ? { ...JSON.parse(options.body), id: "created", status: "ACTIVE" }
          : path === "/timers/draft" && options.method === "PUT"
            ? JSON.parse(options.body)
            : responses.get(path);
      const status = statusByPath[path] || 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        url,
        redirected: false,
        headers: { get: () => "application/json" },
        text: async () => (value == null ? "" : JSON.stringify(value)),
      };
    },
    location: {
      reload: () => {
        state.reloaded = true;
      },
    },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (callback) => {
      state.timeout = callback;
      return 1;
    },
    clearTimeout: () => {},
    console: { warn: () => {} },
  };
  vm.runInNewContext(source, context);
  return { elements, state, storage };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function readyPopup(options) {
  const popup = createPopup(options);
  await flush();
  await flush();
  await flush();
  return popup;
}

test("acceptance P4–P9: excludes archived paths, creates and selects a trimmed path", async () => {
  const popup = await readyPopup({
    token: "token",
    prompt: () => "  Reading  ",
    fixturePaths: [
      { id: "active", name: "Active", status: "ACTIVE" },
      { id: "archived", name: "Archived", status: "ARCHIVED" },
    ],
  });
  assert.deepEqual(
    popup.elements.path.options.map((option) => option.textContent),
    ["＋ Add a new path…", "────────", "Active"],
  );
  popup.elements.path.value = "__add_new_path__";
  await popup.elements.path.onchange();
  assert.equal(popup.elements.path.value, "created");
  const request = popup.state.calls.find(
    (call) => call.path === "/paths" && call.options.method === "POST",
  );
  assert.equal(JSON.parse(request.options.body).name, "Reading");
  assert.equal(popup.elements.path.options.at(-1).textContent, "Reading");
});

test("acceptance L3–L15/L19–L20: multi-selection, counts, priority, expansion and dismissal", async () => {
  const popup = await readyPopup({
    token: "token",
    fixtureLabels: ["First", "Second", "Third"].map((name, i) => ({
      id: `label-${i}`,
      name,
    })),
  });
  const chips = () => popup.elements["selected-labels"].children;
  const toggle = popup.elements["labels-toggle"];
  const picker = popup.elements["labels-picker"];
  const summary = () => popup.elements["labels-summary"].textContent;
  assert.equal(summary(), "3 available");
  assert.equal(toggle["aria-expanded"], "false");
  await chips()[1].onclick();
  await chips()[2].onclick();
  assert.equal(toggle["aria-expanded"], "true");
  assert.deepEqual(
    chips().map((chip) => chip["aria-pressed"]),
    ["false", "true", "true"],
  );
  assert.equal(summary(), "3 available · 2 selected");
  toggle.onclick();
  assert.deepEqual(
    chips().map((chip) => chip.children[0].textContent),
    ["Second", "Third", "First"],
  );
  await chips()[0].onclick();
  assert.equal(toggle["aria-expanded"], "true");
  assert.deepEqual(
    chips().map((chip) => chip["aria-pressed"]),
    ["false", "false", "true"],
  );
  assert.equal(summary(), "3 available · 1 selected");
  picker.onkeydown({ key: "Escape", preventDefault() {} });
  assert.equal(toggle["aria-expanded"], "false");
  assert.equal(toggle.focused, true);
  toggle.onclick();
  popup.state.pointerdown({ target: picker });
  assert.equal(toggle["aria-expanded"], "true");
  popup.state.pointerdown({ target: popup.elements.description });
  assert.equal(toggle["aria-expanded"], "false");
  toggle.onclick();
  picker.onfocusout({ relatedTarget: popup.elements.description });
  assert.equal(toggle["aria-expanded"], "false");
});

for (const open of [false, true])
  test(`acceptance L16–L17: creates a label with picker open=${open}`, async () => {
    const popup = await readyPopup({ token: "token" });
    await popup.elements["selected-labels"].children[0].onclick();
    if (!open) popup.elements["labels-toggle"].onclick();
    popup.elements["new-label"].value = "  Review  ";
    await popup.elements["create-label"].onclick();
    const created = popup.state.calls.find(
      (call) => call.path === "/labels" && call.options.method === "POST",
    );
    assert.deepEqual(JSON.parse(created.options.body), {
      name: "Review",
      scopes: ["TIME_ENTRY"],
      color: null,
    });
    assert.equal(popup.elements["new-label"].value, "");
    assert.equal(
      popup.elements["labels-summary"].textContent,
      "2 available · 2 selected",
    );
    assert.ok(
      popup.elements["selected-labels"].children.every(
        (chip) => chip["aria-pressed"] === "true",
      ),
    );
    assert.equal(popup.elements["create-label"].disabled, false);
  });

test("acceptance C4: no labels retains a usable creation flow", async () => {
  const popup = await readyPopup({ token: "token", fixtureLabels: [] });
  assert.equal(popup.elements["labels-summary"].textContent, "0 available");
  assert.equal(popup.elements["labels-toggle"].hidden, true);
  popup.elements["new-label"].value = "First label";
  await popup.elements["create-label"].onclick();
  assert.equal(
    popup.elements["labels-summary"].textContent,
    "1 available · 1 selected",
  );
  assert.equal(popup.elements["labels-toggle"].hidden, false);
});

test("hides the loading state after bootstrap", () => {
  assert.match(
    styles,
    /\.loading-state\[hidden\]\s*\{\s*display:\s*none;?\s*\}/,
  );
  assert.match(
    styles,
    /\.timer-start-editor\[hidden\]\s*\{\s*display:\s*none;?\s*\}/,
  );
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

test("persists the Clockify import toggle from the settings menu", async () => {
  const popup = createPopup({ token: "token" });
  await flush();
  await flush();

  assert.equal(
    popup.elements["clockify-import-toggle"]["aria-checked"],
    "true",
  );
  await popup.elements["clockify-import-toggle"].onclick();
  assert.equal(popup.state.clockifyImportEnabled, false);
  assert.equal(
    popup.elements["clockify-import-toggle"]["aria-checked"],
    "false",
  );
  await popup.elements["clockify-import-toggle"].onclick();
  assert.equal(popup.state.clockifyImportEnabled, true);
  assert.equal(
    popup.elements["clockify-import-toggle"]["aria-checked"],
    "true",
  );
});

test("signs in, stores the token, and loads the timer workspace", async () => {
  const popup = createPopup();
  popup.elements.email.value = "person@example.com";
  popup.elements.password.value = "secret";
  popup.elements.login.onclick && (await popup.elements.login.onclick());
  // The initial token lookup and the login/load chain are asynchronous.
  await flush();
  await flush();
  await flush();

  assert.ok(
    popup.state.calls.some(
      ({ path, options }) =>
        path === "/auth/login" && options.method === "POST",
    ),
  );
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

  assert.ok(
    popup.state.calls.some(({ path }) => path === "/labels?scope=TIME_ENTRY"),
  );
  assert.equal(
    popup.state.calls.some(({ path }) => path === "/calendar/labels"),
    false,
  );
  assert.deepEqual(
    popup.elements["selected-labels"].children.map(
      (chip) => chip.children[0].textContent,
    ),
    ["Algorithms"],
  );
});

test("puts add path first and separates it from active paths", async () => {
  const popup = createPopup({ token: "token" });
  await flush();
  await flush();
  await flush();

  assert.deepEqual(
    popup.elements.path.options.map((option) => option.value),
    ["__add_new_path__", "", "path-1"],
  );
  assert.equal(popup.elements.path.options[1].disabled, true);
  assert.equal(popup.elements.path.options[1].getAttribute("aria-hidden"), null);
  assert.equal(popup.elements.path.selectedIndex, -1);
});

test("shows each session group total as an HH:MM separator value", async () => {
  assert.match(
    source,
    /session-group-duration.*KnowCore\.formatGroupDuration\(group\.sessions\)/,
  );
});

test("starts a server timer with selected path, labels, description, and extension source", async () => {
  const popup = createPopup({ token: "token" });
  await flush();
  await flush();
  await flush();
  popup.elements.path.value = "path-1";
  await popup.elements["selected-labels"].children[0].onclick();
  popup.elements.description.value = "Read algorithms";
  await popup.elements.toggle.onclick();

  const start = popup.state.calls.find(
    ({ path, options }) => path === "/timers" && options.method === "POST",
  );
  assert.ok(start);
  assert.deepEqual(JSON.parse(start.options.body), {
    pathId: "path-1",
    labelIds: ["label-1"],
    description: "Read algorithms",
    source: "CHROME_EXTENSION",
  });
  assert.equal(popup.state.activeTimer.id, "timer-1");
  assert.equal(popup.elements.toggle.textContent, "■");
  assert.equal(popup.elements.toggle["aria-label"], "Stop timer");
});

test("renders the running stop control as an icon, not text", async () => {
  const popup = createPopup({
    token: "token",
    currentTimer: {
      id: "timer-1",
      startedAt: "2026-09-01T10:00:00Z",
      running: true,
    },
  });
  await flush();
  await flush();
  await flush();

  assert.equal(popup.elements.toggle.textContent, "■");
  assert.equal(popup.elements.toggle["aria-label"], "Stop timer");
});

test("updates a running timer start through the native date and time picker", async () => {
  const popup = createPopup({
    token: "token",
    currentTimer: {
      id: "timer-1",
      pathId: "path-1",
      labelIds: ["label-1"],
      description: "Read algorithms",
      startedAt: "2026-09-01T10:00:00Z",
      running: true,
    },
  });
  await flush();
  await flush();
  await flush();
  await popup.elements["timer-details"].onclick();
  assert.equal(popup.elements["timer-start-editor"].hidden, false);
  assert.equal(popup.elements["timer-started-time"].focused, true);
  popup.elements["timer-started-date"].value = "2026-09-01";
  popup.elements["timer-started-time"].value = "09:30";
  await popup.elements["timer-start-editor"].onsubmit({ preventDefault() {} });

  const update = popup.state.calls.find(
    ({ path, options }) =>
      path === "/timers/timer-1" && options.method === "PUT",
  );
  assert.ok(update);
  assert.deepEqual(JSON.parse(update.options.body), {
    pathId: "path-1",
    labelIds: ["label-1"],
    startedAt: "2026-09-01T09:30:00.000Z",
    description: "Read algorithms",
  });
});

test("removes a label from the timer when its chip close button is clicked", async () => {
  const popup = createPopup({
    token: "token",
    currentTimer: {
      id: "timer-1",
      pathId: "path-1",
      labelIds: ["label-1"],
      startedAt: "2026-09-01T10:00:00Z",
      running: true,
    },
  });
  await flush();
  await flush();
  await flush();
  await popup.elements["selected-labels"].children[0].onclick();

  const update = popup.state.calls.find(
    ({ path, options }) =>
      path === "/timers/timer-1" && options.method === "PUT",
  );
  assert.ok(update);
  assert.deepEqual(JSON.parse(update.options.body).labelIds, []);
  assert.equal(
    popup.elements["selected-labels"].children[0]["aria-pressed"],
    "false",
  );
});

test("stops the server timer and clears its local active state", async () => {
  const popup = createPopup({
    token: "token",
    currentTimer: {
      id: "timer-1",
      startedAt: "2026-09-01T10:00:00Z",
      running: true,
    },
  });
  await flush();
  await flush();
  await flush();
  await popup.elements.toggle.onclick();

  assert.ok(
    popup.state.calls.some(
      ({ path, options }) =>
        path === "/timers/stop" && options.method === "POST",
    ),
  );
  assert.equal(popup.state.activeTimer, undefined);
  assert.equal(popup.elements.toggle.textContent, "▶");
  assert.equal(popup.elements.path.value, "");
  assert.equal(
    popup.elements["selected-labels"].children.every(
      (chip) => chip["aria-pressed"] === "false",
    ),
    true,
  );
  assert.equal(popup.elements.description.value, "");
  assert.ok(
    popup.state.calls.some(
      ({ path, options }) =>
        path === "/timers/draft" &&
        options.method === "PUT" &&
        JSON.parse(options.body).pathId === null &&
        JSON.parse(options.body).labelIds.length === 0 &&
        JSON.parse(options.body).description === null,
    ),
  );
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
  const popup = createPopup({
    token: "expired-token",
    statusByPath: { "/paths": 401 },
  });
  await flush();
  await flush();
  await flush();

  assert.equal(popup.state.token, undefined);
  assert.equal(popup.state.activeTimer, undefined);
  assert.equal(popup.state.reloaded, true);
  assert.equal(
    popup.elements.error.textContent,
    "Sign in failed or the API is unavailable.",
  );
});
