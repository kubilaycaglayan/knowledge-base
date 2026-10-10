import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  const pathName = `Transfer fixture ${Date.now()}`;
  const pathDescription = "Exported by the OTOTEST transfer journey";
  const createdPath = await page.evaluate(async ({ name, description }) => {
    const response = await fetch("/api/v1/paths", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, color: null, textColor: null }),
    });
    return { status: response.status, data: await response.json() };
  }, { name: pathName, description: pathDescription });
  assert.equal(createdPath.status, 201);

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
  assert.ok(csv.includes(pathName), "the export contains the source account's Path");
  // A separate production database has no knowledge of the source IDs. Give
  // the fixture a fresh stable ID to model that portable import boundary.
  const destinationCsv = csv.replace(createdPath.data.id, randomUUID());
  await page.getByRole("status").filter({ hasText: "export is ready" }).waitFor();

  const importContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  importContext.setDefaultTimeout(10000);
  const importPage = await importContext.newPage();
  await importPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await importPage.getByRole("button", { name: /New here\? Create an account/ }).click();
  await importPage.getByRole("textbox", { name: "Email" }).fill(`transfer-import-${Date.now()}@example.com`);
  await importPage.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await importPage.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await importPage.getByRole("button", { name: "Create account", exact: true }).click();
  await importPage.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
  await importPage.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await importPage.getByRole("tab", { name: "Import" }).click();
  const csvInput = importPage.getByRole("textbox", { name: "Knowledge Base CSV" });
  await csvInput.fill(destinationCsv);
  const knowledgeBaseImportResponse = importPage.waitForResponse((response) => response.url().includes("/api/v1/imports/knowledge-base") && response.request().method() === "POST");
  await importPage.getByRole("button", { name: "Import Knowledge Base data" }).click();
  const importResponse = await knowledgeBaseImportResponse;
  const importSummary = await importResponse.json();
  assert.equal(importResponse.status(), 200, JSON.stringify(importSummary));
  assert.equal(importSummary.imported, 1);
  await importPage.getByRole("status").filter({ hasText: "Imported" }).waitFor();
  const kbBatches = await importPage.evaluate(async () => {
    const response = await fetch("/api/v1/imports/knowledge-base/batches", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  });
  assert.equal(kbBatches.status, 200);
  assert.equal(kbBatches.data.length, 1);
  const importedPaths = await importPage.evaluate(async () => {
    const response = await fetch("/api/v1/paths", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  });
  assert.equal(importedPaths.status, 200);
  assert.ok(importedPaths.data.some((path) => path.name === pathName && path.description === pathDescription));
  await importContext.close();

  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("tab", { name: "Import" }).click();
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
  const importedSessions = await page.evaluate(async () => {
    const response = await fetch("/api/v1/time-entries?page=0&size=20", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  });
  assert.equal(importedSessions.status, 200);
  assert.ok(importedSessions.data.sessions.some((session) => session.description === "OTOTEST transfer journey" && session.source === "IMPORT"));
});
