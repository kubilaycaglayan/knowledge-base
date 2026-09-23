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
const consoleLog = [];
const isoDate = (value) => value.toISOString().slice(0, 10);
const timelineStart = isoDate(new Date());
const timelineEnd = isoDate(new Date(Date.now() + 2 * 86_400_000));

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
  context.setDefaultTimeout(10000);
  page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleLog.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (pageError) => consoleLog.push(`pageerror: ${pageError.message}`));
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

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Boards are tabs, so a tab is addressed by its exact visible name.
const boardTab = (name, target = page) => target.locator(".board-tab").filter({ hasText: new RegExp(`^${escapeRe(name)}$`) });
const selectedTab = (target = page) => target.locator(".board-tab.selected");
const currentBoardId = (target = page) => new URL(target.url()).searchParams.get("board");

// "Loading board…" is on screen while the store swaps boards; waiting it out
// keeps the next action from racing a half-loaded column set.
const boardSettled = () => page.waitForFunction(() => !/Loading board/.test(document.querySelector(".board-empty")?.textContent || ""));

// The app's time tracker is fixed to the bottom of the viewport, and it remounts
// when a focused field blurs. A control scrolled to the very bottom edge can
// therefore receive the tracker instead of the click, so centre it first.
async function clickCentered(locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: "center", inline: "center" }));
  await locator.click();
}

// Board settings open from the board's name in the Boards dialog behind the single gear.
async function openSettingsFor(name) {
  await clickCentered(page.getByRole("button", { name: "Manage boards" }));
  await page.getByRole("dialog", { name: "Boards" }).getByRole("button", { name, exact: true }).click();
}

// Every board name on the page: the visible tabs plus the More menu's items.
async function listedBoardNames() {
  const tabs = (await page.locator(".board-tabs .board-tab:not(.empty)").allInnerTexts()).map((name) => name.trim());
  const more = page.getByRole("button", { name: /^More boards/ });
  if (!(await more.count())) return tabs;
  await clickCentered(more);
  const menu = page.getByRole("menu", { name: "More boards" });
  const hidden = (await menu.getByRole("menuitem").allInnerTexts()).map((name) => name.trim());
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  return [...tabs, ...hidden];
}

// Tabs only switch boards, so clicking the open board's tab is skipped. Boards
// that do not fit in the tab bar are picked from the More menu.
async function clickBoardTab(name) {
  if (!(await selectedTab().filter({ hasText: new RegExp(`^${escapeRe(name)}$`) }).count())) {
    if (await boardTab(name).count()) await clickCentered(boardTab(name).first());
    else {
      await clickCentered(page.getByRole("button", { name: /^More boards/ }));
      await page.getByRole("menu", { name: "More boards" }).getByRole("menuitem", { name, exact: true }).click();
    }
    await selectedTab().filter({ hasText: new RegExp(`^${escapeRe(name)}$`) }).waitFor();
  }
  activeBoardName = name;
}

// `settle: false` for the delayed-response test, which switches boards on
// purpose while a board load is still pending.
async function selectBoard(name, { settle = true } = {}) {
  await clickBoardTab(name);
  if (settle) await boardSettled();
}

// Cards are added with the first column's header ＋, which creates a blank card
// and opens its editor; a title is then saved from the editor.
const clickAddCard = () => clickCentered(page.locator(".kanban-column").first().locator(".column-tools .add-card"));
async function submitCard(title) {
  await clickAddCard();
  const editor = page.locator(".card-editor");
  await editor.waitFor();
  if (title) await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await closeCard();
}

// The editor saves itself; closing it flushes the pending save first.
async function closeCard(target = page) {
  await target.getByRole("button", { name: "Close card" }).click();
  await target.locator(".card-editor").waitFor({ state: "detached" });
}

