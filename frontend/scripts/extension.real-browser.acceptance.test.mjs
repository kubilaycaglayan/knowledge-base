import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, it } from "node:test";
import { chromium } from "playwright";

const extensionPath = resolve(process.env.EXTENSION_BUILD_DIR || "../chrome-extension/.output/chrome-mv3");
const browserPath = process.env.BROWSER_PATH;
const errors = [];
let context;
let extensionId;
let profilePath;
let apiServer;
let importRequest;

before(async () => {
  const manifest = JSON.parse(await readFile(join(extensionPath, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("identity"));
  assert.ok(manifest.host_permissions.some((permission) => permission.startsWith("http://127.0.0.1:")));

  apiServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.url === "/api/v1/imports/clockify" && request.method === "POST") {
      importRequest = {
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ imported: 1, skipped: 0, createdPaths: 1 }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolveListen) => apiServer.listen(26580, "127.0.0.1", resolveListen));

  profilePath = await mkdtemp(join(tmpdir(), "knowledge-base-extension-e2e-"));
  context = await chromium.launchPersistentContext(profilePath, {
    ...(browserPath ? { executablePath: browserPath } : {}),
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  context.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
  extensionId = new URL(worker.url()).host;
});

after(async () => {
  await context?.close();
  await new Promise((resolveClose) => apiServer?.close(resolveClose));
  if (profilePath) await rm(profilePath, { recursive: true, force: true });
});

it("loads packaged popup and options pages and persists the local API setting", async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole("heading", { name: "Sign In" }).waitFor();
  await popup.getByRole("button", { name: "Open settings menu" }).click();
  await popup.getByRole("menuitem", { name: "API Settings…" }).click();

  const options = await context.waitForEvent("page");
  await options.waitForURL(`chrome-extension://${extensionId}/options.html`);
  await options.getByRole("heading", { name: "API Settings" }).waitFor();
  await options.getByLabel("API base URL").fill("http://127.0.0.1:26580/api/v1");
  await options.getByRole("button", { name: "Save API URL" }).click();
  await options.getByRole("status").filter({ hasText: /saved/i }).waitFor();
  assert.equal(await options.getByLabel("API base URL").inputValue(), "http://127.0.0.1:26580/api/v1");
});

it("forwards a Clockify report from the content script through the service worker", async () => {
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`);
  await extensionPage.evaluate(() => chrome.storage.local.set({
    apiBase: "http://127.0.0.1:26580/api/v1",
    token: "disposable-e2e-token",
  }));
  const clockify = await context.newPage();
  await clockify.route("https://app.clockify.me/**", async (route) => {
    await route.fulfill({ contentType: "text/html", body: "<!doctype html><html><head></head><body><h1>Clockify report fixture</h1></body></html>" });
  });
  await clockify.goto("https://app.clockify.me/reports/detailed/");
  await clockify.locator("#know-clockify-import-overlay-host").waitFor({ state: "attached" });
  const root = clockify.locator("#know-clockify-import-overlay-host");
  await root.evaluate((element) => {
    const event = new MessageEvent("message", {
      source: window,
      origin: location.origin,
      data: {
        source: "know-clockify",
        type: "detailed-report",
        payload: { timeentries: [{ description: "fixture", id: "fixture-entry" }] },
      },
    });
    window.dispatchEvent(event);
  });
  for (let attempt = 0; attempt < 50 && !importRequest; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  assert.ok(importRequest, "Clockify content script should reach the background worker and local API");
  assert.equal(importRequest.authorization, "Bearer disposable-e2e-token");
  assert.deepEqual(JSON.parse(importRequest.body), { timeentries: [{ description: "fixture", id: "fixture-entry" }] });
  assert.deepEqual(errors, []);
});
