import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.TRANSFERS_E2E_BASE_URL;
const email = process.env.TRANSFERS_E2E_EMAIL;
const password = process.env.TRANSFERS_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("TRANSFERS_E2E_BASE_URL, TRANSFERS_E2E_EMAIL, and TRANSFERS_E2E_PASSWORD are required");

let browser;
let page;
async function batches(source) {
  return page.evaluate(async (source) => {
    const response = await fetch(`/api/v1/imports/${source}/batches`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  }, source);
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

it("exports and reimports Knowledge Base CSV, validates input, and imports Clockify sessions", async () => {
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("tab", { name: "Export" }).click();
  await page.getByRole("button", { name: "Download Knowledge Base CSV" }).click();
  const csv = await page.evaluate(async () => {
    const response = await fetch("/api/v1/imports/knowledge-base/export", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    if (!response.ok) throw new Error(`Export returned ${response.status}`);
    return response.text();
  });
  assert.match(csv, /^entity,id,payload\n/);
  await page.getByRole("status").filter({ hasText: "export is ready" }).waitFor();

  await page.getByRole("tab", { name: "Import" }).click();
  const csvInput = page.getByRole("textbox", { name: "Knowledge Base CSV" });
  await csvInput.fill(csv);
  await page.getByRole("button", { name: "Import Knowledge Base data" }).click();
  await page.getByRole("status").filter({ hasText: "Imported" }).waitFor();
  const kbBatches = await batches("knowledge-base");
  assert.equal(kbBatches.status, 200);
  assert.equal(kbBatches.data.length, 1);

  await page.getByRole("tab", { name: "Clockify" }).click();
  const clockifyInput = page.getByRole("textbox", { name: "Clockify JSON" });
  await clockifyInput.fill("{");
  await page.getByRole("button", { name: "Import Clockify sessions" }).click();
  await page.getByRole("alert").filter({ hasText: "Paste valid Clockify JSON" }).waitFor();
  await clockifyInput.fill(JSON.stringify({ timeentries: [{ _id: "ototest-transfer", description: "OTOTEST transfer journey", projectName: "Transfer project", timeInterval: { start: "2025-02-03T10:00:00Z", end: "2025-02-03T10:30:00Z" } }] }));
  await page.getByRole("button", { name: "Import Clockify sessions" }).click();
  await page.getByRole("status").filter({ hasText: "Imported 1 sessions" }).waitFor();
  const clockifyBatches = await batches("clockify");
  assert.equal(clockifyBatches.status, 200);
  assert.ok(clockifyBatches.data.some((batch) => batch.imported === 1 && batch.source === "IMPORT"));
});
