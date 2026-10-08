import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
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

async function api(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
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
  fixtures.log = await api("/logs", "POST", { body: `${text} Log`, occurredAt: new Date().toISOString() });
  fixtures.label = await api("/labels", "POST", { name: `${text} Label`, color: "#2878D5", scopes: ["CALENDAR", "TIME_ENTRY"] });
  fixtures.board = await api("/boards", "POST", { name: `${text} Board` });
  fixtures.status = (await api(`/boards/${fixtures.board.id}/statuses`))[0];
  fixtures.card = await api(`/boards/${fixtures.board.id}/cards`, "POST", { title: `${text} Card`, body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }), priority: "MEDIUM", pathIds: [], labelIds: [] });
  fixtures.day = new Date().toISOString().slice(0, 10);
  await api(`/calendar/days/${fixtures.day}`, "PUT", { note: `${text} Day`, labels: [] });
  fixtures.calendarResultId = (await api(`/search?q=${encodeURIComponent(`${text} Day`)}&types=CALENDAR_DAY`)).groups[0].results[0].id;
  const start = new Date(Date.now() - 3_600_000).toISOString();
  const end = new Date(Date.now() - 1_800_000).toISOString();
  fixtures.session = await api("/time-entries", "POST", { pathId: fixtures.path.id, labelIds: [fixtures.label.id], startedAt: start, endedAt: end, description: `${text} Session` });
}

async function searchFor(query, type, id) {
  if (phone) await page.keyboard.press("Control+k");
  else await page.getByRole("button", { name: "Search", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  await input.fill(query);
  const option = page.locator(`#global-search-${type.toLowerCase()}-${id}`);
  await option.waitFor();
  return { dialog, option };
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

after(async () => { await context?.close(); await browser?.close(); });

describe("search and direct routes against disposable real stack", () => {
  it("opens note, log, path, and session results with Back/Forward state", async () => {
    await activate(`${text} Note`, "NOTE", fixtures.note.id, `/notes/${fixtures.note.id}`, `${text} Note`);
    await activate(`${text} Log`, "LOG", fixtures.log.id, `/logs/${fixtures.log.id}`, `${text} Log`);
    await activate(`${text} Path`, "PATH", fixtures.path.id, `/paths/${fixtures.path.id}`, `${text} Path`);
    await activate(`${text} Label`, "LABEL", fixtures.label.id, `/labels/${fixtures.label.id}`, `${text} Label`);
    await activate(`${text} Session`, "SESSION", fixtures.session.id, `/sessions/${fixtures.session.id}`, `${text} Session`);
  });

  it("opens calendar, board, and active card search destinations", async () => {
    const calendar = await searchFor(`${text} Day`, "CALENDAR_DAY", fixtures.calendarResultId);
    await calendar.option.click();
    await page.waitForFunction((date) => location.pathname === "/calendar" && new URL(location.href).searchParams.get("date") === date, fixtures.day);
    assert.equal(new URL(page.url()).searchParams.get("date"), fixtures.day);

    const board = await searchFor(`${text} Board`, "BOARD", fixtures.board.id);
    await board.option.click();
    await page.waitForFunction((boardId) => location.pathname === "/board" && new URL(location.href).searchParams.get("board") === boardId, fixtures.board.id);

    const card = await searchFor(`${text} Card`, "CARD", fixtures.card.id);
    await card.option.click();
    await page.waitForFunction((cardId) => location.pathname === "/board" && new URL(location.href).searchParams.get("card") === cardId, fixtures.card.id);
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("board"), fixtures.board.id);
    assert.equal(url.searchParams.get("cardBoard"), fixtures.board.id);
    await page.getByRole("textbox", { name: "Title", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), `${text} Card`);
  });

  it("direct-loads the result destinations without stale route state", async () => {
    const destinations = [
      { path: `/notes/${fixtures.note.id}`, kind: "note" },
      { path: `/logs/${fixtures.log.id}`, kind: "log" },
      { path: `/paths/${fixtures.path.id}`, kind: "path" },
      { path: `/labels/${fixtures.label.id}`, kind: "label" },
      { path: `/sessions/${fixtures.session.id}`, kind: "session" },
      { path: `/calendar?date=${fixtures.day}`, kind: "calendar" },
      { path: `/board?board=${fixtures.board.id}`, kind: "board" },
      { path: `/board?board=${fixtures.board.id}&card=${fixtures.card.id}&cardBoard=${fixtures.board.id}`, kind: "card" },
    ];
    for (const destination of destinations) {
      const direct = await context.newPage();
      await direct.goto(`${baseUrl}${destination.path}`);
      await direct.waitForLoadState("networkidle");
      assert.equal(new URL(direct.url()).pathname + new URL(direct.url()).search, destination.path);
      if (destination.kind === "note") {
        await direct.waitForFunction((title) => document.querySelector('[aria-label="Note title"]')?.value === title, `${text} Note`);
      } else if (destination.kind === "card") {
        await direct.waitForFunction((title) => document.querySelector('.card-editor [aria-label="Title"]')?.value === title, `${text} Card`);
      } else if (destination.kind === "board") {
        await direct.waitForFunction((name) => document.querySelector(".board-tab.selected")?.textContent?.trim() === name, `${text} Board`);
      } else if (destination.kind === "calendar") {
        await direct.waitForFunction((date) => new URL(location.href).searchParams.get("date") === date, fixtures.day);
      } else {
        const expected = destination.kind === "log" ? `${text} Log`
          : destination.kind === "path" ? `${text} Path`
            : destination.kind === "label" ? `${text} Label` : `${text} Session`;
        await direct.waitForFunction((value) => document.body.innerText.includes(value), expected);
      }
      await direct.close();
    }
  });
});
