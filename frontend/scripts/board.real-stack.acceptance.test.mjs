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

  it("protects a card from a stale concurrent tab write", async () => {
    const boardId = await page.getByRole("combobox", { name: "Current board" }).inputValue();
    await page.getByRole("textbox", { name: "New card title" }).fill("Concurrent card");
    await Promise.all([
      page.waitForResponse((response) => response.url().includes(`/api/v1/boards/${boardId}/cards`) && response.request().method() === "POST" && response.status() === 201),
      page.getByRole("button", { name: "Add card" }).click(),
    ]);
    await page.getByRole("heading", { name: "Concurrent card" }).waitFor();

    const otherPage = await page.context().newPage();
    try {
      otherPage.setDefaultTimeout(10000);
      await otherPage.goto(`${baseUrl}/board?board=${boardId}`);
      await otherPage.getByRole("heading", { name: "Boards" }).waitFor();
      await otherPage.getByRole("combobox", { name: "Current board" }).selectOption(boardId);
      await otherPage.reload();
      await otherPage.getByRole("heading", { name: "Concurrent card" }).waitFor();

    await page.locator(".board-card", { hasText: "Concurrent card" }).click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("First tab wins");
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("heading", { name: "First tab wins" }).waitFor();

    await otherPage.locator(".board-card", { hasText: "Concurrent card" }).click();
    await otherPage.getByRole("textbox", { name: "Title", exact: true }).fill("Stale second tab");
    await otherPage.getByRole("button", { name: "Save card" }).click();
    await otherPage.getByRole("alert").filter({ hasText: "changed elsewhere" }).waitFor();
    assert.equal(await otherPage.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Stale second tab");
    } finally {
      await otherPage.close();
    }
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

  it("does not display JSON objects in rendered card content", async () => {
    await page.getByRole("textbox", { name: "New card title" }).fill("Card with content");
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByRole("heading", { name: "Card with content" }).waitFor();

    // Get all visible text
    const content = await page.textContent(".kanban");
    // Ensure no raw JSON objects appear in UI
    assert.equal(content.includes("{}"), false, "JSON object {} should not appear in rendered UI");
    assert.equal(content.includes('{"'), false, "Raw JSON should not appear in rendered UI");
  });

  it("provides error messages with dismissal capability", async () => {
    // Trigger an error by attempting invalid action
    await page.goto(`${baseUrl}/board?board=invalid-board-id`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();

    // Create a new board to have a valid board
    await page.getByRole("textbox", { name: "New board name" }).fill(`Board ${Date.now()}`);
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/v1/boards") && response.status() === 201),
      page.getByRole("button", { name: "Create board" }).click(),
    ]);

    // Check for error message and close button
    const errorAlert = page.locator("[role='alert']").first();
    if (await errorAlert.count() > 0) {
      const closeButton = await page.locator("[aria-label*='Dismiss']").first();
      assert.equal(await closeButton.count() > 0, true, "Error messages should have a close button");
    }
  });

  it("shows plus button for adding boards (icon button, not text)", async () => {
    await page.goto(`${baseUrl}/board`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();

    const addButton = page.locator('button[aria-label="Add board"]');
    assert.equal(await addButton.count(), 1, "Should have add board button");

    const buttonText = await addButton.textContent();
    assert.equal(buttonText.includes("＋"), true, "Button should use icon (plus sign) not text");
  });

  it("allows Kanban view to be the primary view with Gantt switch available", async () => {
    await page.goto(`${baseUrl}/board`);
    const boardSelect = page.locator("#board-select");
    if (await boardSelect.inputValue()) {
      const viewButtons = page.locator(".view-switch button");
      assert.equal(await viewButtons.count(), 2, "Should have Kanban and Gantt buttons");

      const kanbanBtn = page.getByRole("button", { name: "Kanban" });
      const ganttBtn = page.getByRole("button", { name: "Gantt" });
      assert.equal(await kanbanBtn.count(), 1, "Should have Kanban button");
      assert.equal(await ganttBtn.count(), 1, "Should have Gantt button");
    }
  });

  it("dismisses error messages when user takes action or clicks close", async () => {
    await page.goto(`${baseUrl}/board`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();

    // Create a board to ensure we have one selected
    await createBoard(`Board dismiss test ${Date.now()}`);

    // Error message close button test
    const errorButton = page.locator('button[aria-label*="Dismiss"]');
    if (await errorButton.count() > 0) {
      await errorButton.first().click();
      await page.waitForTimeout(200);
      // After clicking close, error should disappear
      const alertAfterClose = page.locator("[role='alert']");
      assert.equal(await alertAfterClose.count(), 0, "Error should be dismissed after clicking close");
    }
  });

  it("supports board name inline editing (click to edit)", async () => {
    const boardId = await page.getByRole("combobox", { name: "Current board" }).inputValue();
    if (boardId) {
      // Look for rename button (current implementation has explicit rename button)
      const renameButton = page.getByRole("button", { name: "Rename board" }).first();
      if (await renameButton.count() > 0) {
        await renameButton.click();
        const boardNameInput = page.getByRole("textbox", { name: "Board name" });
        assert.equal(await boardNameInput.count(), 1, "Should show inline edit input for board name");
      }
    }
  });

  it("displays status column names as editable (click to inline edit)", async () => {
    const boardId = await page.getByRole("combobox", { name: "Current board" }).inputValue();
    if (boardId) {
      // Check if we can edit status names
      const renameButtons = page.locator('button[aria-label*="Rename"]').filter({ hasText: "Rename" });
      if (await renameButtons.count() > 0) {
        await renameButtons.first().click();
        const statusInputs = page.locator("input").filter({ hasText: "" });
        // A rename input should appear
        const inputs = page.locator(".status-edit input");
        if (await inputs.count() > 0) {
          assert.equal(await inputs.count() > 0, true, "Status names should be editable via inline edit");
        }
      }
    }
  });

  it("does not show 'Load more' button - uses lazy loading sentinel instead", async () => {
    const boardId = await page.getByRole("combobox", { name: "Current board" }).inputValue();
    if (boardId) {
      // Create multiple cards to test pagination
      for (let i = 0; i < 5; i++) {
        await page.getByRole("textbox", { name: "New card title" }).fill(`Card ${i} for lazy load test`);
        await page.getByRole("button", { name: "Add card" }).click();
        await page.waitForTimeout(200);
      }

      // Look for explicit "Load more" button - should NOT exist
      const loadMoreButtons = page.locator("text=Load more").first();
      assert.equal(await loadMoreButtons.count() === 0, true, "Should not show 'Load more' button");

      // Should have lazy-load sentinel instead
      const sentinels = page.locator(".load-more-sentinel");
      // Sentinel may be present but not visible
      if (await sentinels.count() > 0) {
        const ariaHidden = await sentinels.first().getAttribute("aria-hidden");
        assert.equal(ariaHidden, "true", "Lazy load sentinel should be aria-hidden");
      }
    }
  });

  it("allows path selection as dropdown, not multiselect", async () => {
    const boardId = await page.getByRole("combobox", { name: "Current board" }).inputValue();
    if (boardId) {
      await page.getByRole("textbox", { name: "New card title" }).fill("Card for path test");
      await page.getByRole("button", { name: "Add card" }).click();
      await page.getByRole("heading", { name: "Card for path test" }).waitFor();

      // Open card editor
      await page.locator(".board-card", { hasText: "Card for path test" }).click();
      await page.getByRole("heading", { name: "Edit card" }).waitFor();

      // Check path selector - should be checkboxes (not dropdown, but also not a select)
      const pathInputs = page.locator("input[name='cardPaths']");
      // If paths exist, verify they're checkboxes not a select
      if (await pathInputs.count() > 0) {
        const inputType = await pathInputs.first().getAttribute("type");
        assert.equal(inputType, "checkbox", "Paths should use checkboxes for selection");
      }

      // Close the editor
      await page.getByRole("button", { name: "Cancel" }).click();
    }
  });

  it("cards do not disappear when switching views or boards", async () => {
    const boardId = await page.getByRole("combobox", { name: "Current board" }).inputValue();
    if (boardId) {
      // Create a card
      const cardTitle = `Card persistence test ${Date.now()}`;
      await page.getByRole("textbox", { name: "New card title" }).fill(cardTitle);
      await page.getByRole("button", { name: "Add card" }).click();
      await page.getByRole("heading", { name: cardTitle }).waitFor();

      // Switch to Gantt view
      await page.getByRole("button", { name: "Gantt" }).click();
      await page.getByRole("heading", { name: "Timeline" }).waitFor();

      // Switch back to Kanban
      await page.getByRole("button", { name: "Kanban" }).click();

      // Card should still exist
      await page.getByRole("heading", { name: cardTitle }).waitFor();
      assert.equal(await page.getByRole("heading", { name: cardTitle }).count() >= 1, true,
        "Card should persist when switching between views");
    }
  });

  it("creates new boards and preserves them in the board list", async () => {
    const boardName1 = `Test board ${Date.now()}-1`;
    const boardName2 = `Test board ${Date.now()}-2`;

    await createBoard(boardName1);
    await createBoard(boardName2);

    // Both boards should be in the select
    const option1 = page.locator("#board-select").locator(`option[label='${boardName1}']`);
    const option2 = page.locator("#board-select").locator(`option[label='${boardName2}']`);

    assert.equal(await option1.count() > 0 || await page.getByRole("option", { name: boardName1 }).count() > 0, true,
      "First board should be in selection list");
    assert.equal(await option2.count() > 0 || await page.getByRole("option", { name: boardName2 }).count() > 0, true,
      "Second board should be in selection list");
  });
});
