import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

// Per-line edit times ("Line history") against the real API, PostgreSQL,
// proxy, and browser: typing, autosave, conflicts, keyboard use, dark theme,
// phone width, and an Axe audit. Run through scripts/run-line-history-e2e.sh.
const baseUrl = process.env.LINE_HISTORY_E2E_BASE_URL;
const email = process.env.LINE_HISTORY_E2E_EMAIL;
const password = process.env.LINE_HISTORY_E2E_PASSWORD;
const screenshots = process.env.LINE_HISTORY_E2E_SCREENSHOTS;
if (!baseUrl || !email || !password) throw new Error("LINE_HISTORY_E2E_BASE_URL, LINE_HISTORY_E2E_EMAIL, and LINE_HISTORY_E2E_PASSWORD are required");
if (screenshots) mkdirSync(screenshots, { recursive: true });

let browser;
let page;
const pageErrors = [];
const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...texts) => JSON.stringify({ type: "doc", content: texts.map(paragraph) });
const iso = (value) => new Date(value).toISOString();

async function signIn(target) {
  await target.goto(`${baseUrl}/`);
  await target.getByRole("textbox", { name: "Email" }).fill(email);
  await target.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await target.getByRole("button", { name: "Sign in", exact: true }).click();
  await target.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
}

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", reducedMotion: "reduce", ...options });
  context.setDefaultTimeout(10000);
  const created = await context.newPage();
  created.on("pageerror", (error) => pageErrors.push(error.message));
  return created;
}

// API calls from the signed-in page, standing in for "another window".
async function api(target, method, path, body) {
  return target.evaluate(async ({ method, path, body }) => {
    const response = await fetch(`/api/v1${path}`, { method, headers: { authorization: `Bearer ${localStorage.getItem("know_token")}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`);
    return response.status === 204 ? null : response.json();
  }, { method, path, body });
}

// Browsers report a click's caret through an async selectionchange, which
// ProseMirror reads before the next key; a person never types inside that
// frame, but Playwright can, so let the caret settle before typing.
async function placeCaret(target, locator) {
  await locator.click();
  await target.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await target.keyboard.press("End");
}

const stamps = (target, scope) => target.locator(`${scope} .line-history-stamp`).evaluateAll((elements) => elements.map((element) => element.querySelector("time")?.getAttribute("datetime") ?? element.textContent));
const saved = (target) => target.locator(".save-state").filter({ hasText: /^Saved$/ }).waitFor();

// Each stamp ends left of its line's text, and the page never scrolls sideways.
async function assertGutterLayout(target, scope) {
  const overlaps = await target.locator(`${scope} .ProseMirror`).evaluate((root) => {
    const problems = [];
    for (const stamp of root.querySelectorAll(".line-history-stamp")) {
      const block = stamp.parentElement;
      const range = document.createRange();
      range.selectNodeContents(block);
      const text = [...range.getClientRects()].filter((rect) => rect.width > 0 && !document.elementFromPoint(rect.left + 1, rect.top + 1)?.closest(".line-history-stamp"));
      const box = stamp.getBoundingClientRect();
      if (box.width && text.some((rect) => rect.left < box.right - 0.5 && rect.top < box.bottom && rect.bottom > box.top)) problems.push(block.textContent);
    }
    return problems;
  });
  assert.deepEqual(overlaps, [], "gutter stamps overlap line text");
  // Stamps stay one line tall, so neighbouring lines' stamps never collide.
  const stacked = await target.locator(`${scope} .line-history-stamp`).evaluateAll((elements) => {
    const boxes = elements.map((element) => element.getBoundingClientRect()).filter((box) => box.height);
    return boxes.filter((box, index) => index > 0 && box.top < boxes[index - 1].bottom - 0.5).length;
  });
  assert.equal(stacked, 0, "gutter stamps overlap each other");
  const wrapping = await target.locator(`${scope} .line-history-stamp`).evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).whiteSpace !== "nowrap").length);
  assert.equal(wrapping, 0, "gutter stamps may wrap");
  assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, "page scrolls sideways");
}

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
  page = await newPage();
  await page.goto(`${baseUrl}/`);
  await page.getByRole("button", { name: /New here\? Create an account/ }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
});

after(async () => {
  await browser?.close();
  assert.deepEqual(pageErrors, [], "the page threw errors");
});

