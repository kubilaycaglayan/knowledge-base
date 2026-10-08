import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import vm from "node:vm";
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

// The Chrome extension's own body builder, taken from its popup script so this
// suite saves exactly what the extension saves.
function extensionNoteDocument() {
  const source = readFileSync(new URL("../../chrome-extension/popup.js", import.meta.url), "utf8");
  const start = source.indexOf("function markdownInlineContent(");
  const end = source.indexOf("function replaceNoteEditorText(");
  assert.ok(start >= 0 && end > start, "popup.js no longer has markdownInlineContent/markdownNoteDocument in this order");
  const context = vm.createContext({});
  vm.runInContext(`${source.slice(start, end)}; this.build = markdownNoteDocument;`, context);
  return (markdown) => JSON.stringify(context.build(markdown));
}

// The iOS app's body conversion, ported line for line from NoteDocument in
// ios/Know/NotesModels.swift (Swift cannot run in this Linux suite).
const iosNoteDocument = {
  plainText(content, fallback) {
    let document;
    try { document = JSON.parse(content); } catch { return fallback ?? content; }
    if (!document || typeof document !== "object" || document.type !== "doc") return fallback ?? content;
    const collect = (node) => {
      if (!node || typeof node !== "object") return "";
      const text = typeof node.text === "string" ? node.text : "";
      const children = (Array.isArray(node.content) ? node.content : []).map(collect).join("");
      return text + children + (node.type === "paragraph" ? "\n" : "");
    };
    return collect(document).replace(/^\n+|\n+$/g, "").replaceAll("\n\n", "\n");
  },
  json(body) {
    return JSON.stringify({ type: "doc", content: body.split(/\r\n|\r|\n/).map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })) });
  },
};

// Each non-empty line's text (checkbox dropped) mapped to its edit time, by the
// same line rules as frontend/src/lib/line-history.ts.
function timesByText(note) {
  const lines = [];
  const collect = (node, prefix) => {
    const children = Array.isArray(node.content) ? node.content : [];
    if (["paragraph", "heading", "codeBlock"].includes(node.type)) {
      lines.push(...(prefix + children.map((child) => (child.type === "text" ? child.text : child.type === "hardBreak" ? "\n" : "")).join("")).split("\n"));
      return;
    }
    children.forEach((child) => collect(child, node.type === "taskItem" ? (node.attrs?.checked ? "[x] " : "[ ] ") : ""));
  };
  collect(JSON.parse(note.content), "");
  assert.equal(lines.length, note.lineEdits.length);
  return Object.fromEntries(lines.map((line, index) => [line.replace(/^\[[x ]\] /, ""), note.lineEdits[index]]).filter(([line]) => line));
}

const without = (times, ...lines) => Object.fromEntries(Object.entries(times).filter(([line]) => !lines.includes(line)));

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