// Picks an inclusive range in the editor's date-range picker, paging months as needed.
async function pickCardDates(start, end) {
  await page.getByRole("textbox", { name: "Card dates" }).click();
  for (const date of [start, end]) {
    const cell = page.locator(`.dp__menu [data-test-id="dp-${date}"]`).first();
    for (let step = 0; step < 24 && !(await cell.count()); step += 1) {
      const shown = (await page.locator(".dp__menu .dp__calendar_item").nth(15).getAttribute("data-test-id")).slice(3, 10);
      await page.locator(".dp__menu").getByRole("button", { name: date.slice(0, 7) > shown ? "Next month" : "Previous month" }).click();
    }
    await cell.click();
    if (start === end) break;
  }
  // Picking dates never closes the picker; OK confirms them.
  await page.locator(".dp__menu").getByRole("button", { name: "OK" }).click();
  await page.locator(".dp__menu").waitFor({ state: "detached" });
}

// Reports what the board is actually showing when a card fails to appear,
// instead of a bare locator timeout.
async function addCard(title) {
  let posted = null;
  const postSeen = page
    .waitForResponse((response) => /\/api\/v1\/boards\/[^/]+\/cards$/.test(new URL(response.url()).pathname) && response.request().method() === "POST", { timeout: 8000 })
    .then((response) => { posted = `${response.status()}`; })
    .catch(() => { posted = "no POST sent"; });
  await submitCard(title);
  await postSeen;
  try {
    await (title ? page.getByRole("heading", { name: title }) : page.locator('.board-card[aria-label="Untitled card"]').first()).waitFor();
  } catch (cause) {
    const state = await page.evaluate(() => ({
      url: location.href,
      error: document.querySelector(".board-error")?.textContent || "",
      columns: document.querySelectorAll(".kanban-column").length,
      cards: document.querySelectorAll(".board-card h3").length,
      editorOpen: Boolean(document.querySelector(".card-editor")),
    }));
    throw new Error(`Card "${title}" never appeared (POST: ${posted}). Page: ${JSON.stringify(state)}. Console: ${JSON.stringify(consoleLog.slice(-5))}`, { cause });
  }
}

