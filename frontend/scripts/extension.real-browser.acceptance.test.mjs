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
const timerUpdateRequests = [];
let timerStopCount = 0;
let currentTimer = null;
let timerDraft = {};
const completedSessions = [];
let apiUnavailable = false;
let authExpired = false;
let noteSaveUnavailable = false;
let extensionNotes = [];
let savedExtensionNote = null;
const fixtureRequests = [];
let importRequestCount = 0;
const importedClockifyEntryIds = new Set();
const clockifyImportSummaries = [];

async function launchExtensionContext() {
  const launched = await chromium.launchPersistentContext(profilePath, {
    ...(browserPath ? { executablePath: browserPath } : {}),
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  launched.setDefaultTimeout(10000);
  launched.on("console", (message) => {
    if (message.type() === "error") {
      if (message.text().includes("503 (Service Unavailable)") || message.text().includes("401 (Unauthorized)")) expectedUnavailableApiErrors.push(message.text());
      else errors.push(message.text());
    }
  });
  launched.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  return launched;
}

before(async () => {
  const manifest = JSON.parse(await readFile(join(extensionPath, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Knowledge Base");
  assert.match(manifest.action.default_title, /Knowledge Base/);
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("identity"));
  assert.ok(manifest.host_permissions.some((permission) => permission.startsWith("http://127.0.0.1:")));
  assert.ok(manifest.host_permissions.includes("https://app.clockify.me/reports/detailed*"));

  apiServer = createServer(async (request, response) => {
    fixtureRequests.push(`${request.method} ${request.url}`);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.url === "/api/v1/imports/clockify" && request.method === "POST") {
      importRequestCount += 1;
      const body = Buffer.concat(chunks).toString("utf8");
      const payload = JSON.parse(body);
      let imported = 0;
      let skipped = 0;
      for (const entry of payload.timeentries) {
        if (importedClockifyEntryIds.has(entry.id)) skipped += 1;
        else {
          importedClockifyEntryIds.add(entry.id);
          imported += 1;
        }
      }
      const summary = { imported, skipped, createdPaths: imported ? 1 : 0 };
      clockifyImportSummaries.push(summary);
      importRequest = {
        authorization: request.headers.authorization,
        body,
      };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(summary));
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
      const credentials = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (credentials.password === "wrong-disposable-password") {
        json(401, { message: "Invalid email or password" });
        return;
      }
      json(200, { token: "disposable-e2e-token" });
      return;
    }
    if (request.url === "/api/v1/paths") { json(200, [{ id: "path-1", name: "Fixture path", status: "ACTIVE" }]); return; }
    if (request.url === "/api/v1/labels?scope=TIME_ENTRY") { json(200, [{ id: "label-1", name: "Fixture label", color: "#2878D5" }]); return; }
    if (request.url === "/api/v1/timers/current") { json(200, currentTimer); return; }
    if (request.url === "/api/v1/timers/draft" && request.method === "GET") { json(200, timerDraft); return; }
    if (request.url === "/api/v1/timers/draft" && request.method === "PUT") {
      timerDraft = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      json(200, timerDraft);
      return;
    }
    if (request.url === "/api/v1/time-entries?page=0&size=20") { json(200, { sessions: completedSessions, content: completedSessions, totalElements: completedSessions.length, totalPages: completedSessions.length ? 1 : 0, number: 0 }); return; }
    if (request.url === "/api/v1/timers" && request.method === "POST") {
      timerStartRequest = { authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
      currentTimer = { id: "fixture-timer", ...timerStartRequest.body, startedAt: "2026-10-10T10:00:00Z", running: true };
      json(200, currentTimer);
      return;
    }
    if (request.url.startsWith("/api/v1/timers/") && request.method === "PUT") {
      const update = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      timerUpdateRequests.push({ id: request.url.split("/").at(-1), body: update });
      currentTimer = { ...currentTimer, ...update };
      json(200, currentTimer);
      return;
    }
    if (request.url === "/api/v1/timers/stop" && request.method === "POST") {
      timerStopCount += 1;
      if (currentTimer) completedSessions.unshift({ ...currentTimer, endedAt: new Date().toISOString(), running: false });
      currentTimer = null;
      json(200, { stopped: true });
      return;
    }
    if (request.url === "/api/v1/notes" && request.method === "GET") { json(200, extensionNotes); return; }
    if (request.url === "/api/v1/notes" && request.method === "POST") {
      savedExtensionNote = { id: "fixture-note", ...JSON.parse(Buffer.concat(chunks).toString("utf8")), version: 1 };
      extensionNotes = [savedExtensionNote, ...extensionNotes];
      json(200, savedExtensionNote);
      return;
    }
    if (request.url === "/api/v1/notes/fixture-note" && request.method === "GET") { json(200, savedExtensionNote); return; }
    if (request.url === "/api/v1/notes/fixture-note" && request.method === "PUT") {
      if (noteSaveUnavailable) {
        json(503, { message: "Local note fixture unavailable" });
        return;
      }
      savedExtensionNote = { ...savedExtensionNote, ...JSON.parse(Buffer.concat(chunks).toString("utf8")), version: (savedExtensionNote?.version || 1) + 1 };
      extensionNotes = [savedExtensionNote];
      json(200, savedExtensionNote);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolveListen) => apiServer.listen(26580, "127.0.0.1", resolveListen));

  profilePath = await mkdtemp(join(tmpdir(), "knowledge-base-extension-e2e-"));
  context = await launchExtensionContext();
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
  assert.equal(await popup.title(), "Timer · Knowledge Base");
  await popup.getByRole("heading", { name: "Sign In" }).waitFor();
  await popup.getByRole("button", { name: "Open settings menu" }).click();
  const optionsOpened = context.waitForEvent("page");
  await popup.getByRole("menuitem", { name: "API Settings…" }).click();

  const options = await optionsOpened;
  await options.waitForURL(`chrome-extension://${extensionId}/options.html`);
  assert.equal(await options.title(), "API Settings · Knowledge Base");
  await options.getByRole("heading", { name: "API Settings" }).waitFor();
  await options.getByLabel("API base URL").fill("ftp://127.0.0.1:26580/api/v1");
  await options.getByRole("button", { name: "Save API URL" }).click();
  await options.getByRole("status").filter({ hasText: "API URL must use HTTP(S) without credentials" }).waitFor();
  assert.equal(await options.evaluate(() => chrome.storage.local.get("apiBase").then((values) => values.apiBase)), undefined);
  await options.getByLabel("API base URL").fill("http://127.0.0.1:26580/api/v1");
  await options.getByRole("button", { name: "Save API URL" }).click();
  await options.getByRole("status").filter({ hasText: /saved/i }).waitFor();
  assert.equal(await options.getByLabel("API base URL").inputValue(), "http://127.0.0.1:26580/api/v1");
  await options.close();
  await popup.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/options.html`);
  await reopened.getByLabel("API base URL").waitFor();
  assert.equal(await reopened.getByLabel("API base URL").inputValue(), "http://127.0.0.1:26580/api/v1");
  await reopened.evaluate(() => chrome.storage.local.set({ token: "disposable-e2e-token" }));
  const popupReopened = await context.newPage();
  await popupReopened.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupReopened.getByRole("button", { name: "Start timer" }).waitFor();
  assert.ok(fixtureRequests.includes("GET /api/v1/timers/current"), "the reopened popup loads timer state from the saved API endpoint");
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
  const clockifyAccessibility = await context.newCDPSession(clockify);
  await clockifyAccessibility.send("Accessibility.enable");
  const clockifyAccessibleText = async () => {
    const { nodes } = await clockifyAccessibility.send("Accessibility.getFullAXTree");
    return nodes.filter((node) => !node.ignored).map((node) => node.name?.value || "").join("\n");
  };
  const waitForClockifyAccessibleText = async (text) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await clockifyAccessibleText()).includes(text)) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    assert.fail(`Clockify accessibility tree did not include: ${text}`);
  };
  await clockify.goto("https://app.clockify.me/reports/summary/");
  await clockify.getByRole("heading", { name: "Clockify report fixture" }).waitFor();
  await clockify.locator("#know-clockify-import-overlay-host").waitFor({ state: "attached" });
  assert.equal(await clockify.locator("#know-clockify-import-overlay-host").isVisible(), false, "unsupported Clockify report routes do not show the import overlay");
  await clockify.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: location.origin,
    data: { source: "know-clockify", type: "detailed-report", payload: { timeentries: [{ id: "unsupported" }] } },
  })));
  await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  assert.equal(importRequestCount, 0, "an unsupported Clockify route never imports report data");
  await clockify.getByRole("heading", { name: "Clockify report fixture" }).waitFor();

  await clockify.goto("https://app.clockify.me/reports/detailed/");
  await clockify.locator("#know-clockify-import-overlay-host").waitFor({ state: "attached" });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole("button", { name: "Open settings menu" }).click();
  const clockifyToggle = popup.getByRole("menuitemcheckbox", { name: "Clockify import" });
  await clockifyToggle.waitFor();
  assert.equal(await clockifyToggle.getAttribute("aria-checked"), "true");
  await clockifyToggle.click();
  await popup.waitForFunction(() => document.querySelector('#clockify-import-toggle')?.getAttribute("aria-checked") === "false");
  await clockify.waitForFunction(() => document.querySelector("#know-clockify-import-overlay-host")?.hidden === true);
  await clockify.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: location.origin,
    data: { source: "know-clockify", type: "detailed-report", payload: { timeentries: [{ id: "disabled" }] } },
  })));
  await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  assert.equal(importRequestCount, 0, "a disabled import setting prevents background requests");
  await clockifyToggle.click();
  await popup.waitForFunction(() => document.querySelector('#clockify-import-toggle')?.getAttribute("aria-checked") === "true");
  await clockify.waitForFunction(() => document.querySelector("#know-clockify-import-overlay-host")?.hidden === false);

  const payload = { timeentries: [{ description: "fixture", id: "fixture-entry" }] };
  const sendReport = () => clockify.evaluate((payload) => window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: location.origin,
    data: { source: "know-clockify", type: "detailed-report", payload },
  })), payload);
  await sendReport();
  for (let attempt = 0; attempt < 50 && !importRequest; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  assert.ok(importRequest, "Clockify content script should reach the background worker and local API");
  assert.equal(importRequestCount, 1);
  assert.equal(importRequest.authorization, "Bearer disposable-e2e-token");
  assert.deepEqual(JSON.parse(importRequest.body), payload);
  await waitForClockifyAccessibleText("Imported 1 sessions from this report.");
  await sendReport();
  await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  assert.equal(importRequestCount, 1, "duplicate Clockify report events are ignored by the extension");
  await clockify.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: location.origin,
    data: { source: "know-clockify", type: "detailed-report", payload: { timeentries: [null] } },
  })));
  await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  assert.equal(importRequestCount, 1, "malformed Clockify report data is rejected before the API call");
  await waitForClockifyAccessibleText("Clockify report contains an invalid entry.");
  assert.equal((await clockifyAccessibleText()).includes("duplicates skipped"), false, "an invalid report does not retain stale import counters");
  await clockify.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: location.origin,
    data: { source: "know-clockify", type: "detailed-report", payload: { timeentries: [], padding: "x".repeat(2_000_001) } },
  })));
  await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  assert.equal(importRequestCount, 1, "oversized Clockify reports are rejected before the API call");
  await waitForClockifyAccessibleText("Clockify report is too large.");
  assert.equal((await clockifyAccessibleText()).includes("duplicates skipped"), false, "an oversized report does not retain stale import counters");
  await clockify.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: location.origin,
    data: { source: "know-clockify", type: "detailed-report", payload: { timeentries: [{ id: "fixture-entry", description: "same entry with edited report content" }] } },
  })));
  for (let attempt = 0; attempt < 50 && importRequestCount < 2; attempt += 1)
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  assert.equal(importRequestCount, 2);
  assert.deepEqual(clockifyImportSummaries.at(-1), { imported: 0, skipped: 1, createdPaths: 0 });
  await waitForClockifyAccessibleText("Imported 0 sessions from this report.");
  const duplicateStatus = await clockifyAccessibleText();
  assert.ok(duplicateStatus.includes("duplicates skipped"));
  assert.ok(duplicateStatus.split("\n").includes("1"), "the overlay exposes the duplicate-skipped count");
  assert.ok(duplicateStatus.split("\n").includes("0"), "the overlay exposes zero imported sessions and new Paths");
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
  await popup.getByLabel("Password").fill("wrong-disposable-password");
  await popup.getByRole("button", { name: "Sign In" }).click();
  await popup.getByRole("alert").filter({ hasText: "Invalid email or password" }).waitFor();
  assert.equal(await popup.getByLabel("Email").inputValue(), "extension-e2e@example.com");
  assert.equal(await popup.getByLabel("Password").inputValue(), "wrong-disposable-password");
  assert.equal(await popup.evaluate(() => chrome.storage.local.get("token").then((values) => values.token)), undefined);

  await popup.getByLabel("Password").fill("disposable-password");
  await popup.getByRole("button", { name: "Sign In" }).click();
  await popup.getByRole("button", { name: "Start timer" }).waitFor();

  currentTimer = {
    id: "web-fixture-timer",
    pathId: "path-1",
    labelIds: ["label-1"],
    description: "Started in the web app",
    startedAt: "2026-10-10T10:00:00Z",
    running: true,
  };
  await popup.getByRole("button", { name: "Stop timer" }).waitFor();
  assert.equal(timerStartRequest, undefined, "an already-running server timer is adopted without creating another timer");
  assert.equal(await popup.getByLabel("Path").inputValue(), "path-1");
  assert.equal(await popup.getByLabel("Description").inputValue(), "Started in the web app");

  const timerDetails = popup.getByRole("button", { name: "Edit timer start time" });
  await timerDetails.click();
  const timerStartDate = popup.getByLabel("Timer start date");
  const timerStartTime = popup.getByRole("textbox", { name: "Timer start time", exact: true });
  assert.equal(await timerStartDate.inputValue(), "2026-10-10");
  const unchangedStartedAt = currentTimer.startedAt;
  await popup.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(currentTimer.startedAt, unchangedStartedAt, "cancelling the start-time editor does not update the server timer");
  await timerDetails.click();
  await timerStartTime.fill("09:30");
  const futureDate = await popup.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  await timerStartDate.fill(futureDate);
  await popup.getByRole("button", { name: "Save", exact: true }).click();
  await popup.getByRole("alert").filter({ hasText: "A timer start cannot be in the future." }).waitFor();
  assert.equal(await timerStartTime.evaluate((element) => element === document.activeElement), true);
  assert.equal(timerUpdateRequests.length, 0, "a future timer start never reaches the API");

  await timerStartDate.fill("2026-10-10");
  await timerStartTime.fill("09:30");
  await popup.getByRole("button", { name: "Save", exact: true }).click();
  await popup.waitForFunction(() => document.querySelector("#timer-start-editor")?.hidden === true);
  assert.equal(timerUpdateRequests.at(-1).id, "web-fixture-timer");
  assert.equal(timerUpdateRequests.at(-1).body.startedAt, "2026-10-10T09:30:00.000Z");

  currentTimer = null;
  await popup.getByRole("button", { name: "Start timer" }).waitFor();
  assert.equal(await popup.evaluate(() => chrome.storage.local.get("activeTimer").then((values) => values.activeTimer)), undefined);

  const pathDraftSaved = popup.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/timers/draft" && response.request().method() === "PUT");
  await popup.getByLabel("Path").selectOption("path-1");
  await pathDraftSaved;
  await popup.getByLabel("New session label name").fill("Fixture");
  const labelDraftSaved = popup.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/timers/draft" && response.request().method() === "PUT");
  await popup.getByRole("option", { name: "Fixture label", exact: true }).click();
  await labelDraftSaved;
  await popup.getByLabel("Description").fill("OTOTEST extension timer");
  const descriptionDraftSaved = popup.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/timers/draft" && response.request().method() === "PUT");
  await descriptionDraftSaved;
  await popup.reload();
  await popup.getByRole("button", { name: "Start timer" }).waitFor();
  assert.equal(await popup.getByLabel("Path").inputValue(), "path-1");
  assert.equal(await popup.getByLabel("Description").inputValue(), "OTOTEST extension timer");
  await popup.getByText("1 available · 1 selected", { exact: true }).waitFor();
  await popup.getByRole("button", { name: "Start timer" }).click();
  await popup.getByRole("button", { name: "Stop timer" }).waitFor();
  assert.equal(timerStartRequest.authorization, "Bearer disposable-e2e-token");
  assert.equal(timerStartRequest.body.pathId, "path-1");
  assert.deepEqual(timerStartRequest.body.labelIds, ["label-1"]);
  assert.equal(timerStartRequest.body.description, "OTOTEST extension timer");
  assert.equal(timerStartRequest.body.source, "CHROME_EXTENSION");

  await popup.getByRole("button", { name: "Notes" }).click();
  await popup.getByText("Your notes will appear here.", { exact: true }).waitFor();
  await popup.getByRole("button", { name: "Create note" }).click();
  await popup.getByRole("textbox", { name: "Note title" }).fill("Extension note round trip");
  await popup.getByRole("textbox", { name: "Note", exact: true }).fill("Saved through the signed-in packaged extension.");
  await popup.getByRole("button", { name: "Back to notes" }).click();
  await popup.getByText("Extension note round trip").waitFor();
  assert.equal(savedExtensionNote.title, "Extension note round trip");
  assert.equal(savedExtensionNote.contentText, "Saved through the signed-in packaged extension.");

  await popup.getByRole("button", { name: "Open note: Extension note round trip", exact: true }).click();
  const noteTitle = popup.getByRole("textbox", { name: "Note title" });
  const noteContent = popup.getByRole("textbox", { name: "Note", exact: true });
  await noteTitle.fill("Extension note edited");
  await noteContent.fill("# Heading\n- [ ] Markdown task remains readable in the web editor.");
  await popup.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  assert.equal(savedExtensionNote.title, "Extension note edited");
  assert.equal(savedExtensionNote.contentText, "# Heading\n- [ ] Markdown task remains readable in the web editor.");

  noteSaveUnavailable = true;
  const rejectedNoteSave = popup.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/notes/fixture-note" && response.request().method() === "PUT");
  await noteContent.fill("Unsaved extension note draft");
  assert.equal((await rejectedNoteSave).status(), 503);
  await popup.getByRole("status").filter({ hasText: "Local note fixture unavailable" }).waitFor();
  assert.equal(savedExtensionNote.contentText, "# Heading\n- [ ] Markdown task remains readable in the web editor.");
  noteSaveUnavailable = false;
  await noteContent.fill("Retry saved extension note draft");
  await popup.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  assert.equal(savedExtensionNote.contentText, "Retry saved extension note draft");

  await context.close();
  context = await launchExtensionContext();
  const restartedWorker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
  assert.equal(new URL(restartedWorker.url()).host, extensionId, "the packaged worker restarts with the same installed extension");
  const afterRestart = await context.newPage();
  await afterRestart.goto(`chrome-extension://${extensionId}/popup.html`);
  await afterRestart.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(await afterRestart.getByRole("textbox", { name: "Note title" }).inputValue(), "Extension note edited");
  assert.equal(await afterRestart.getByRole("textbox", { name: "Note", exact: true }).inputValue(), "Retry saved extension note draft");
  await afterRestart.getByRole("button", { name: "Back to notes" }).click();
  await afterRestart.locator("#timer-tab").click();
  await afterRestart.getByRole("button", { name: "Stop timer" }).waitFor();
  assert.equal(currentTimer.description, "OTOTEST extension timer", "the running timer survives the browser restart in the API fixture");
  assert.equal(await afterRestart.evaluate(() => chrome.storage.local.get("token").then((values) => values.token)), "disposable-e2e-token");
  assert.equal(completedSessions.length, 0, "the running timer has not been fabricated as a completed session");
  await afterRestart.getByRole("button", { name: "Stop timer" }).click();
  await afterRestart.getByRole("button", { name: "Start timer" }).waitFor();
  assert.equal(timerStopCount, 1);
  assert.equal(completedSessions.length, 1);
  assert.equal(completedSessions[0].description, "OTOTEST extension timer");
  assert.equal(completedSessions[0].running, false);
  await afterRestart.reload();
  await afterRestart.getByRole("button", { name: "Start timer" }).waitFor();
  assert.equal(await afterRestart.evaluate(() => chrome.storage.local.get("activeTimer").then((values) => values.activeTimer)), undefined);

  apiUnavailable = true;
  const reconnect = await context.newPage();
  await reconnect.goto(`chrome-extension://${extensionId}/popup.html`);
  await reconnect.locator("#error").getByText("Local fixture unavailable").waitFor();
  assert.ok(expectedUnavailableApiErrors.length > 0, "the fixture records the expected unavailable API response");

  apiUnavailable = false;
  await reconnect.reload();
  await reconnect.getByRole("button", { name: "Start timer" }).waitFor();
  assert.equal(await reconnect.evaluate(() => chrome.storage.local.get("activeTimer").then((values) => values.activeTimer)), undefined);
  assert.equal(timerStopCount, 1, "retrying after API recovery does not recreate the stopped timer");

  authExpired = true;
  const expiredSession = await context.newPage();
  await expiredSession.goto(`chrome-extension://${extensionId}/popup.html`);
  await expiredSession.getByRole("heading", { name: "Sign In" }).waitFor();
  const storage = await expiredSession.evaluate(() => chrome.storage.local.get("token"));
  assert.equal(storage.token, undefined, "an expired token is removed before returning to sign-in");
  authExpired = false;
  await expiredSession.getByLabel("Email").fill("extension-e2e@example.com");
  await expiredSession.getByLabel("Password").fill("disposable-password");
  await expiredSession.getByRole("button", { name: "Sign In" }).click();
  await expiredSession.getByRole("button", { name: "Start timer" }).waitFor();
  assert.equal(await expiredSession.getByLabel("Path").locator('option[value="path-1"]').count(), 1);
  assert.equal(await expiredSession.getByLabel("Path").locator("option").count(), 3, "re-authentication reloads the available Path with its add and separator options");
  await expiredSession.getByRole("button", { name: "Notes", exact: true }).click();
  await expiredSession.getByRole("button", { name: "Open note: Extension note edited", exact: true }).waitFor();
  apiUnavailable = true;
  await expiredSession.getByRole("button", { name: "Open note: Extension note edited", exact: true }).click();
  await expiredSession.getByRole("status").filter({ hasText: "Local fixture unavailable" }).waitFor();
  apiUnavailable = false;
  await expiredSession.getByRole("button", { name: "Open note: Extension note edited", exact: true }).click();
  await expiredSession.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(await expiredSession.getByRole("textbox", { name: "Note title" }).inputValue(), "Extension note edited");
  await expiredSession.getByRole("button", { name: "Back to notes" }).click();
  await expiredSession.getByRole("button", { name: "Open settings menu" }).click();
  await expiredSession.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expiredSession.getByRole("heading", { name: "Sign In" }).waitFor();
  assert.equal(await expiredSession.evaluate(() => chrome.storage.local.get(["token", "activeTimer"]).then((values) => values.token || values.activeTimer)), undefined);
  assert.equal(await expiredSession.locator("#workspace").isHidden(), true, "sign-out hides timer and note content");
  const capturedDiagnostics = `${errors.join("\n")}\n${fixtureRequests.join("\n")}`;
  assert.equal(capturedDiagnostics.includes("disposable-e2e-token"), false, "diagnostics do not expose the disposable access token");
  assert.equal(capturedDiagnostics.includes("disposable-password"), false, "diagnostics do not expose the disposable password");
  assert.ok(expectedUnavailableApiErrors.some((message) => message.includes("401 (Unauthorized)")), "expired-session response is captured as an expected API rejection");
  assert.ok(expectedUnavailableApiErrors.some((message) => message.includes("503 (Service Unavailable)")), "API outage response is captured as an expected API rejection");
  assert.deepEqual(errors, []);
});
