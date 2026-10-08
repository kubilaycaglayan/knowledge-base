import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it as nodeIt } from "node:test";
import { chromium, webkit } from "playwright";

const baseUrl = process.env.SEARCH_E2E_BASE_URL;
const email = process.env.SEARCH_E2E_EMAIL;
const password = process.env.SEARCH_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("SEARCH_E2E_BASE_URL, SEARCH_E2E_EMAIL, and SEARCH_E2E_PASSWORD are required");

const browserType = process.env.BROWSER_ENGINE === "webkit" ? webkit : chromium;
const phone = process.env.BROWSER_PROFILE === "iphone";
let browser;
let context;
let page;
let token;
const fixtures = {};
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const text = `SearchJourney${stamp}`;
const browserErrors = [];
const failedRequests = [];

const it = (name, run) => nodeIt(name, async (...args) => {
  try {
    await run(...args);
  } catch (error) {
    await captureFailureArtifacts(name, error);
    throw error;
  }
});

async function captureFailureArtifacts(name, error) {
  if (!context) return;
  const directory = join(process.cwd(), "harden-tests", "artifacts");
  const fileStem = `${new Date().toISOString().replaceAll(":", "-")}-${process.pid}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  await mkdir(directory, { recursive: true });
  const activePage = context.pages().at(-1) || page;
  await activePage?.screenshot({ path: join(directory, `${fileStem}.png`), fullPage: true }).catch(() => undefined);
  await context.tracing.stop({ path: join(directory, `${fileStem}.zip`) }).catch(() => undefined);
  await writeFile(join(directory, `${fileStem}.json`), JSON.stringify({
    test: name,
    url: activePage?.url() || "unavailable",
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    browserErrors,
    failedRequests,
  }, null, 2));
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true }).catch(() => undefined);
}

async function api(path, method = "GET", body, authToken = token) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${authToken}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = response.status === 204 ? null : await response.json();
  assert.ok(response.ok, `${method} ${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function seed() {
  const authResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(authResponse.status, 200, "disposable test account registration succeeds");
  token = (await authResponse.json()).token;

  fixtures.path = await api("/paths", "POST", { name: `${text} Path`, description: text, color: "#2878D5", textColor: "#FFFFFF" });
  fixtures.note = await api("/notes", "POST", { pathId: fixtures.path.id, title: `${text} Note`, content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }), contentText: text, tags: [] });
  fixtures.specialNote = await api("/notes", "POST", { title: `${text} Café, Signals?`, content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Punctuation and Unicode search fixture" }] }] }), contentText: "Punctuation and Unicode search fixture", tags: [] });
  fixtures.archivedNote = await api("/notes", "POST", { title: `${text} Archived Note`, content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }), contentText: text, tags: [] });
  await api(`/notes/${fixtures.archivedNote.id}`, "DELETE");
  fixtures.log = await api("/logs", "POST", { body: `${text} Log`, occurredAt: new Date().toISOString() });
  fixtures.label = await api("/labels", "POST", { name: `${text} Label`, color: "#2878D5", scopes: ["CALENDAR", "TIME_ENTRY"] });
  fixtures.board = await api("/boards", "POST", { name: `${text} Board` });
  fixtures.status = (await api(`/boards/${fixtures.board.id}/statuses`))[0];
  for (let index = 0; index < 21; index += 1) {
    await api(`/boards/${fixtures.board.id}/cards`, "POST", { title: `${stamp} Padding ${index}`, body: "{}", priority: "MEDIUM", pathIds: [], labelIds: [] });
  }
  fixtures.card = await api(`/boards/${fixtures.board.id}/cards`, "POST", { title: `${text} Card`, body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }), priority: "MEDIUM", pathIds: [], labelIds: [] });
  fixtures.ganttEndCard = await api(`/boards/${fixtures.board.id}/cards`, "POST", { title: `${text} Gantt end day`, body: "{}", priority: "MEDIUM", startDate: "2026-06-14", dueDate: "2026-06-14", pathIds: [], labelIds: [] });
  fixtures.archivedBoard = await api("/boards", "POST", { name: `${text} Archived Board` });
  fixtures.archivedBoardStatus = (await api(`/boards/${fixtures.archivedBoard.id}/statuses`))[0];
  fixtures.archivedCard = await api(`/boards/${fixtures.board.id}/cards`, "POST", { title: `${text} Archived Card`, body: "{}", priority: "MEDIUM", pathIds: [], labelIds: [] });
  await api(`/boards/${fixtures.board.id}/cards/${fixtures.archivedCard.id}/archive`, "POST");
  await api(`/boards/${fixtures.archivedBoard.id}/archive`, "POST");
  fixtures.day = new Date().toISOString().slice(0, 10);
  await api(`/calendar/days/${fixtures.day}`, "PUT", { note: `${text} Day`, labels: [] });
  fixtures.calendarResultId = (await api(`/search?q=${encodeURIComponent(`${text} Day`)}&types=CALENDAR_DAY`)).groups[0].results[0].id;
  const start = new Date(Date.now() - 3_600_000).toISOString();
  const end = new Date(Date.now() - 1_800_000).toISOString();
  fixtures.session = await api("/time-entries", "POST", { pathId: fixtures.path.id, labelIds: [fixtures.label.id], startedAt: start, endedAt: end, description: `${text} Session` });

  fixtures.shortcutMatchPath = await api("/paths", "POST", { name: "Paths", description: "Record result matching the page shortcut", color: "#2878D5", textColor: "#FFFFFF" });

  const foreignAuthResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.replace("@", "+foreign@"), password }),
  });
  assert.equal(foreignAuthResponse.status, 200, "second disposable account registration succeeds");
  const foreignToken = (await foreignAuthResponse.json()).token;
  fixtures.foreignPath = await api("/paths", "POST", { name: `${text} Foreign Path`, description: "Foreign private path detail", color: "#2878D5", textColor: "#FFFFFF" }, foreignToken);
  fixtures.foreignNote = await api("/notes", "POST", { title: `${text} Foreign Note`, content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Foreign private note body" }] }] }), contentText: "Foreign private note body", tags: [] }, foreignToken);
  fixtures.foreignLog = await api("/logs", "POST", { body: "Foreign private log body", occurredAt: new Date().toISOString() }, foreignToken);
  fixtures.foreignLabel = await api("/labels", "POST", { name: `${text} Foreign Label`, color: "#2878D5", scopes: ["CALENDAR", "TIME_ENTRY"] }, foreignToken);
  fixtures.foreignBoard = await api("/boards", "POST", { name: `${text} Foreign Board` }, foreignToken);
  fixtures.foreignCard = await api(`/boards/${fixtures.foreignBoard.id}/cards`, "POST", { title: `${text} Foreign Card`, body: "Foreign private card body", priority: "MEDIUM", pathIds: [], labelIds: [] }, foreignToken);
  const foreignStart = new Date(Date.now() - 3_600_000).toISOString();
  const foreignEnd = new Date(Date.now() - 1_800_000).toISOString();
  fixtures.foreignSession = await api("/time-entries", "POST", { pathId: fixtures.foreignPath.id, labelIds: [], startedAt: foreignStart, endedAt: foreignEnd, description: "Foreign private session" }, foreignToken);
}

async function openSearch() {
  if (phone) await page.keyboard.press("Control+k");
  else await page.getByRole("button", { name: "Search", exact: true }).click();
  return page.getByRole("dialog", { name: "Search everything" });
}

async function searchFor(query, type, id) {
  // Clear the prior result route and any modal before starting a new search.
  await page.goto(`${baseUrl}/`);
  await page.locator("#app").waitFor();
  const dialog = await openSearch();
  const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  await input.fill(query);
  const option = page.locator(`#global-search-${type.toLowerCase()}-${id}`);
  await option.waitFor();
  return { dialog, option };
}

async function freshAuthenticatedPage() {
  const directContext = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
    colorScheme: "light", reducedMotion: "reduce",
  });
  await directContext.addInitScript((value) => localStorage.setItem("know_token", value), token);
  const direct = await directContext.newPage();
  direct.setDefaultTimeout(10000);
  return { direct, close: () => directContext.close() };
}

