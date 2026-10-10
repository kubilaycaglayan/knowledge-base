import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.LABELS_E2E_BASE_URL;
const email = process.env.LABELS_E2E_EMAIL;
const password = process.env.LABELS_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("LABELS_E2E_BASE_URL, LABELS_E2E_EMAIL, and LABELS_E2E_PASSWORD are required");

const marker = `LabelsJourney-${Date.now()}`;
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

it("creates, edits, removes, and reloads a Label with persisted API state", async () => {
  await page.goto(`${baseUrl}/labels`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Your labels" }).waitFor();
  await page.getByRole("button", { name: "Add label" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add a label" });
  const initialName = `${marker} original`;
  await createDialog.getByRole("textbox", { name: "Name" }).fill(initialName);
  await createDialog.getByRole("button", { name: "Add label", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${initialName}` }).waitFor();
  let labels = await api("/labels");
  assert.equal(labels.status, 200);
  const created = labels.data.find((label) => label.name === initialName);
  assert.ok(created, "the label is created by the UI and present in a fresh API read");
  const labelRow = () => page.locator(".label-row").filter({ hasText: editedName });

  const editedName = `${marker} edited`;
  await page.getByRole("button", { name: `Edit ${initialName}` }).click();
  const editDialog = page.getByRole("dialog", { name: `Edit ${initialName}` });
  await editDialog.getByRole("textbox", { name: "Name" }).fill(editedName);
  await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${editedName}` }).waitFor();
  labels = await api("/labels");
  assert.ok(labels.data.some((label) => label.id === created.id && label.name === editedName));
  await page.reload();
  await page.getByRole("button", { name: `Edit ${editedName}` }).waitFor();
  await labelRow().getByRole("button", { name: `Remove ${editedName}` }).click();
  const confirmation = page.getByRole("dialog", { name: `Remove “${editedName}”?` });
  await confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${editedName}` }).waitFor({ state: "detached" });
  labels = await api("/labels");
  assert.equal(labels.data.some((label) => label.id === created.id), false);
  await page.reload();
  await page.getByRole("button", { name: `Edit ${editedName}` }).waitFor({ state: "detached" });
});
