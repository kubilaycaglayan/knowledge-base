import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.LOGS_E2E_BASE_URL;
const email = process.env.LOGS_E2E_EMAIL;
const password = process.env.LOGS_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("LOGS_E2E_BASE_URL, LOGS_E2E_EMAIL, and LOGS_E2E_PASSWORD are required");

const marker = `LogsJourney-${Date.now()}`;
let browser;
let page;

async function api(path) {
  return page.evaluate(async (path) => {
    const response = await fetch(`/api/v1${path}`, { cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }, path);
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

it("creates, edits, deletes, and reloads a Log with persisted API state", async () => {
  await page.goto(`${baseUrl}/logs`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const initialBody = `${marker} original entry`;
  await page.getByRole("textbox", { name: "Log text" }).fill(initialBody);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  let entry = page.locator("article.log-entry").filter({ hasText: initialBody });
  await entry.waitFor();
  const logId = (await entry.getAttribute("id")).replace(/^log-/, "");
  entry = page.locator(`#log-${logId}`);
  let savedLog = await api(`/logs/${logId}`);
  assert.equal(savedLog.status, 200);
  assert.equal(savedLog.data.body, initialBody);

  await entry.getByRole("button", { name: /^Edit log from / }).click();
  const editedBody = `${marker} edited entry`;
  await entry.getByRole("textbox", { name: /^Edit log text from / }).fill(editedBody);
  await entry.getByRole("button", { name: "Save", exact: true }).click();
  entry = page.locator(`#log-${logId}`);
  await entry.getByText(editedBody, { exact: true }).waitFor();
  savedLog = await api(`/logs/${logId}`);
  assert.equal(savedLog.status, 200);
  assert.equal(savedLog.data.body, editedBody);
  await page.reload();
  entry = page.locator(`#log-${logId}`);
  await entry.waitFor();

  await entry.getByRole("button", { name: /^Remove log from / }).click();
  const confirmation = page.getByRole("dialog", { name: "Remove this log? This cannot be undone." });
  await confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
  await entry.waitFor({ state: "detached" });
  savedLog = await api(`/logs/${logId}`);
  assert.equal(savedLog.status, 404);
  await page.reload();
  await page.getByText(editedBody, { exact: true }).waitFor({ state: "detached" });
});