async function activate(query, type, id, expectedPath, expectedVisible) {
  const { option } = await searchFor(query, type, id);
  const prior = page.url();
  await option.click();
  try {
    await page.waitForFunction((path) => location.pathname === path, expectedPath);
  } catch (cause) {
    throw new Error(`Expected ${expectedPath} after selecting ${query}; observed ${page.url()}`, { cause });
  }
  if (expectedPath.startsWith("/notes/")) {
    await page.getByRole("textbox", { name: "Note title" }).waitFor();
    await page.waitForFunction((value) => document.querySelector('[aria-label="Note title"]')?.value === value, expectedVisible);
    assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), expectedVisible);
  } else {
    await page.waitForFunction((value) => document.body.innerText.includes(value), expectedVisible);
  }
  const selected = page.url();
  await page.goBack();
  assert.equal(page.url(), prior, `Back restores prior URL after opening ${expectedPath}`);
  await page.goForward();
  assert.equal(page.url(), selected, `Forward restores ${expectedPath}`);
  if (expectedPath.startsWith("/notes/")) {
    await page.waitForFunction((value) => document.querySelector('[aria-label="Note title"]')?.value === value, expectedVisible);
    assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), expectedVisible);
  }
  else await page.waitForFunction((value) => document.body.innerText.includes(value), expectedVisible);
  await page.goto(`${baseUrl}/`);
  await page.locator("#app").waitFor();
}

