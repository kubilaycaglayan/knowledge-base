const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("./options.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function createOptions({ apiBase = undefined, granted = true } = {}) {
  const elements = {
    api: { value: "", textContent: "", onclick: null },
    status: { value: "", textContent: "", onclick: null },
    save: { value: "", textContent: "", onclick: null },
  };
  const storage = {
    async get(key) {
      assert.equal(key, "apiBase");
      return { apiBase };
    },
    async set(value) {
      storage.saved = value;
    },
    saved: null,
  };
  const context = {
    URL,
    document: { getElementById: (id) => elements[id] },
    chrome: {
      storage: { local: storage },
      permissions: {
        request: async (details) => {
          storage.permissionRequest = details;
          return granted;
        },
      },
    },
    KnowApiConfig: {
      apiBase: (value) => value || "http://localhost:8080/api/v1",
      normalize: (value) => value.replace(/\/$/, ""),
    },
  };
  vm.runInNewContext(source, context);
  return { elements, storage };
}

test("loads the configured API base or the default", async () => {
  const configured = createOptions({ apiBase: "https://know.example/api/v1" });
  await flush();
  assert.equal(configured.elements.api.value, "https://know.example/api/v1");

  const fallback = createOptions();
  await flush();
  assert.equal(fallback.elements.api.value, "http://localhost:8080/api/v1");
});

test("requests origin permission and saves a normalized API URL", async () => {
  const { elements, storage } = createOptions();
  await Promise.resolve();
  elements.api.value = "https://know.example/api/v1/";
  await elements.save.onclick();

  assert.equal(
    JSON.stringify(storage.permissionRequest),
    JSON.stringify({ origins: ["https://know.example/*"] }),
  );
  assert.equal(
    JSON.stringify(storage.saved),
    JSON.stringify({ apiBase: "https://know.example/api/v1" }),
  );
  assert.equal(elements.status.textContent, "Saved.");
});

test("reports denied permissions without persisting the URL", async () => {
  const { elements, storage } = createOptions({ granted: false });
  await flush();
  elements.api.value = "https://know.example/api/v1";
  await elements.save.onclick();

  assert.equal(storage.saved, null);
  assert.equal(elements.status.textContent, "Permission was not granted");
});

test("reports malformed API URLs without requesting permissions", async () => {
  const { elements, storage } = createOptions();
  await flush();
  elements.api.value = "not a URL";
  await elements.save.onclick();

  assert.equal(storage.permissionRequest, undefined);
  assert.equal(elements.status.textContent, "Invalid URL");
});