describe("note line history", () => {
  it("stamps only the lines typed in the browser and keeps the times across reloads", async () => {
    const note = await api(page, "POST", "/notes", { title: "Line history", content: doc("Alpha", "Bravo", "Charlie"), contentText: "Alpha\nBravo\nCharlie", tags: [] });
    const original = (await api(page, "GET", `/notes/${note.id}`)).lineEdits.map(iso);
    await page.goto(`${baseUrl}/notes/${note.id}`);
    const toggle = page.getByRole("button", { name: "Line history" });
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator(".line-history-stamp").count(), 0);

    await toggle.click();
    await page.waitForURL(/[?&]lines=1/);
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    assert.deepEqual(await stamps(page, ".rich-editor"), original);
    await assertGutterLayout(page, ".rich-editor");

    await placeCaret(page, page.locator(".rich-editor p", { hasText: "Bravo" }));
    await page.keyboard.type("!");
    assert.deepEqual(await stamps(page, ".rich-editor"), [original[0], "Unsaved", original[2]]);
    await page.keyboard.press("Enter");
    await page.keyboard.type("Delta");
    await saved(page);
    await page.waitForFunction(() => ![...document.querySelectorAll(".rich-editor .line-history-stamp")].some((stamp) => stamp.textContent === "Unsaved"));

    const server = (await api(page, "GET", `/notes/${note.id}`)).lineEdits.map(iso);
    assert.equal(server.length, 4);
    assert.equal(server[0], original[0]);
    assert.ok(server[1] > original[1], "the edited line has a newer time");
    assert.equal(server[3], original[2]);
    assert.deepEqual(await stamps(page, ".rich-editor"), server);

    await page.reload();
    await page.locator(".rich-editor .line-history-stamp time").first().waitFor();
    assert.deepEqual(await stamps(page, ".rich-editor"), server);
    if (screenshots) await page.screenshot({ path: `${screenshots}/note-desktop-light.png` });
  });

  it("turns the gutter on and off from the keyboard", async () => {
    const note = await api(page, "POST", "/notes", { title: "Keyboard", content: doc("One"), contentText: "One", tags: [] });
    await page.goto(`${baseUrl}/notes/${note.id}?lines=1`);
    await page.locator(".rich-editor .line-history-stamp time").waitFor();
    await page.locator('.rich-editor [role="toolbar"] button').first().focus();
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Line history");
    await page.keyboard.press("Space");
    await page.waitForURL((url) => !url.searchParams.has("lines"));
    assert.equal(await page.locator(".line-history-stamp").count(), 0);
    await page.keyboard.press("Enter");
    await page.waitForURL(/[?&]lines=1/);
    await page.locator(".rich-editor .line-history-stamp time").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Line history");
  });

  it("replays a save over another window's edit and shows the server's times", async () => {
    const note = await api(page, "POST", "/notes", { title: "Conflict", content: doc("First", "Second", "Third"), contentText: "", tags: [] });
    await page.goto(`${baseUrl}/notes/${note.id}?lines=1`);
    await page.locator(".rich-editor .line-history-stamp time").first().waitFor();
    // Another window rewrites the first line.
    const current = await api(page, "GET", `/notes/${note.id}`);
    await api(page, "PUT", `/notes/${note.id}`, { title: "Conflict", content: doc("First, elsewhere", "Second", "Third"), contentText: "", tags: [], version: current.version });

    await placeCaret(page, page.locator(".rich-editor p", { hasText: "Third" }));
    await page.keyboard.type(" here");
    await saved(page);
    await page.waitForFunction(() => ![...document.querySelectorAll(".rich-editor .line-history-stamp")].some((stamp) => stamp.textContent === "Unsaved"));
    const server = await api(page, "GET", `/notes/${note.id}`);
    assert.match(server.content, /Third here/);
    assert.match(server.content, /"First"/, "the replayed draft wins");
    assert.deepEqual(await stamps(page, ".rich-editor"), server.lineEdits.map(iso));
  });

  it("fits a phone in the dark theme and passes an Axe audit", async () => {
    const note = await api(page, "POST", "/notes", { title: "Phone", content: JSON.stringify({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A heading that runs long enough to wrap on a phone screen" }] }, paragraph("A paragraph that is also long enough to wrap onto a second line on narrow screens."), { type: "bulletList", content: [{ type: "listItem", content: [paragraph("Item")] }] }, { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Done")] }] }, { type: "codeBlock", content: [{ type: "text", text: "a = 1\nb = 2" }] }] }), contentText: "", tags: [] });
    const phone = await newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true });
    await signIn(phone);
    await phone.goto(`${baseUrl}/notes/${note.id}?lines=1`);
    await phone.locator(".rich-editor .line-history-stamp time").first().waitFor();
    // Six lines carry times; the editor's own trailing paragraph after the code block has an empty stamp.
    assert.equal(await phone.locator(".rich-editor .line-history-stamp time").count(), 6);
    assert.ok(await phone.evaluate(() => getComputedStyle(document.documentElement).colorScheme.includes("dark") || document.documentElement.dataset.theme === "dark"), "dark theme is active");
    await assertGutterLayout(phone, ".rich-editor");
    const results = await new AxeBuilder({ page: phone }).include(".rich-editor").analyze();
    assert.deepEqual(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`), []);
    if (screenshots) await phone.screenshot({ path: `${screenshots}/note-phone-dark.png` });
    await phone.context().close();
  });
});

describe("board card line history", () => {
  async function openCard(target, body) {
    const board = await api(target, "POST", "/boards", { name: `Lines ${Date.now()}` });
    const card = await api(target, "POST", `/boards/${board.id}/cards`, { title: "Card", body, priority: "MEDIUM" });
    await target.goto(`${baseUrl}/board?board=${board.id}&card=${card.id}&cardBoard=${board.id}&lines=1`);
    await target.locator(".card-body-editor .line-history-stamp time").first().waitFor();
    return { board, card };
  }

  it("stamps a typed card line once the autosave lands", async () => {
    const { board, card } = await openCard(page, doc("Plan", "Build"));
    const original = card.lineEdits.map(iso);
    assert.deepEqual(await stamps(page, ".card-body-editor"), original);
    await assertGutterLayout(page, ".card-body-editor");
    await placeCaret(page, page.locator(".card-body-editor p", { hasText: "Build" }));
    await page.keyboard.press("Enter");
    await page.keyboard.type("Ship");
    assert.deepEqual(await stamps(page, ".card-body-editor"), [...original, "Unsaved"]);
    await page.waitForFunction(() => ![...document.querySelectorAll(".card-body-editor .line-history-stamp")].some((stamp) => stamp.textContent === "Unsaved"));
    const server = (await api(page, "GET", `/boards/${board.id}/cards/${card.id}`)).lineEdits.map(iso);
    assert.deepEqual(server.slice(0, 2), original);
    assert.deepEqual(await stamps(page, ".card-body-editor"), server);
    if (screenshots) await page.screenshot({ path: `${screenshots}/card-desktop-light.png` });
  });

  it("keeps the draft through a conflict and stamps it after Retry", async () => {
    const { board, card } = await openCard(page, doc("Plan", "Build"));
    await api(page, "PUT", `/boards/${board.id}/cards/${card.id}`, { title: "Card", body: doc("Plan", "Build", "Elsewhere"), priority: "MEDIUM", expectedUpdatedAt: card.updatedAt });
    await placeCaret(page, page.locator(".card-body-editor p", { hasText: "Plan" }));
    await page.keyboard.type(" now");
    const conflict = page.getByRole("alert").filter({ hasText: "This card changed elsewhere" });
    await conflict.waitFor();
    // Against the newer card, the draft's edited line is unsaved and the untouched one keeps its time.
    assert.deepEqual(await stamps(page, ".card-body-editor"), ["Unsaved", iso(card.lineEdits[1])]);
    await conflict.getByRole("button", { name: "Retry" }).click();
    await conflict.waitFor({ state: "detached" });
    await page.waitForFunction(() => ![...document.querySelectorAll(".card-body-editor .line-history-stamp")].some((stamp) => stamp.textContent === "Unsaved"));
    const server = await api(page, "GET", `/boards/${board.id}/cards/${card.id}`);
    assert.match(server.body, /Plan now/);
    assert.deepEqual(await stamps(page, ".card-body-editor"), server.lineEdits.map(iso));
  });

  it("fits the card dialog on a phone", async () => {
    const phone = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await signIn(phone);
    await openCard(phone, doc("A card line long enough to wrap in the phone dialog", "Short"));
    await assertGutterLayout(phone, ".card-body-editor");
    if (screenshots) await phone.screenshot({ path: `${screenshots}/card-phone-light.png` });
    await phone.context().close();
  });
});
