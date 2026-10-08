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
  const start = new Date(Date.now() - 3_600_000).toISOString();
  const end = new Date(Date.now() - 1_800_000).toISOString();
  fixtures.session = await api("/time-entries", "POST", { pathId: fixtures.path.id, labelIds: [fixtures.label.id], startedAt: start, endedAt: end, description: `${text} Session` });
}

async function searchFor(query) {
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  await input.fill(query);
  const option = page.locator(".global-search-option[role=option]").filter({ hasText: query }).last();
  await option.waitFor();
  return { dialog, option };
}

async function activate(query, expectedPath, expectedVisible) {
  const { option } = await searchFor(query);
  await option.click();
  await page.waitForURL((url) => url.pathname === expectedPath);
  if (expectedPath.startsWith("/notes/")) {
    await page.getByRole("textbox", { name: "Note title" }).waitFor();
    await page.waitForFunction((value) => document.querySelector('[aria-label="Note title"]')?.value === value, expectedVisible);
    assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), expectedVisible);
  } else {
    await page.waitForFunction((value) => document.body.innerText.includes(value), expectedVisible);
  }
  const selected = page.url();
  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/", { waitUntil: "commit" });
  await page.goForward();
  await page.waitForURL((url) => url.href === selected, { waitUntil: "commit" });
  if (expectedPath.startsWith("/notes/")) {
    await page.waitForFunction((value) => document.querySelector('[aria-label="Note title"]')?.value === value, expectedVisible);
    assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), expectedVisible);
  }
  else await page.waitForFunction((value) => document.body.innerText.includes(value), expectedVisible);
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
  await page.getByRole("button", { name: "Search", exact: true }).waitFor();
  // Establish an in-app root history entry before exercising result navigation.
  await page.goto(`${baseUrl}/`);
  await page.getByRole("button", { name: "Search", exact: true }).waitFor();
});

after(async () => { await context?.close(); await browser?.close(); });

describe("search and direct routes against disposable real stack", () => {
  it("opens note, log, path, and session results with Back/Forward state", async () => {
    await activate(`${text} Note`, `/notes/${fixtures.note.id}`, `${text} Note`);
    await activate(`${text} Log`, `/logs/${fixtures.log.id}`, `${text} Log`);
    await activate(`${text} Path`, `/paths/${fixtures.path.id}`, `${text} Path`);
    await activate(`${text} Label`, `/labels/${fixtures.label.id}`, `${text} Label`);
    await activate(`${text} Session`, `/sessions/${fixtures.session.id}`, `${text} Session`);
  });

  it("opens calendar, board, and active card search destinations", async () => {
    const calendar = await searchFor(`${text} Day`);
    await calendar.option.click();
    await page.waitForURL((url) => url.pathname === "/calendar" && url.searchParams.get("date") === fixtures.day);
    assert.equal(new URL(page.url()).searchParams.get("date"), fixtures.day);

    const board = await searchFor(`${text} Board`);
    await board.option.click();
    await page.waitForURL((url) => url.pathname === "/board" && url.searchParams.get("board") === fixtures.board.id);

    const card = await searchFor(`${text} Card`);
    await card.option.click();
    await page.waitForURL((url) => url.pathname === "/board" && url.searchParams.get("card") === fixtures.card.id);
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("board"), fixtures.board.id);
    assert.equal(url.searchParams.get("cardBoard"), fixtures.board.id);
    await page.getByRole("textbox", { name: "Title", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), `${text} Card`);
  });

  it("direct-loads the result destinations without stale route state", async () => {
    const paths = [
      `/notes/${fixtures.note.id}`, `/logs/${fixtures.log.id}`, `/paths/${fixtures.path.id}`,
      `/sessions/${fixtures.session.id}`, `/calendar?date=${fixtures.day}`,
      `/board?board=${fixtures.board.id}`,
      `/board?board=${fixtures.board.id}&card=${fixtures.card.id}&cardBoard=${fixtures.board.id}`,
    ];
    for (const path of paths) {
      const direct = await context.newPage();
      await direct.goto(`${baseUrl}${path}`);
      await direct.waitForLoadState("networkidle");
      assert.equal(new URL(direct.url()).pathname + new URL(direct.url()).search, path);
      await direct.close();
    }
  });
});
