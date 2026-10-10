import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.NOTES_E2E_BASE_URL;
const email = process.env.NOTES_E2E_EMAIL;
const password = process.env.NOTES_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("NOTES_E2E_BASE_URL, NOTES_E2E_EMAIL, and NOTES_E2E_PASSWORD are required");

const marker = `NotesJourney-${Date.now()}`;
let browser;
let page;
let noteId;

async function api(path, method = "GET", body) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data };
  }, { path, method, body });
}

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  context.setDefaultTimeout(10000);
  page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: /New here\? Create an account/ }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
  await api("/notes", "POST", {
    title: `${marker} retained active note`,
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Active archive-navigation fixture" }] }] }),
    contentText: "Active archive-navigation fixture",
    tags: [],
  });
});

after(async () => browser?.close());

it("creates, edits, archives, restores, and reloads a note with persisted API state", async () => {
  await page.goto(`${baseUrl}/notes`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: "Create new note" }).click();
  await page.waitForURL(/\/notes\/[^/]+$/);
  noteId = new URL(page.url()).pathname.split("/").at(-1);

  const title = `${marker} title`;
  const body = `${marker} body survives a fresh read`;
  await page.getByRole("textbox", { name: "Note title" }).fill(title);
  await page.waitForFunction(async ({ id, expectedTitle }) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return response.ok && (await response.json()).title === expectedTitle;
  }, { id: noteId, expectedTitle: title });
  await page.getByRole("textbox", { name: "Note content" }).fill(body);
  await page.waitForFunction(async ({ id, expectedTitle, expectedBody }) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    if (!response.ok) return false;
    const note = await response.json();
    return note.title === expectedTitle && (note.contentText || "").includes(expectedBody);
  }, { id: noteId, expectedTitle: title, expectedBody: body });
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();

  const saved = await api(`/notes/${noteId}`);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.title, title, JSON.stringify(saved.data));
  assert.ok(saved.data.contentText.includes(body), JSON.stringify(saved.data));

  await page.getByRole("button", { name: "Back to notes" }).click();
  await page.getByRole("link", { name: `Open ${title}` }).waitFor();
  await page.reload();
  await page.getByRole("link", { name: `Open ${title}` }).waitFor();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".note-row").filter({ hasText: title }).getByRole("button", { name: "Archive" }).click();
  await page.getByRole("link", { name: `Open ${title}` }).waitFor({ state: "detached" });
  await page.reload();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByText(title, { exact: true }).waitFor();

  await page.locator(".note-row").filter({ hasText: title }).getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Active notes", exact: true }).click();
  await page.getByRole("link", { name: `Open ${title}` }).waitFor();
  await page.reload();
  await page.getByRole("link", { name: `Open ${title}` }).waitFor();
  const restored = await api(`/notes/${noteId}`);
  assert.equal(restored.status, 200);
  assert.equal(restored.data.title, title);
  assert.ok(restored.data.contentText.includes(body));
});
