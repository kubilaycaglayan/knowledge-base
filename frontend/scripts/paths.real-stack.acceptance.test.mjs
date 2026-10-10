import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.PATHS_E2E_BASE_URL;
const email = process.env.PATHS_E2E_EMAIL;
const password = process.env.PATHS_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("PATHS_E2E_BASE_URL, PATHS_E2E_EMAIL, and PATHS_E2E_PASSWORD are required");

const marker = `PathsJourney-${Date.now()}`;
let browser;
let page;

async function api(path, method = "GET", body) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
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
});

after(async () => browser?.close());

it("creates, edits, removes, restores, and reloads a Path with persisted API state", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Your paths" }).waitFor();
  await page.getByRole("button", { name: "Add path" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a path" });
  const initialName = `${marker} original`;
  const initialDescription = `${marker} description`;
  await dialog.getByRole("textbox", { name: "New path name" }).fill(initialName);
  await dialog.getByRole("textbox", { name: "Path description" }).fill(initialDescription);
  await dialog.getByRole("button", { name: "Add path", exact: true }).click();

  const initialCard = page.locator("article.path").filter({ hasText: initialName });
  await initialCard.getByRole("heading", { name: initialName }).waitFor();
  assert.ok((await api("/paths")).data.some((path) => path.name === initialName && path.description === initialDescription));

  await initialCard.getByRole("button", { name: "Edit", exact: true }).click();
  const editedName = `${marker} edited`;
  const editedDescription = `${marker} edited description`;
  await page.getByRole("textbox", { name: "Edit path name" }).fill(editedName);
  await page.getByRole("textbox", { name: "Edit path description" }).fill(editedDescription);
  await page.getByRole("button", { name: "Save path", exact: true }).click();
  const editedCard = page.locator("article.path").filter({ hasText: editedName });
  await editedCard.getByRole("heading", { name: editedName }).waitFor();
  const editedPaths = await api("/paths");
  assert.equal(editedPaths.status, 200);
  assert.ok(editedPaths.data.some((path) => path.name === editedName && path.description === editedDescription));
  await page.reload();
  await page.locator("article.path").filter({ hasText: editedName }).getByRole("heading", { name: editedName }).waitFor();

  await page.locator("article.path").filter({ hasText: editedName }).getByRole("button", { name: "Remove", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: `Remove ${editedName}? You can undo this for a few seconds.` });
  await confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
  const undoStatus = page.getByRole("status").filter({ hasText: `Removed “${editedName}”.` });
  await undoStatus.getByRole("button", { name: "Undo", exact: true }).waitFor();
  assert.equal((await api("/paths")).data.some((path) => path.name === editedName), false);

  await undoStatus.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("heading", { name: editedName }).waitFor();
  await page.reload();
  await page.locator("article.path").filter({ hasText: editedName }).getByRole("heading", { name: editedName }).waitFor();
  const restored = await api("/paths");
  assert.equal(restored.status, 200);
  assert.ok(restored.data.some((path) => path.name === editedName && path.description === editedDescription));
});
