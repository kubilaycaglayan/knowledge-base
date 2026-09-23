import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.BOARD_E2E_BASE_URL;
const email = process.env.BOARD_E2E_EMAIL;
const password = process.env.BOARD_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("BOARD_E2E_BASE_URL, BOARD_E2E_EMAIL, and BOARD_E2E_PASSWORD are required");

let browser;
let page;
let activeBoardName;
const isoDate = (value) => value.toISOString().slice(0, 10);
const timelineStart = isoDate(new Date());
const timelineEnd = isoDate(new Date(Date.now() + 2 * 86_400_000));

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
  context.setDefaultTimeout(10000);
  page = await context.newPage();
  await page.goto(`${baseUrl}/`);
  await page.getByRole("button", { name: /New here\? Create an account/ }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
  await page.goto(`${baseUrl}/board`);
  await page.reload();
  await page.getByRole("heading", { name: "Boards" }).waitFor();
});

async function createBoard(name) {
  await page.getByRole("button", { name: "Create board" }).waitFor({ state: "visible" });
  await page.getByRole("textbox", { name: "New board name" }).fill(name);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/v1/boards") && response.request().method() === "POST" && response.status() === 201),
    page.getByRole("button", { name: "Create board" }).click(),
  ]);
  await page.locator("#board-select option", { hasText: name }).waitFor({ state: "attached" });
  await page.getByRole("combobox", { name: "Current board" }).selectOption({ label: name });
  activeBoardName = name;
}

beforeEach(async () => {
  await page.goto(`${baseUrl}/board`);
  await page.getByRole("heading", { name: "Boards" }).waitFor();
  await createBoard(`Board E2E ${Date.now()}`);
});

after(async () => { await browser?.close(); });

describe("board real-stack acceptance", () => {
  it("creates two boards, switches them, and keeps route state", async () => {
    const firstBoard = activeBoardName;
    const secondBoard = `${firstBoard} Second`;
    await createBoard(secondBoard);
    await page.getByRole("combobox", { name: "Current board" }).selectOption({ label: firstBoard });
    assert.equal(new URL(page.url()).searchParams.get("board") !== null, true);
  });

  it("does not let a delayed board response replace the newly selected board", async () => {
    const firstBoard = activeBoardName;
    const firstId = await page.getByRole("combobox", { name: "Current board" }).inputValue();
    await createBoard(`${firstBoard} Delayed response ${Date.now()}`);
    const secondId = await page.getByRole("combobox", { name: "Current board" }).inputValue();
    await page.getByRole("textbox", { name: "New card title" }).fill("Second board card");
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByRole("heading", { name: "Second board card" }).waitFor();

    let releaseFirstPage;
    const firstPageReleased = new Promise((resolve) => { releaseFirstPage = resolve; });
    let held = false;
    await page.route(`**/api/v1/boards/${firstId}/cards/page*`, async (route) => {
      if (!held) {
        held = true;
        await firstPageReleased;
      }
      await route.continue();
    });
    await page.getByRole("combobox", { name: "Current board" }).selectOption(firstId);
    await page.waitForTimeout(100);
    await page.getByRole("combobox", { name: "Current board" }).selectOption(secondId);
    await page.getByRole("heading", { name: "Second board card" }).waitFor();
    releaseFirstPage();
    assert.equal(await page.getByRole("combobox", { name: "Current board" }).inputValue(), secondId);
    assert.equal(await page.getByRole("heading", { name: "Second board card" }).count() >= 1, true);
    await page.unroute(`**/api/v1/boards/${firstId}/cards/page*`);
  });

  it("creates a blank card and renders that card on the real Gantt timeline", async () => {
    await page.getByRole("textbox", { name: "New card title" }).fill("");
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByRole("heading", { name: "Untitled card" }).waitFor();
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Real timeline card");
    await page.locator("input[name='startDate']").fill(timelineStart);
    await page.locator("input[name='dueDate']").fill(timelineEnd);
    await page.getByRole("button", { name: "Save card" }).click();
    const viewChange = page.waitForURL(/view=gantt/);
    await page.getByRole("button", { name: "Gantt" }).click();
    await viewChange;
    const ganttRequest = page.waitForResponse((response) => response.url().includes("/gantt") && response.request().method() === "GET");
    await page.reload();
    const ganttResponse = await ganttRequest;
    assert.equal(ganttResponse.status(), 200, await ganttResponse.text());
    const ganttCards = await ganttResponse.json();
    assert.equal(ganttCards.some((card) => card.title === "Real timeline card"), true);
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    await page.locator(".timeline-bar", { hasText: "Real timeline card" }).waitFor();
    assert.equal(await page.locator(".timeline-bar", { hasText: "Real timeline card" }).count(), 1);
  });

  it("passes Axe on the primary mobile board view", async () => {
    await page.getByRole("button", { name: "Kanban" }).click();
    const results = await new AxeBuilder({ page }).analyze();
    assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(", "));
  });
});