describe("line history across clients", () => {
  const richBody = JSON.stringify({ type: "doc", content: [paragraph("Alpha"), { type: "bulletList", content: [{ type: "listItem", content: [paragraph("Item")] }] }, { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Done")] }, { type: "taskItem", attrs: { checked: false }, content: [paragraph("Open")] }] }, paragraph("Last")] });

  // Opens the note in the web app and lets it save once, so contentText is the web's own.
  async function webNote(title) {
    const note = await api(page, "POST", "/notes", { title, content: richBody, contentText: "", tags: [] });
    await page.goto(`${baseUrl}/notes/${note.id}?lines=1`);
    await page.locator(".rich-editor .line-history-stamp time").first().waitFor();
    await placeCaret(page, page.locator(".rich-editor p", { hasText: "Last" }));
    await page.keyboard.type("!");
    await saved(page);
    return api(page, "GET", `/notes/${note.id}`);
  }

  it("keeps every untouched line's time through a Chrome extension save", async () => {
    const build = extensionNoteDocument();
    const before = await webNote("Extension");
    const original = timesByText(before);
    assert.deepEqual(Object.keys(original), ["Alpha", "Item", "Done", "Open", "Last!"]);
    // The extension edits the web's plain-text copy and rebuilds the body from it.
    const untouched = await api(page, "PUT", `/notes/${before.id}`, { title: before.title, content: build(before.contentText), contentText: before.contentText, tags: [], version: before.version });
    assert.deepEqual(timesByText(untouched), original, "an unchanged extension save restamped lines");

    const edited = before.contentText.replace("Item", "Item, edited in the extension");
    const after = await api(page, "PUT", `/notes/${before.id}`, { title: before.title, content: build(edited), contentText: edited, tags: [], version: untouched.version });
    const times = timesByText(after);
    assert.deepEqual(without(times, "Item, edited in the extension"), without(original, "Item"));
    assert.ok(times["Item, edited in the extension"] > original.Item);

    // Back in the web app, the gutter shows those times.
    await page.reload();
    await page.locator(".rich-editor .line-history-stamp time").first().waitFor();
    assert.deepEqual(await stamps(page, ".rich-editor"), after.lineEdits.map(iso));
  });

  it("keeps every untouched line's time through an iOS save", async () => {
    const before = await webNote("iOS");
    const original = timesByText(before);
    const body = iosNoteDocument.plainText(before.content, before.contentText);
    assert.equal(body, "Alpha\nItem\nDone\nOpen\nLast!");
    const untouched = await api(page, "PUT", `/notes/${before.id}`, { title: before.title, content: iosNoteDocument.json(body), contentText: body, tags: [], version: before.version });
    assert.deepEqual(untouched.lineEdits, before.lineEdits, "an unchanged iOS save restamped lines");
    const edited = body.replace("Open", "Open, edited on iOS");
    const after = await api(page, "PUT", `/notes/${before.id}`, { title: before.title, content: iosNoteDocument.json(edited), contentText: edited, tags: [], version: untouched.version });
    const times = timesByText(after);
    assert.deepEqual(without(times, "Open, edited on iOS"), without(original, "Open"));
    assert.ok(times["Open, edited on iOS"] > original.Open);
  });
});

describe("line history for assistive technology", () => {
  it("keeps the gutter out of the textbox and announces the caret line's time", async () => {
    const note = await api(page, "POST", "/notes", { title: "Screen reader", content: doc("Spoken", "Second"), contentText: "Spoken\nSecond", tags: [] });
    await page.goto(`${baseUrl}/notes/${note.id}?lines=1`);
    await page.locator(".rich-editor .line-history-stamp time").first().waitFor();
    const textbox = page.getByRole("textbox", { name: "Note content" });
    const tree = await textbox.ariaSnapshot();
    assert.match(tree, /Spoken/);
    assert.doesNotMatch(tree, /\d{2}:\d{2}|Unsaved/, `the textbox exposes gutter text: ${tree}`);
    assert.equal(await page.getByRole("button", { name: "Line history" }).getAttribute("aria-pressed"), "true");

    const status = page.locator('.rich-editor [role="status"].line-history-status');
    await placeCaret(page, page.locator(".rich-editor p", { hasText: "Second" }));
    await page.waitForFunction(() => /^Line edited /.test(document.querySelector(".rich-editor .line-history-status")?.textContent || ""));
    await page.keyboard.press("Enter");
    await page.keyboard.type("Typed");
    await page.waitForFunction(() => document.querySelector(".rich-editor .line-history-status")?.textContent === "Line not saved yet");
    assert.equal(await page.getByRole("status").filter({ hasText: "Line not saved yet" }).count(), 1, "the announcement is in the accessibility tree");
    await page.keyboard.press("ArrowUp");
    await page.waitForFunction(() => /^Line edited /.test(document.querySelector(".rich-editor .line-history-status")?.textContent || ""));
    await page.getByRole("button", { name: "Line history" }).click();
    await page.waitForFunction(() => (document.querySelector(".rich-editor .line-history-status")?.textContent ?? "") === "");
    assert.equal(await status.count(), 1);
  });

  // A person cannot type within the frame of their click; at 50 ms after the click
  // (faster than any typist) the caret has settled, gutter or not.
  it("types where a quick click lands, with the gutter on and off", async () => {
    for (const lines of [true, false]) {
      const board = await api(page, "POST", "/boards", { name: `Quick ${lines} ${Date.now()}` });
      const card = await api(page, "POST", `/boards/${board.id}/cards`, { title: "Card", body: doc("Plan", "Build"), priority: "MEDIUM" });
      await page.goto(`${baseUrl}/board?board=${board.id}&card=${card.id}&cardBoard=${board.id}${lines ? "&lines=1" : ""}`);
      await page.locator(".card-body-editor p", { hasText: "Build" }).click();
      await page.waitForTimeout(50);
      await page.keyboard.press("End");
      await page.keyboard.type("X");
      assert.deepEqual(await page.locator(".card-body-editor p").evaluateAll((elements) => elements.map((element) => element.innerText.split("\n").pop())), ["Plan", "BuildX"], `gutter ${lines ? "on" : "off"}`);
    }
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