// Seeds cards straight over the API so pagination tests stay fast.
async function seedCards(boardId, count, prefix, priority = "MEDIUM") {
  await page.evaluate(async ({ boardId: id, count: total, prefix: label, priority: level }) => {
    const token = localStorage.getItem("know_token");
    for (let index = 0; index < total; index += 1) {
      const response = await fetch(`/api/v1/boards/${id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: `${label} card ${index}`, body: "{}", priority: level }),
      });
      if (!response.ok) throw new Error(`Seeding ${label} card ${index} failed with ${response.status}`);
    }
  }, { boardId, count, prefix, priority });
}

// Boards are created from the Boards dialog's Add board button; the New board
// dialog closes only once the store has created and loaded the new board.
async function createBoard(name) {
  await page.getByRole("button", { name: "Manage boards" }).click();
  await page.getByRole("dialog", { name: "Boards" }).getByRole("button", { name: "Add board" }).click();
  const dialog = page.getByRole("dialog", { name: "New board" });
  const field = dialog.getByRole("textbox", { name: "New board name" });
  await field.fill(name);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/v1/boards") && response.request().method() === "POST" && response.status() === 201),
    field.press("Enter"),
  ]);
  await dialog.waitFor({ state: "detached" });
  await selectedTab().filter({ hasText: new RegExp(`^${escapeRe(name)}$`) }).waitFor();
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
    const secondId = currentBoardId();
    await selectBoard(firstBoard);
    const firstId = currentBoardId();
    assert.equal(firstId !== null, true);
    assert.notEqual(firstId, secondId, "switching tabs must change the board route state");
    assert.equal(await selectedTab().textContent(), firstBoard);
  });

  it("does not let a delayed board response replace the newly selected board", async () => {
    const firstBoard = activeBoardName;
    const firstId = currentBoardId();
    const secondBoard = `${firstBoard} Delayed response ${Date.now()}`;
    await createBoard(secondBoard);
    const secondId = currentBoardId();
    await addCard("Second board card");

    let releaseFirstPage;
    const firstPageReleased = new Promise((resolve) => { releaseFirstPage = resolve; });
    let held = false;
    const heldPattern = `**/api/v1/boards/${firstId}/cards/page*`;
    await page.route(heldPattern, async (route) => {
      if (!held) {
        held = true;
        await firstPageReleased;
      }
      // The route may already be unhandled/handled by the time the hold is
      // released, and an unhandled rejection here fails the whole suite.
      await route.continue().catch(() => undefined);
    });
    try {
      await selectBoard(firstBoard, { settle: false });
      await page.waitForTimeout(100);
      await selectBoard(secondBoard, { settle: false });
      await page.getByRole("heading", { name: "Second board card" }).waitFor();
      assert.equal(currentBoardId(), secondId);
      assert.equal(await page.getByRole("heading", { name: "Second board card" }).count() >= 1, true);
    } finally {
      // Release and unroute even on failure: a still-held page request leaves
      // loadBoard() pending forever and hangs every later test on this page.
      releaseFirstPage();
      await page.unroute(heldPattern);
    }
  });

  it("protects a card from a stale concurrent tab write", async () => {
    const boardId = currentBoardId();
    await addCard("Concurrent card");

    const otherPage = await page.context().newPage();
    try {
      otherPage.setDefaultTimeout(10000);
      await otherPage.goto(`${baseUrl}/board?board=${boardId}`);
      await otherPage.getByRole("heading", { name: "Boards" }).waitFor();
      await otherPage.reload();
      await otherPage.getByRole("heading", { name: "Concurrent card" }).waitFor();

    await page.locator(".board-card", { hasText: "Concurrent card" }).click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("First tab wins");
    await closeCard();
    await page.getByRole("heading", { name: "First tab wins" }).waitFor();

    await otherPage.locator(".board-card", { hasText: "Concurrent card" }).click();
    await otherPage.getByRole("textbox", { name: "Title", exact: true }).fill("Stale second tab");
    await otherPage.getByRole("alert").filter({ hasText: "changed elsewhere" }).waitFor();
    assert.equal(await otherPage.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Stale second tab");
    } finally {
      await otherPage.close();
    }
  });

  it("creates a blank card and renders that card on the real Gantt timeline", async () => {
    await addCard("");
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Real timeline card");
    await pickCardDates(timelineStart, timelineEnd);
    await closeCard();
    const viewChange = page.waitForURL(/view=gantt/);
    await page.getByRole("button", { name: "Gantt" }).click();
    await viewChange;
    // Let the view switch's own Gantt load settle so the listener below can
    // only match the request made by the reloaded page.
    await page.waitForLoadState("networkidle");
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
    await addCard("Card with content");

    // Get all visible text
    const content = await page.textContent(".kanban");
    // Ensure no raw JSON objects appear in UI
    assert.equal(content.includes("{}"), false, "JSON object {} should not appear in rendered UI");
    assert.equal(content.includes('{"'), false, "Raw JSON should not appear in rendered UI");
  });

  it("provides error messages with dismissal capability", async () => {
    // beforeEach already leaves a fresh board open; force a real failure so the
    // error surface is exercised rather than skipped.
    await page.route("**/api/v1/boards/*/cards", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.continue()));
    try {
      await clickAddCard();
      const alert = page.getByRole("alert").filter({ hasText: "Could not create card." });
      await alert.waitFor();
      const dismiss = page.getByRole("button", { name: "Dismiss board error" });
      assert.equal(await dismiss.count(), 1, "Error messages must carry a close button");
      await dismiss.click();
      assert.equal(await alert.count(), 0, "Dismissing must remove the error");
    } finally {
      await page.unroute("**/api/v1/boards/*/cards");
    }
  });

  it("clears a standing error once the next action succeeds", async () => {
    await page.route("**/api/v1/boards/*/cards", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.continue()));
    try {
      await clickAddCard();
      await page.getByRole("alert").filter({ hasText: "Could not create card." }).waitFor();
    } finally {
      await page.unroute("**/api/v1/boards/*/cards");
    }

    await addCard("Recovered card");
    assert.equal(await page.getByRole("alert").filter({ hasText: "Could not create card." }).count(), 0, "A successful action must clear the previous error");
  });

  it("keeps Add board in the Boards dialog, not on the page", async () => {
    await page.goto(`${baseUrl}/board`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();

    assert.equal(await page.locator('button[aria-label="Add board"]').count(), 0, "No Add board button on the page");
    await page.getByRole("button", { name: "Manage boards" }).click();
    const manager = page.getByRole("dialog", { name: "Boards" });
    assert.equal(await manager.getByRole("button", { name: "Add board" }).count(), 1, "Boards dialog offers Add board");
    await manager.getByRole("button", { name: "Close boards" }).click();
  });

  it("keeps the Kanban/Gantt switch in the board toolbar", async () => {
    await page.goto(`${baseUrl}/board`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();

    const viewButtons = page.locator(".view-switch button");
    await viewButtons.first().waitFor();
    assert.equal(await viewButtons.count(), 2, "Should have Kanban and Gantt buttons");
    assert.deepEqual(await viewButtons.allTextContents(), ["Kanban", "Gantt"]);
    // The switch sits inside the toolbar that holds the board tabs, not in a
    // page-level menu, so it stays next to the cards it applies to.
    assert.equal(await page.locator(".board-toolbar .view-switch").count(), 1);
  });

  it("renames the open board from its settings, never from a tab click", async () => {
    const renamed = `${activeBoardName} Renamed`;
    await clickCentered(selectedTab());
    assert.equal(await page.getByRole("textbox", { name: "Board name", exact: true }).count(), 0, "Clicking a tab must not start a rename");

    await openSettingsFor(activeBoardName);
    const settings = page.getByRole("dialog", { name: "Board settings" });
    const field = settings.getByRole("textbox", { name: "Name", exact: true });
    assert.equal(await field.inputValue(), activeBoardName, "The field starts from the current name");
    await field.fill(renamed);
    await Promise.all([
      page.waitForResponse((response) => /\/api\/v1\/boards\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === "PUT" && response.status() === 200),
      field.press("Enter"),
    ]);
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await selectedTab().filter({ hasText: new RegExp(`^${escapeRe(renamed)}$`) }).waitFor();
    activeBoardName = renamed;

    // The rename survives a reload, so it really reached the server.
    await page.reload();
    await selectedTab().filter({ hasText: new RegExp(`^${escapeRe(renamed)}$`) }).waitFor();
  });

  it("edits another board's settings from the Boards dialog without switching to it", async () => {
    const other = activeBoardName;
    await createBoard(`${other} Open`);
    const open = activeBoardName;
    await openSettingsFor(other);
    const settings = page.getByRole("dialog", { name: "Board settings" });
    await settings.getByRole("textbox", { name: "Status name Backlog" }).waitFor();
    assert.equal(await selectedTab().textContent(), open, "Opening settings must not switch boards");

    await settings.getByRole("textbox", { name: "New status name" }).fill("Other only");
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/statuses") && response.request().method() === "POST" && response.status() === 201),
      settings.getByRole("textbox", { name: "New status name" }).press("Enter"),
    ]);
    await settings.getByRole("textbox", { name: "Status name Other only" }).waitFor();
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(await page.locator(".kanban-column h2", { hasText: "Other only" }).count(), 0, "The open board's columns are unchanged");

    await clickBoardTab(other);
    await boardSettled();
    await page.locator(".kanban-column").last().getByRole("heading", { name: "Other only" }).waitFor();
  });

  it("renames and adds statuses from the board settings dialog", async () => {
    const column = page.locator(".kanban-column").first();
    await column.waitFor();
    const original = (await column.locator("h2").textContent()).trim();
    assert.deepEqual(await column.locator("header button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))), [`Sort ${original} by priority`, `Add card to ${original}`], "Columns only offer sorting and adding a card");

    await openSettingsFor(activeBoardName);
    const settings = page.getByRole("dialog", { name: "Board settings" });
    await settings.waitFor();
    const field = settings.getByRole("textbox", { name: `Status name ${original}` });
    assert.equal(await field.inputValue(), original, "The field starts from the current name");

    const renamed = `${original} Ready`;
    await field.fill(renamed);
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/statuses/") && response.request().method() === "PUT" && response.status() === 200),
      field.press("Enter"),
    ]);
    await settings.getByRole("textbox", { name: "New status name" }).fill("Blocked");
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/statuses") && response.request().method() === "POST" && response.status() === 201),
      settings.getByRole("textbox", { name: "New status name" }).press("Enter"),
    ]);
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await column.getByRole("heading", { name: renamed }).waitFor();
    await page.locator(".kanban-column").last().getByRole("heading", { name: "Blocked" }).waitFor();

    await page.reload();
    await page.locator(".kanban-column").first().getByRole("heading", { name: renamed }).waitFor();
    await page.locator(".kanban-column").last().getByRole("heading", { name: "Blocked" }).waitFor();
  });

  it("sorts a column by priority on the server, past the first page, and keeps the sort", async () => {
    const boardId = currentBoardId();
    // Urgent cards sit after a full manual page, so only a server-side sort can surface them.
    await seedCards(boardId, 21, "Calm", "LOW");
    await seedCards(boardId, 2, "Fire", "URGENT");
    await page.reload();
    const column = page.locator(".kanban-column").first();
    await column.getByRole("heading", { name: "Calm card 0" }).waitFor();
    assert.equal(await column.getByRole("heading", { name: /^Fire card/ }).count(), 0, "Urgent cards start beyond the first manual page");

    const toggle = column.getByRole("button", { name: /^Sort .* by priority$/ });
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/sort") && response.request().method() === "PUT" && response.status() === 200),
      toggle.click(),
    ]);
    await column.getByRole("heading", { name: "Fire card 0" }).waitFor();
    const firstTitles = async () => (await column.locator(".board-card h3").allTextContents()).slice(0, 3);
    assert.deepEqual(await firstTitles(), ["Fire card 0", "Fire card 1", "Calm card 0"]);
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");

    await page.reload();
    await column.getByRole("heading", { name: "Fire card 0" }).waitFor();
    assert.deepEqual(await firstTitles(), ["Fire card 0", "Fire card 1", "Calm card 0"], "The sort is stored on the column");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  });

  it("lazy loads past the first page with a sentinel instead of a Load more button", async () => {
    // The page size is 20, so seed 25 cards over the API to reach a second page
    // without paying for 25 round trips through the form.
    const boardId = currentBoardId();
    await seedCards(boardId, 25, "Lazy");
    await page.reload();
    await page.getByRole("heading", { name: "Lazy card 0" }).waitFor();

    assert.equal(await page.getByText("Load more", { exact: false }).count(), 0, "Should not show a 'Load more' control");
    const sentinel = page.locator(".load-more-sentinel").first();
    await sentinel.waitFor({ state: "attached" });
    assert.equal(await sentinel.getAttribute("aria-hidden"), "true", "Lazy load sentinel should be aria-hidden");

    const column = page.locator(".kanban-column").first();
    assert.equal(await column.locator(".board-card").count(), 20, "The first page holds 20 cards");

    // Scrolling the sentinel into view is what loads the rest — no click needed.
    await sentinel.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll(".kanban-column")[0].querySelectorAll(".board-card").length === 25);
    assert.equal(await page.getByRole("heading", { name: "Lazy card 24" }).count(), 1);
  });

  it("offers path selection as a single-select dropdown, not a multiselect", async () => {
    await addCard("Card for path test");

    await page.locator(".board-card", { hasText: "Card for path test" }).click();
    await page.getByRole("dialog", { name: "Edit card" }).waitFor();

    const pathSelect = page.locator("select[name='cardPaths']");
    assert.equal(await pathSelect.count(), 1, "Paths must be picked from one dropdown");
    assert.equal(await pathSelect.getAttribute("multiple"), null, "The path dropdown must not be a multiselect");
    assert.equal(await page.locator("input[name='cardPaths']").count(), 0, "Paths must not be checkboxes");
    // "No path" is always offered so a card can be cleared of its path.
    assert.equal(await pathSelect.locator("option[value='']").count(), 1);

    await closeCard();
  });

  it("cards do not disappear when switching views or boards", async () => {
    const cardTitle = `Card persistence test ${Date.now()}`;
    await addCard(cardTitle);

    await page.getByRole("button", { name: "Gantt" }).click();
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    await page.getByRole("button", { name: "Kanban" }).click();
    await page.getByRole("heading", { name: cardTitle }).waitFor();

    // Switching away to another board and back must also keep the card.
    const origin = activeBoardName;
    await createBoard(`${origin} Sibling`);
    await selectBoard(origin);
    await page.getByRole("heading", { name: cardTitle }).waitFor();
    assert.equal(await page.getByRole("heading", { name: cardTitle }).count(), 1,
      "Card should persist across view and board switches");
  });

  it("creates new boards and preserves them in the board list", async () => {
    const boardName1 = `Test board ${Date.now()}-1`;
    const boardName2 = `Test board ${Date.now()}-2`;

    await createBoard(boardName1);
    await createBoard(boardName2);

    // Both boards stay available, as a tab or under More, and the newest one is open.
    await selectedTab().filter({ hasText: new RegExp(`^${escapeRe(boardName2)}$`) }).waitFor();
    let listed = await listedBoardNames();
    assert.equal(listed.filter((name) => name === boardName1).length, 1, "First board should stay in the board list");
    assert.equal(listed.filter((name) => name === boardName2).length, 1, "Second board should stay in the board list");
    assert.equal(await selectedTab().textContent(), boardName2);

    // The list survives a reload, so it comes from the server, not local state.
    await page.reload();
    await selectedTab().waitFor();
    listed = await listedBoardNames();
    assert.ok(listed.includes(boardName1) && listed.includes(boardName2));
  });

  it("archives a card from the board and restores it on the archive page", async () => {
    const boardId = currentBoardId();
    const cardTitle = `Archive round trip ${Date.now()}`;
    await addCard(cardTitle);

    await clickCentered(page.locator(".board-card", { hasText: cardTitle }));
    await page.getByRole("button", { name: "Archive card" }).click();
    await page.getByRole("alertdialog", { name: "Archive card?" }).waitFor();
    await clickCentered(page.getByRole("alertdialog").getByRole("button", { name: "Archive", exact: true }));
    try {
      await page.getByRole("heading", { name: cardTitle }).waitFor({ state: "detached" });
    } catch (cause) {
      const state = await page.evaluate(() => ({
        error: document.querySelector(".board-error")?.textContent || "",
        dialogOpen: Boolean(document.querySelector(".dialog-backdrop")),
        cards: document.querySelectorAll(".board-card h3").length,
      }));
      throw new Error(`Archiving "${cardTitle}" left it on the board. Page: ${JSON.stringify(state)}. Console: ${JSON.stringify(consoleLog.slice(-5))}`, { cause });
    }

    // The archive lives on its own page, reached from the end of the board.
    const footer = page.locator("footer.board-footer");
    await footer.scrollIntoViewIfNeeded();
    await clickCentered(footer.getByRole("link", { name: "Archived items" }));
    await page.waitForURL(/\/board\/archive/);
    await page.getByRole("heading", { name: "Archive", exact: true }).waitFor();
    assert.equal(currentBoardId(), boardId, "The archive page stays scoped to the board it came from");

    await page.getByRole("button", { name: `Restore ${cardTitle}` }).click();
    await page.getByRole("button", { name: `Restore ${cardTitle}` }).waitFor({ state: "detached" });

    await page.getByRole("link", { name: "Back to board" }).click();
    await page.waitForURL(/\/board\?/);
    await page.getByRole("heading", { name: cardTitle }).waitFor();
  });

  it("keeps archived listings off the board page itself", async () => {
    await page.getByRole("heading", { name: "Boards" }).waitFor();
    assert.equal(await page.locator(".archived-list").count(), 0, "Archived items belong on the archive page");
    for (const label of ["Show archived cards", "Show archived statuses", "Archived boards"]) {
      assert.equal(await page.getByRole("button", { name: label }).count(), 0, `"${label}" toggle should be gone`);
    }
    const footer = page.locator("footer.board-footer");
    assert.equal(await footer.count(), 1, "Archive controls sit in a footer at the end of the page");
    assert.equal(await footer.getByRole("link", { name: "Archived items" }).count(), 1);
    assert.equal(await footer.getByRole("button", { name: "Archive board" }).count(), 0, "Board archival lives in board settings");
  });

  it("keeps the archive footer clear of the fixed bottom tracker", async () => {
    await page.locator("footer.board-footer").waitFor();
    // A user reaches the last row by scrolling to the end of the page; a
    // footer that is only partly on screen would not be scrolled into view.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // The app pins its time tracker to the bottom of the viewport, so the last
    // row of the page must still receive its own clicks.
    const covering = await page.evaluate(() => {
      const results = [];
      for (const control of document.querySelectorAll("footer.board-footer a, footer.board-footer button")) {
        const box = control.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        if (!control.contains(hit)) results.push(`${control.getAttribute("aria-label")} covered by ${hit?.className || hit?.tagName}`);
      }
      return results;
    });
    assert.deepEqual(covering, [], "Archive footer controls must not be covered");
  });

  it("passes Axe on the archive page", async () => {
    await page.goto(`${baseUrl}/board/archive`);
    await page.getByRole("heading", { name: "Archive", exact: true }).waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(", "));
  });

  // PB-29: every path owns a board on the real stack.
  it("path boards: creates a tab per path, hides the path picker, and hides the board from Paths", async () => {
    const name = `Path board ${Date.now()}`;
    await page.goto(`${baseUrl}/paths`);
    await page.getByRole("button", { name: "Add path" }).first().click();
    await page.getByRole("textbox", { name: "New path name" }).fill(name);
    await page.locator(".path-create-form").getByRole("button", { name: "Add path" }).click();
    await page.getByRole("heading", { name }).waitFor();

    await page.goto(`${baseUrl}/board`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();
    await boardTab(name).waitFor();
    await selectBoard(name);
    assert.equal(await page.locator(".kanban-column h2").allInnerTexts().then((names) => names.join("|")), "Backlog|Pending|In Progress|Done");
    await clickAddCard();
    await page.locator(".card-editor").waitFor();
    assert.equal(await page.locator(".card-editor select[name='cardPaths']").count(), 0, "Path boards own their path");
    await closeCard();

    await page.goto(`${baseUrl}/paths`);
    const row = page.locator("li, article").filter({ has: page.getByRole("heading", { name }) }).last();
    await row.getByRole("button", { name: "Edit" }).click();
    const toggle = page.getByRole("switch", { name: "Show on board" });
    assert.equal(await toggle.isChecked(), true);
    await toggle.click();
    await page.locator(".prompt-dialog").getByRole("button", { name: "Hide board" }).click();
    await page.getByText(`${name} board is hidden`).waitFor();

    await page.goto(`${baseUrl}/board`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();
    await boardSettled();
    assert.equal(await boardTab(name).count(), 0);
  });
});

