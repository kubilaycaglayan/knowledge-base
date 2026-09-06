const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("./clockify-page.js"), "utf8");

function createPage() {
  const messages = [];
  const originalFetch = async () => ({
    clone: () => ({ json: async () => ({ timeentries: [{ id: "entry-1" }] }) }),
  });
  class FakeXHR {
    constructor() { this.listeners = {}; this.responseText = JSON.stringify({ timeentries: [{ id: "entry-2" }] }); }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    open(method, url) { this.url = url; return "opened"; }
    send() { this.listeners.load?.(); return "sent"; }
  }
  const window = {
    top: null,
    location: { href: "https://app.clockify.me/reports/detailed" },
    fetch: originalFetch,
    postMessage: (message, targetOrigin) => messages.push({ message, targetOrigin }),
    XMLHttpRequest: FakeXHR,
  };
  window.top = window;
  vm.runInNewContext(source, { window, location: window.location, XMLHttpRequest: FakeXHR, URL, console: { warn: () => {} } });
  return { window, messages, originalFetch };
}

const reportUrl = "https://app.clockify.me/report/workspaces/workspace-1/async/reports/detailed/report-1";

test("publishes valid detailed reports intercepted through fetch", async () => {
  const page = createPage();
  await page.window.fetch(reportUrl);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(JSON.stringify(page.messages.map(({ message, targetOrigin }) => ({ message, targetOrigin }))), JSON.stringify([{
    message: { source: "know-clockify", type: "detailed-report", payload: { timeentries: [{ id: "entry-1" }] } },
    targetOrigin: "https://app.clockify.me",
  }]));
});

test("publishes valid detailed reports intercepted through XHR", () => {
  const page = createPage();
  const xhr = new page.window.XMLHttpRequest();
  xhr.open("GET", reportUrl);
  xhr.send();

  assert.equal(page.messages[0].message.type, "detailed-report");
  assert.equal(JSON.stringify(page.messages[0].message.payload), JSON.stringify({ timeentries: [{ id: "entry-2" }] }));
});

test("ignores non-report URLs", async () => {
  const page = createPage();
  await page.window.fetch("https://app.clockify.me/dashboard");
  const xhr = new page.window.XMLHttpRequest();
  xhr.open("GET", "https://example.com/report/workspaces/a/async/reports/detailed/b");
  xhr.send();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(page.messages.length, 0);
});
