import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.REPORTS_SETTINGS_E2E_BASE_URL;
const email = process.env.REPORTS_SETTINGS_E2E_EMAIL;
const password = process.env.REPORTS_SETTINGS_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("REPORTS_SETTINGS_E2E_BASE_URL, REPORTS_SETTINGS_E2E_EMAIL, and REPORTS_SETTINGS_E2E_PASSWORD are required");

let browser;
let page;

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

it("persists report range in navigation and theme preference after reload", async () => {
  const startDate = "2025-03-03";
  const endDate = "2025-03-09";
  const reportResponse = page.waitForResponse((response) => response.url().includes("/api/v1/reports?") && response.status() === 200);
  await page.goto(`${baseUrl}/reports?startDate=${startDate}&endDate=${endDate}&aggregation=day`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Reports" }).waitFor();
  const loaded = await reportResponse;
  const payload = await loaded.json();
  assert.equal(payload.from, startDate);
  assert.equal(payload.to, endDate);
  assert.equal(new URL(page.url()).searchParams.get("startDate"), startDate);
  assert.equal(new URL(page.url()).searchParams.get("endDate"), endDate);
  await page.reload();
  await page.getByRole("heading", { name: "Reports" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("startDate"), startDate);
  assert.equal(new URL(page.url()).searchParams.get("endDate"), endDate);

  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const theme = page.getByRole("combobox", { name: "Theme preference" });
  await theme.waitFor();
  await theme.selectOption("solarized");
  assert.equal(await page.evaluate(() => localStorage.getItem("knowledge-base-theme")), "solarized");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "solarized");
  await page.reload();
  await page.getByRole("combobox", { name: "Theme preference" }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: "Theme preference" }).inputValue(), "solarized");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "solarized");
});