before(async () => {
  await seed();
  browser = await browserType.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
  context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
    colorScheme: "light", reducedMotion: "reduce",
  });
  context.setDefaultTimeout(10000);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  context.on("page", (newPage) => {
    newPage.on("console", (message) => { if (message.type() === "error") browserErrors.push(`console: ${message.text()}`); });
    newPage.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
    newPage.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || "failed"}`));
  });
  await context.addInitScript((value) => localStorage.setItem("know_token", value), token);
  page = await context.newPage();
  await page.goto(`${baseUrl}/`);
  await page.locator("#app").waitFor();
  if (phone) {
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Search everything" }).waitFor();
    await page.keyboard.press("Escape");
  } else await page.getByRole("button", { name: "Search", exact: true }).waitFor();
  // Establish an in-app root history entry before exercising result navigation.
  await page.goto(`${baseUrl}/`);
  await page.locator("#app").waitFor();
});

after(async () => {
  await context?.tracing.stop().catch(() => undefined);
  await context?.close();
  await browser?.close();
});

describe("search and direct routes against disposable real stack", () => {
  it("opens note, log, path, and session results with Back/Forward state", async () => {
    await activate(`${text} Note`, "NOTE", fixtures.note.id, `/notes/${fixtures.note.id}`, `${text} Note`);
    await activate(`${text} Log`, "LOG", fixtures.log.id, `/logs/${fixtures.log.id}`, `${text} Log`);
    await activate(`${text} Path`, "PATH", fixtures.path.id, `/paths/${fixtures.path.id}`, `${text} Path`);
    await activate(`${text} Label`, "LABEL", fixtures.label.id, `/labels/${fixtures.label.id}`, `${text} Label`);
    await activate(`${text} Session`, "SESSION", fixtures.session.id, `/sessions/${fixtures.session.id}`, `${text} Session`);
  });

  it("opens every page shortcut by click and aliases by Enter without record search", async () => {
    const shortcuts = [
      ["Sessions", "sessions", "/"], ["Board", "board", "/board"],
      ["Board archive", "board-archive", "/board/archive"], ["Logs", "logs", "/logs"],
      ["Notes", "notes", "/notes"], ["Calendar", "calendar", "/calendar"],
      ["Reports", "reports", "/reports"], ["Timeline", "timeline", "/timeline"],
      ["Paths", "paths", "/paths"], ["Labels", "labels", "/labels"],
      ["Imports", "imports", "/imports"], ["Development", "development", "/development"],
      ["Settings", "settings", "/settings"],
    ];
    for (const [label, id, path] of shortcuts) {
      const priorPath = path === "/settings" ? "/notes" : "/settings";
      await page.goto(`${baseUrl}${priorPath}`);
      await page.locator("#app").waitFor();
      let recordSearchRequests = 0;
      const onRequest = (request) => { if (new URL(request.url()).pathname === "/api/v1/search") recordSearchRequests += 1; };
      page.on("request", onRequest);
      const dialog = await openSearch();
      const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
      await input.fill(label);
      const option = page.locator(`#global-search-page-${id}`);
      await option.waitFor();
      assert.equal(await option.getAttribute("aria-label"), `${label}, page`);
      assert.ok((await option.innerText()).includes(label), `${label} shortcut visibly names its destination`);
      await option.click();
      await page.waitForFunction((destination) => location.pathname === destination, path);
      assert.equal(recordSearchRequests, 0, `${label} click jumps without a record-search request`);
      await page.goBack();
      assert.equal(new URL(page.url()).pathname, priorPath, `${label} Back restores the prior page`);
      await page.goForward();
      assert.equal(new URL(page.url()).pathname, path, `${label} Forward restores the shortcut destination`);
      page.off("request", onRequest);

      await page.goto(`${baseUrl}${priorPath}`);
      const keyboardDialog = await openSearch();
      const keyboardInput = keyboardDialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
      await keyboardInput.fill(label);
      const keyboardOption = page.locator(`#global-search-page-${id}`);
      await keyboardOption.waitFor();
      for (let movement = 0; movement < 13 && await keyboardOption.getAttribute("aria-selected") !== "true"; movement += 1)
        await keyboardInput.press("ArrowDown");
      assert.equal(await keyboardOption.getAttribute("aria-selected"), "true", `${label} is keyboard selectable`);
      await keyboardInput.press("Enter");
      await page.waitForFunction((destination) => location.pathname === destination, path);
      await page.goBack();
      assert.equal(new URL(page.url()).pathname, priorPath, `${label} keyboard Back restores the prior page`);
      await page.goForward();
      assert.equal(new URL(page.url()).pathname, path, `${label} keyboard Forward restores the shortcut destination`);
    }

    for (const [alias, path] of [["home", "/"], ["timer", "/"], ["kanban", "/board"], ["preferences", "/settings"]]) {
      await page.goto(`${baseUrl}/notes`);
      await page.locator("#app").waitFor();
      let recordSearchRequests = 0;
      const onRequest = (request) => { if (new URL(request.url()).pathname === "/api/v1/search") recordSearchRequests += 1; };
      page.on("request", onRequest);
      const dialog = await openSearch();
      const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
      await input.fill(alias);
      await input.press("Enter");
      await page.waitForFunction((destination) => location.pathname === destination, path);
      assert.equal(recordSearchRequests, 0, `${alias} Enter jump does not search records`);
      page.off("request", onRequest);
    }
  });

  it("keeps a page shortcut distinct from a matching record result", async () => {
    await page.goto(`${baseUrl}/`);
    await page.locator("#app").waitFor();
    const dialog = await openSearch();
    await dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" }).fill("Paths");
    const pageOption = page.locator("#global-search-page-paths");
    const recordOption = page.locator(`#global-search-path-${fixtures.shortcutMatchPath.id}`);
    await pageOption.waitFor();
    await recordOption.waitFor();
    assert.equal(await pageOption.getAttribute("aria-label"), "Paths, page");
    assert.match(await recordOption.getAttribute("aria-label"), /^Paths,/);
    await dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" }).press("ArrowDown");
    assert.equal(await recordOption.getAttribute("aria-selected"), "true", "ArrowDown selects the record separately from the page shortcut");
    await dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" }).press("Enter");
    await page.waitForFunction((id) => location.pathname === `/paths/${id}`, fixtures.shortcutMatchPath.id);
  });

  it("trims and encodes a punctuation and Unicode query", async () => {
    await page.goto(`${baseUrl}/`);
    await page.locator("#app").waitFor();
    let searchUrl;
    const onRequest = (request) => {
      if (new URL(request.url()).pathname === "/api/v1/search") searchUrl = request.url();
    };
    page.on("request", onRequest);
    const dialog = await openSearch();
    const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
    await input.fill("  Café, Signals?  ");
    const result = page.locator(`#global-search-note-${fixtures.specialNote.id}`);
    await result.waitFor();
    assert.equal(new URL(searchUrl).searchParams.get("q"), "Café, Signals?");
    assert.match(searchUrl, /q=Caf%C3%A9%2C\+Signals%3F/);
    assert.ok((await result.getAttribute("aria-label")).includes(`${text} Café, Signals?`));
    page.off("request", onRequest);
  });

  it("keeps the search dialog and card editor inside the active viewport", async () => {
    await page.goto(`${baseUrl}/`);
    await page.locator("#app").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "the home screen has no horizontal overflow");
    const dialog = await openSearch();
    const dialogBox = await dialog.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(dialogBox && viewport && dialogBox.x >= 0 && dialogBox.y >= 0 && dialogBox.x + dialogBox.width <= viewport.width && dialogBox.y + dialogBox.height <= viewport.height, "search dialog fits inside the viewport");
    await page.keyboard.press("Escape");
    await page.goto(`${baseUrl}/board?board=${fixtures.board.id}&card=${fixtures.card.id}&cardBoard=${fixtures.board.id}`);
    const editor = page.locator(".card-editor");
    await editor.waitFor();
    const editorBox = await editor.boundingBox();
    assert.ok(editorBox && viewport && editorBox.x >= 0 && editorBox.y >= 0 && editorBox.x + editorBox.width <= viewport.width && editorBox.y + editorBox.height <= viewport.height, "card editor fits inside the viewport");
    const closeBox = await page.getByRole("button", { name: "Close card" }).boundingBox();
    assert.ok(closeBox && closeBox.x >= 0 && closeBox.y >= 0 && closeBox.x + closeBox.width <= viewport.width && closeBox.y + closeBox.height <= viewport.height, "card close control remains reachable");
  });

  it("restores notes, labels, board search, line history, Gantt range, and archive URLs", async () => {
    const noteSearch = await context.newPage();
    const noteQuery = encodeURIComponent(`${text} Note`);
    await noteSearch.goto(`${baseUrl}/notes?q=${noteQuery}`);
    assert.equal(await noteSearch.getByRole("textbox", { name: "Search notes" }).inputValue(), `${text} Note`);
    await noteSearch.getByText(`${text} Note`, { exact: false }).first().waitFor();
    await noteSearch.reload();
    assert.equal(await noteSearch.getByRole("textbox", { name: "Search notes" }).inputValue(), `${text} Note`);
    await noteSearch.close();

    const archivedNotes = await context.newPage();
    await archivedNotes.goto(`${baseUrl}/notes?archived=1&q=${encodeURIComponent(`${text} Archived Note`)}`);
    await archivedNotes.getByRole("textbox", { name: "Search notes" }).waitFor();
    await archivedNotes.getByText(`${text} Archived Note`, { exact: false }).first().waitFor();
    await archivedNotes.reload();
    assert.equal(new URL(archivedNotes.url()).searchParams.get("archived"), "1");
    assert.equal(new URL(archivedNotes.url()).searchParams.get("q"), `${text} Archived Note`);
    await archivedNotes.getByText(`${text} Archived Note`, { exact: false }).first().waitFor();
    await archivedNotes.getByRole("textbox", { name: "Search notes" }).fill("");
    await archivedNotes.waitForFunction(() => new URL(location.href).searchParams.get("archived") === "1" && !new URL(location.href).searchParams.has("q"));
    await archivedNotes.close();

    const noteLines = await context.newPage();
    await noteLines.goto(`${baseUrl}/notes/${fixtures.note.id}?lines=1`);
    const noteHistory = noteLines.getByRole("button", { name: "Line history" });
    await noteHistory.waitFor();
    assert.equal(await noteHistory.getAttribute("aria-pressed"), "true");
    await noteLines.reload();
    assert.equal(await noteLines.getByRole("button", { name: "Line history" }).getAttribute("aria-pressed"), "true");
    await noteLines.close();

    const labelQuery = `${text} Label`;
    const labels = await context.newPage();
    await labels.goto(`${baseUrl}/labels?q=${encodeURIComponent(labelQuery)}`);
    assert.equal(await labels.getByRole("searchbox", { name: "Search labels" }).inputValue(), labelQuery);
    await labels.getByText(labelQuery, { exact: true }).first().waitFor();
    await labels.reload();
    assert.equal(await labels.getByRole("searchbox", { name: "Search labels" }).inputValue(), labelQuery);
    await labels.goto(`${baseUrl}/labels/${fixtures.label.id}?q=${encodeURIComponent(labelQuery)}`);
    await labels.getByRole("heading", { name: labelQuery }).waitFor();
    await labels.getByRole("button", { name: "Close history" }).click();
    await labels.waitForFunction((query) => location.pathname === "/labels" && new URL(location.href).searchParams.get("q") === query, labelQuery);
    await labels.close();

    const boardSearch = await context.newPage();
    const boardQuery = "Padding";
    await boardSearch.goto(`${baseUrl}/board?board=${fixtures.board.id}&q=${boardQuery}`);
    assert.equal(await boardSearch.locator("#board-search-input").inputValue(), boardQuery);
    await boardSearch.waitForFunction((name) => document.querySelector(".board-tab.selected")?.textContent?.trim() === name, `${text} Board`);
    await boardSearch.reload();
    assert.equal(await boardSearch.locator("#board-search-input").inputValue(), boardQuery);
    await boardSearch.waitForFunction((name) => document.querySelector(".board-tab.selected")?.textContent?.trim() === name, `${text} Board`);
    await boardSearch.close();

    const boardLines = await context.newPage();
    await boardLines.goto(`${baseUrl}/board?board=${fixtures.board.id}&card=${fixtures.card.id}&cardBoard=${fixtures.board.id}&lines=1`);
    await boardLines.getByRole("textbox", { name: "Title", exact: true }).waitFor();
    const cardHistory = boardLines.getByRole("button", { name: "Line history" });
    await cardHistory.waitFor();
    assert.equal(await cardHistory.getAttribute("aria-pressed"), "true");
    await boardLines.reload();
    assert.equal(await boardLines.getByRole("button", { name: "Line history" }).getAttribute("aria-pressed"), "true");
    await boardLines.close();

    const from = "2026-06-01";
    const to = "2026-06-14";
    const gantt = await context.newPage();
    const ganttRequest = gantt.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === `/api/v1/boards/${fixtures.board.id}/gantt` && request.method() === "GET";
    });
    await gantt.goto(`${baseUrl}/board?board=${fixtures.board.id}&view=gantt&from=${from}&to=${to}`);
    const request = await ganttRequest;
    const requestUrl = new URL(request.url());
    assert.equal(requestUrl.searchParams.get("from"), from);
    assert.equal(requestUrl.searchParams.get("to"), to);
    assert.equal(await gantt.getByRole("textbox", { name: "Timeline start date" }).inputValue(), from);
    assert.equal(await gantt.getByRole("textbox", { name: "Timeline end date" }).inputValue(), to);
    await gantt.getByText(`${text} Gantt end day`, { exact: false }).first().waitFor();
    const ganttReloadRequest = gantt.waitForRequest((candidate) => {
      const url = new URL(candidate.url());
      return url.pathname === `/api/v1/boards/${fixtures.board.id}/gantt` && candidate.method() === "GET";
    });
    await gantt.reload();
    const reloadedGanttRequest = new URL((await ganttReloadRequest).url());
    assert.equal(reloadedGanttRequest.searchParams.get("from"), from);
    assert.equal(reloadedGanttRequest.searchParams.get("to"), to);
    assert.equal(await gantt.getByRole("textbox", { name: "Timeline start date" }).inputValue(), from);
    assert.equal(await gantt.getByRole("textbox", { name: "Timeline end date" }).inputValue(), to);
    await gantt.getByText(`${text} Gantt end day`, { exact: false }).first().waitFor();
    await gantt.close();

    const archiveActiveBoard = await context.newPage();
    await archiveActiveBoard.goto(`${baseUrl}/board/archive?board=${fixtures.board.id}`);
    await archiveActiveBoard.getByText(`${text} Archived Card`, { exact: false }).waitFor();
    await archiveActiveBoard.reload();
    await archiveActiveBoard.getByText(`${text} Archived Card`, { exact: false }).waitFor();
    await archiveActiveBoard.close();

    const unknownArchiveBoard = await context.newPage();
    const unknownId = randomUUID();
    await unknownArchiveBoard.goto(`${baseUrl}/board/archive?board=${unknownId}`);
    await unknownArchiveBoard.waitForFunction((id) => {
      const url = new URL(location.href);
      return url.pathname === "/board/archive" && url.searchParams.get("board") !== id && Boolean(url.searchParams.get("board"));
    }, unknownId);
    const canonicalBoard = new URL(unknownArchiveBoard.url()).searchParams.get("board");
    await unknownArchiveBoard.reload();
    assert.equal(new URL(unknownArchiveBoard.url()).searchParams.get("board"), canonicalBoard);
    await unknownArchiveBoard.close();
  });

  it("canonicalizes an impossible calendar date to the fallback selection", async () => {
    for (const invalidDate of ["2026-02-30", "not-a-date"]) {
      await page.goto(`${baseUrl}/calendar?date=${encodeURIComponent(invalidDate)}&view=month`);
      await page.waitForFunction(() => !new URL(location.href).searchParams.has("date"));
      assert.equal(new URL(page.url()).searchParams.get("view"), "month", "canonicalization preserves unrelated query state");
      assert.equal(await page.locator('.calendar-day[aria-pressed="true"]').count(), 1);
    }
  });

  it("opens calendar, board, and active card search destinations", async () => {
    const calendar = await searchFor(`${text} Day`, "CALENDAR_DAY", fixtures.calendarResultId);
    const beforeCalendar = page.url();
    await calendar.option.click();
    await page.waitForFunction((date) => location.pathname === "/calendar" && new URL(location.href).searchParams.get("date") === date, fixtures.day);
    assert.equal(new URL(page.url()).searchParams.get("date"), fixtures.day);
    const calendarUrl = page.url();
    await page.goBack();
    assert.equal(page.url(), beforeCalendar);
    await page.goForward();
    assert.equal(page.url(), calendarUrl);
    await page.waitForFunction(() => document.querySelector('.calendar-day[aria-pressed="true"]') !== null);

    const board = await searchFor(`${text} Board`, "BOARD", fixtures.board.id);
    const beforeBoard = page.url();
    await board.option.click();
    await page.waitForFunction((boardId) => location.pathname === "/board" && new URL(location.href).searchParams.get("board") === boardId, fixtures.board.id);
    await page.waitForFunction((name) => document.querySelector(".board-tab.selected")?.textContent?.trim() === name, `${text} Board`);
    const boardUrl = page.url();
    await page.goBack();
    assert.equal(page.url(), beforeBoard);
    await page.goForward();
    assert.equal(page.url(), boardUrl);
    await page.waitForFunction((name) => document.querySelector(".board-tab.selected")?.textContent?.trim() === name, `${text} Board`);

    const card = await searchFor(`${text} Card`, "CARD", fixtures.card.id);
    const beforeCard = page.url();
    await card.option.click();
    await page.waitForFunction((cardId) => location.pathname === "/board" && new URL(location.href).searchParams.get("card") === cardId, fixtures.card.id);
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("board"), fixtures.board.id);
    assert.equal(url.searchParams.get("cardBoard"), fixtures.board.id);
    await page.getByRole("textbox", { name: "Title", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), `${text} Card`);
    const cardUrl = page.url();
    await page.goBack();
    assert.equal(page.url(), beforeCard);
    await page.goForward();
    assert.equal(page.url(), cardUrl);
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), `${text} Card`);
  });

  it("targets archived results and fetches a card beyond the first page", async () => {
    const archivedNote = await searchFor(`${text} Archived Note`, "NOTE", fixtures.archivedNote.id);
    await archivedNote.option.click();
    await page.waitForFunction(() => location.pathname === "/notes" && new URL(location.href).searchParams.get("archived") === "1");
    assert.equal(new URL(page.url()).searchParams.get("q"), `${text} Archived Note`);
    await page.getByText(`${text} Archived Note`, { exact: false }).waitFor();

    const archivedBoard = await searchFor(`${text} Archived Board`, "BOARD", fixtures.archivedBoard.id);
    await archivedBoard.option.click();
    await page.waitForFunction((id) => location.pathname === "/board/archive" && new URL(location.href).searchParams.get("archivedBoard") === id, fixtures.archivedBoard.id);
    await page.getByText(`${text} Archived Board`, { exact: false }).first().waitFor();

    const archivedCard = await searchFor(`${text} Archived Card`, "CARD", fixtures.archivedCard.id);
    await archivedCard.option.click();
    await page.waitForFunction((id) => location.pathname === "/board/archive" && new URL(location.href).searchParams.get("card") === id, fixtures.archivedCard.id);
    assert.equal(new URL(page.url()).searchParams.get("board"), fixtures.board.id);
    assert.equal(await page.locator(".card-editor").count(), 0, "archived cards do not open the active-card editor");
    await page.getByText(`${text} Archived Card`, { exact: false }).waitFor();

    const activeCard = await searchFor(`${text} Card`, "CARD", fixtures.card.id);
    await activeCard.option.click();
    await page.waitForFunction((id) => location.pathname === "/board" && new URL(location.href).searchParams.get("card") === id, fixtures.card.id);
    await page.getByRole("textbox", { name: "Title", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), `${text} Card`);
  });

  it("direct-loads the result destinations without stale route state", async () => {
    const destinations = [
      { path: `/notes/${fixtures.note.id}`, kind: "note" },
      { path: `/notes?archived=1&q=${encodeURIComponent(`${text} Archived Note`)}`, kind: "archived-note" },
      { path: `/logs/${fixtures.log.id}`, kind: "log" },
      { path: `/paths/${fixtures.path.id}`, kind: "path" },
      { path: `/labels/${fixtures.label.id}`, kind: "label" },
      { path: `/sessions/${fixtures.session.id}`, kind: "session" },
      { path: `/calendar?date=${fixtures.day}`, kind: "calendar" },
      { path: `/board?board=${fixtures.board.id}`, kind: "board" },
      { path: `/board?board=${fixtures.board.id}&card=${fixtures.card.id}&cardBoard=${fixtures.board.id}`, kind: "card" },
      { path: `/board/archive?archivedBoard=${fixtures.archivedBoard.id}`, kind: "archived-board" },
      { path: `/board/archive?board=${fixtures.board.id}&card=${fixtures.archivedCard.id}`, kind: "archived-card" },
    ];
    for (const destination of destinations) {
      const { direct, close } = await freshAuthenticatedPage();
      for (let load = 0; load < 2; load += 1) {
        if (load === 0) await direct.goto(`${baseUrl}${destination.path}`);
        else await direct.reload();
        await direct.waitForLoadState("networkidle");
        assert.equal(new URL(direct.url()).pathname + new URL(direct.url()).search, destination.path);
        if (destination.kind === "note") {
          await direct.waitForFunction((title) => document.querySelector('[aria-label="Note title"]')?.value === title, `${text} Note`);
        } else if (destination.kind === "archived-note") {
          assert.equal(new URL(direct.url()).searchParams.get("archived"), "1");
          assert.equal(new URL(direct.url()).searchParams.get("q"), `${text} Archived Note`);
          await direct.getByText(`${text} Archived Note`, { exact: false }).waitFor();
        } else if (destination.kind === "card") {
          await direct.waitForFunction((title) => document.querySelector('.card-editor [aria-label="Title"]')?.value === title, `${text} Card`);
        } else if (destination.kind === "board") {
          await direct.waitForFunction((name) => document.querySelector(".board-tab.selected")?.textContent?.trim() === name, `${text} Board`);
        } else if (destination.kind === "calendar") {
          await direct.waitForFunction((date) => new URL(location.href).searchParams.get("date") === date, fixtures.day);
        } else if (destination.kind === "archived-board") {
          await direct.waitForFunction((id) => new URL(location.href).searchParams.get("archivedBoard") === id, fixtures.archivedBoard.id);
          await direct.getByText(`${text} Archived Board`, { exact: false }).first().waitFor();
        } else if (destination.kind === "archived-card") {
          const url = new URL(direct.url());
          assert.equal(url.searchParams.get("board"), fixtures.board.id);
          assert.equal(url.searchParams.get("card"), fixtures.archivedCard.id);
          assert.equal(await direct.locator(".card-editor").count(), 0);
          await direct.getByText(`${text} Archived Card`, { exact: false }).waitFor();
        } else {
          const expected = destination.kind === "log" ? `${text} Log`
            : destination.kind === "path" ? `${text} Path`
              : destination.kind === "label" ? `${text} Label` : `${text} Session`;
          await direct.waitForFunction((value) => document.body.innerText.includes(value), expected);
        }
      }
      await close();
    }
  });

  it("does not expose missing or foreign-user detail records", async () => {
    const cases = [
      {
        family: "note", route: (id) => `/notes/${id}`,
        missing: randomUUID(), foreign: fixtures.foreignNote.id,
        privateText: "Foreign private note body",
        assertRecovery: async (direct) => await direct.getByRole("alert").getByText("Unable to open this note.").waitFor(),
      },
      {
        family: "log", route: (id) => `/logs/${id}`,
        missing: randomUUID(), foreign: fixtures.foreignLog.id,
        privateText: "Foreign private log body",
        assertRecovery: async (direct) => {
          await direct.getByRole("heading", { name: "Log not found" }).waitFor();
          await direct.getByRole("button", { name: "Back to logs" }).waitFor();
        },
      },
      {
        family: "path", route: (id) => `/paths/${id}`,
        missing: randomUUID(), foreign: fixtures.foreignPath.id,
        privateText: "Foreign private path detail",
        assertRecovery: async (direct) => await direct.getByRole("alert").getByText(/That path doesn’t exist any more/).waitFor(),
      },
      {
        family: "label", route: (id) => `/labels/${id}`,
        missing: randomUUID(), foreign: fixtures.foreignLabel.id,
        privateText: `${text} Foreign Label`,
        assertRecovery: async (direct) => {
          await direct.getByRole("alert").getByText("Could not load this label’s history.").waitFor();
          await direct.getByRole("button", { name: "Close history" }).waitFor();
        },
      },
      {
        family: "session", route: (id) => `/sessions/${id}`,
        missing: randomUUID(), foreign: fixtures.foreignSession.id,
        privateText: "Foreign private session",
        assertRecovery: async (direct) => {
          await direct.getByRole("heading", { name: "Session not found" }).waitFor();
          await direct.getByRole("button", { name: "Back to sessions" }).waitFor();
        },
      },
    ];
    for (const testCase of cases) {
      for (const id of [testCase.missing, testCase.foreign]) {
        const direct = await context.newPage();
        await direct.goto(`${baseUrl}${testCase.route(id)}`);
        await testCase.assertRecovery(direct);
        assert.ok(!(await direct.locator("body").innerText()).includes(testCase.privateText), `${testCase.family} does not show foreign data`);
        await direct.close();
      }
    }

    const missingCard = await context.newPage();
    await missingCard.goto(`${baseUrl}/board?board=${fixtures.board.id}&card=${randomUUID()}&cardBoard=${fixtures.board.id}`);
    await missingCard.waitForFunction((name) => document.querySelector(".board-tab.selected")?.textContent?.trim() === name, `${text} Board`);
    assert.equal(await missingCard.locator(".card-editor").count(), 0, "missing cards remain unopened");
    assert.ok(!(await missingCard.locator("body").innerText()).includes("Foreign private"));
    await missingCard.close();

    const foreignBoard = await context.newPage();
    await foreignBoard.goto(`${baseUrl}/board?board=${fixtures.foreignBoard.id}&card=${fixtures.foreignCard.id}&cardBoard=${fixtures.foreignBoard.id}`);
    await foreignBoard.waitForFunction((id) => new URL(location.href).searchParams.get("board") !== id, fixtures.foreignBoard.id);
    assert.equal(await foreignBoard.locator(".card-editor").count(), 0, "foreign cards do not open an editor");
    const foreignBoardText = await foreignBoard.locator("body").innerText();
    assert.ok(!foreignBoardText.includes(`${text} Foreign Board`));
    assert.ok(!foreignBoardText.includes(`${text} Foreign Card`));
    assert.ok(!foreignBoardText.includes("Foreign private card body"));
    await foreignBoard.close();
  });

  it("shows an empty search state and retries a request error against the real API", async () => {
    await page.goto(`${baseUrl}/`);
    await page.locator("#app").waitFor();
    let intercepted = 0;
    await page.route("**/api/v1/search?**", async (route) => {
      intercepted += 1;
      if (intercepted === 1) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Injected temporary failure" }) });
      else await route.continue();
    });
    const dialog = await openSearch();
    const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
    await input.fill(`${text} Note`);
    await dialog.getByRole("alert").getByText("Search isn’t available right now. Check your connection and try again.").waitFor();
    await dialog.getByRole("button", { name: "Try again" }).click();
    await page.locator(`#global-search-note-${fixtures.note.id}`).waitFor();
    assert.ok(intercepted >= 2, "retry performs another request to the real search endpoint");
    await page.unroute("**/api/v1/search?**");

    await input.fill("NoSuchSearchResult987654321");
    await dialog.locator(".global-search-empty").getByText(/No results for/).waitFor();
  });
});
