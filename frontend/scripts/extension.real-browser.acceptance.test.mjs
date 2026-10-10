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
const expectedUnavailableApiErrors = [];
let context;
let extensionId;
let profilePath;
let apiServer;
let importRequest;
let timerStartRequest;
let timerStopCount = 0;
let currentTimer = null;
let apiUnavailable = false;
let authExpired = false;
const fixtureRequests = [];

before(async () => {
  const manifest = JSON.parse(await readFile(join(extensionPath, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("identity"));
  assert.ok(manifest.host_permissions.some((permission) => permission.startsWith("http://127.0.0.1:")));

  apiServer = createServer(async (request, response) => {
    fixtureRequests.push(`${request.method} ${request.url}`);
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
    if (apiUnavailable) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "Local fixture unavailable" }));
      return;
    }
    const json = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (authExpired && request.headers.authorization === "Bearer disposable-e2e-token") {
      json(401, { message: "Session expired" });
      return;
    }
    if (request.url === "/api/v1/auth/login" && request.method === "POST") {
      json(200, { token: "disposable-e2e-token" });
      return;
    }
    if (request.url === "/api/v1/paths") { json(200, [{ id: "path-1", name: "Fixture path", status: "ACTIVE" }]); return; }
    if (request.url === "/api/v1/labels?scope=TIME_ENTRY") { json(200, [{ id: "label-1", name: "Fixture label", color: "#2878D5" }]); return; }
    if (request.url === "/api/v1/timers/current") { json(200, currentTimer); return; }
    if (request.url === "/api/v1/timers/draft") { json(200, {}); return; }
    if (request.url === "/api/v1/timers/draft" && request.method === "PUT") { json(200, {}); return; }
    if (request.url === "/api/v1/time-entries?page=0&size=20") { json(200, { content: [], totalElements: 0, totalPages: 0, number: 0 }); return; }
    if (request.url === "/api/v1/timers" && request.method === "POST") {
      timerStartRequest = { authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
      currentTimer = { id: "fixture-timer", ...timerStartRequest.body, startedAt: "2026-10-10T10:00:00Z", running: true };
      json(200, currentTimer);
      return;
    }
    if (request.url === "/api/v1/timers/fixture-timer" && request.method === "PUT") {
      currentTimer = { ...currentTimer, ...JSON.parse(Buffer.concat(chunks).toString("utf8")) };
      json(200, currentTimer);
      return;
    }
    if (request.url === "/api/v1/timers/stop" && request.method === "POST") {
      timerStopCount += 1;
      currentTimer = null;
      json(200, { stopped: true });
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
    if (message.type() === "error") {
      if (apiUnavailable && message.text().includes("503 (Service Unavailable)")) expectedUnavailableApiErrors.push(message.text());
      else if (authExpired && message.text().includes("401 (Unauthorized)")) expectedUnavailableApiErrors.push(message.text());
      else errors.push(message.text());
    }
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

it("signs in, syncs a timer through the packaged popup, and recovers from an unavailable API", async () => {
  const setup = await context.newPage();
  await setup.goto(`chrome-extension://${extensionId}/options.html`);
  await setup.evaluate(() => chrome.storage.local.remove("token"));
  await setup.close();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole("heading", { name: "Sign In" }).waitFor();
  await popup.getByLabel("Email").fill("extension-e2e@example.com");
  await popup.getByLabel("Password").fill("disposable-password");
  await popup.getByRole("button", { name: "Sign In" }).click();
  await popup.getByRole("button", { name: "Start timer" }).waitFor();
  await popup.getByLabel("Description").fill("OTOTEST extension timer");
  await popup.getByRole("button", { name: "Start timer" }).click();
  await popup.getByRole("button", { name: "Stop timer" }).waitFor();
  assert.equal(timerStartRequest.authorization, "Bearer disposable-e2e-token");
  assert.equal(timerStartRequest.body.pathId, null);
  assert.equal(timerStartRequest.body.description, "OTOTEST extension timer");
  assert.equal(timerStartRequest.body.source, "CHROME_EXTENSION");
  await popup.getByRole("button", { name: "Stop timer" }).click();
  await popup.waitForFunction(() => document.querySelector("#toggle")?.getAttribute("aria-label") === "Start timer", null, { timeout: 5000 }).catch(async () => {
    throw new Error(`Timer did not stop: status=${await popup.locator("#status").textContent()}, error=${await popup.locator("#error").textContent()}, requests=${fixtureRequests.slice(-12).join(" | ")}`);
  });
  assert.equal(timerStopCount, 1);

  apiUnavailable = true;
  const reconnect = await context.newPage();
  await reconnect.goto(`chrome-extension://${extensionId}/popup.html`);
  await reconnect.locator("#error").getByText("Local fixture unavailable").waitFor();
  assert.ok(expectedUnavailableApiErrors.length > 0, "the fixture records the expected unavailable API response");

  apiUnavailable = false;
  authExpired = true;
  const expiredSession = await context.newPage();
  await expiredSession.goto(`chrome-extension://${extensionId}/popup.html`);
  await expiredSession.getByRole("heading", { name: "Sign In" }).waitFor();
  const storage = await expiredSession.evaluate(() => chrome.storage.local.get("token"));
  assert.equal(storage.token, undefined, "an expired token is removed before returning to sign-in");
  assert.deepEqual(errors, []);
});
