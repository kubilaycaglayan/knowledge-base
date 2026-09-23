import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

let server, browser;
const screenshotDir = mkdtempSync(join(tmpdir(), "knowledge-base-board-screenshots-"));
const board = { id: "board-1", name: "Product", archived: false };
const statuses = ["Backlog", "Pending", "In Progress", "Done"].map((name, index) => ({ id: `status-${index}`, name, position: index, archived: false, cardSort: "MANUAL" }));
const dateOnly = (offset = 0) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
const cards = [{ id: "card-1", statusId: "status-0", title: "Ship timeline", body: "{}", priority: "HIGH", startDate: dateOnly(), dueDate: dateOnly(2), position: 0, archived: false, pathIds: ["path-1"], labelIds: ["label-design", "label-docs", "label-research", "label-backend", "label-frontend", "label-ops"] }];
const boardLabels = [["label-design", "Design"], ["label-docs", "Docs"], ["label-research", "Research"], ["label-backend", "Backend"], ["label-frontend", "Frontend"], ["label-ops", "Operations"], ["label-bug", "Bug"]].map(([id, name]) => ({ id, name, color: null, scopes: ["BOARD"] }));

before(async () => { server = await createServer({ server: { host: "127.0.0.1", port: 0 } }); await server.listen(); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await server?.close(); });

async function fixture(t, width = 390, dense = false, failBoard = false, archivedStatus = false, archivedBoard = false, failCardUpdateOnce = false, failCardUpdateStatus = 409, failPageOnce = false, delayCardUpdateMs = 0) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 390, colorScheme: "light", reducedMotion: "reduce" });
  t.after(() => context.close());
  const fixtureCards = dense ? Array.from({ length: 21 }, (_, index) => ({ id: `dense-${index}`, statusId: "status-0", title: `Dense card ${index + 1}`, body: "{}", priority: "MEDIUM", position: index, archived: false, pathIds: [], labelIds: [] })) : cards.map((card) => ({ ...card }));
  const fixtureStatuses = statuses.map((status) => ({ ...status }));
  if (archivedStatus) fixtureStatuses[3].archived = true;
  let boardArchiveRequests = 0;
  let boardIsArchived = archivedBoard;
  let cardUpdateRequests = 0;
  let cardMoveRequests = 0;
  let cardUpdateFailures = 0;
  let pageFailures = 0;
  let lazyPageRequests = 0;
  const sortRequests = [];
  const timerStarts = [];
  let runningTimer = null;
  const firstPageRequests = [];
  await context.addInitScript(() => localStorage.setItem("know_token", "board-test-token"));
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let body = [];
    const request = route.request();
    const method = request.method();
    if (failBoard && path === "/boards/board-1/statuses") { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "offline" }) }); return; }
    if (path === "/boards") {
      const wantsArchived = new URL(request.url()).searchParams.get("archived") === "true";
      body = wantsArchived ? (boardIsArchived ? [{ ...board, archived: true }] : []) : (boardIsArchived ? [] : [board]);
    }
    else if (path === "/boards/board-1/statuses") body = fixtureStatuses;
    else if (path === "/boards/board-1/cards") { const wantsArchived = new URL(request.url()).searchParams.get("archived") === "true"; body = fixtureCards.filter((card) => Boolean(card.archived) === wantsArchived); }
    else if (path === "/boards/board-1/cards/page") { const url = new URL(request.url()); const statusId = url.searchParams.get("statusId"); const cursor = Number(url.searchParams.get("cursor") || -1); const limit = Number(url.searchParams.get("limit") || 20); if (cursor >= 19) lazyPageRequests += 1; if (cursor === -1) firstPageRequests.push(statusId); if (failPageOnce && cursor >= 19 && pageFailures++ === 0) { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary page failure" }) }); return; } const page = fixtureCards.filter((card) => card.statusId === statusId && !card.archived && card.position > cursor).sort((a, b) => a.position - b.position).slice(0, limit + 1); const more = page.length > limit; body = { items: more ? page.slice(0, limit) : page, nextCursor: more ? page[limit - 1].position : null }; }
    else if (path === "/boards/board-1/gantt") body = fixtureCards.filter((card) => !card.archived && (card.startDate || card.dueDate));
    else if (path === "/paths") body = [{ id: "path-1", name: "Product", color: "#12ab78", status: "ACTIVE" }, { id: "path-2", name: "Research", color: "#3366cc", status: "ACTIVE" }, { id: "path-archived", name: "Archived path", color: "#999999", status: "ARCHIVED" }];
    else if (path === "/labels") body = new URL(request.url()).searchParams.get("scope") === "BOARD" ? boardLabels : [];
    else if (path === "/timers/current") body = runningTimer;
    else if (path === "/timers/draft") body = {};
    if (method === "POST" && path === "/timers") { const input = request.postDataJSON(); timerStarts.push(input); runningTimer = { id: "timer-1", ...input, startedAt: new Date().toISOString(), running: true }; body = runningTimer; }
    if (method === "POST" && path === "/timers/timer-1/stop") { body = { ...runningTimer, running: false }; runningTimer = null; }
    const cardRoute = path.match(/^\/boards\/board-1\/cards\/([^/]+)(?:\/(archive|restore|move))?$/);
    const routedCard = cardRoute && fixtureCards.find((card) => card.id === cardRoute[1]);
    if (method === "POST" && path === "/boards/board-1/cards") {
      const requestBody = request.postDataJSON();
      body = { ...requestBody, id: `card-${cards.length + 1}`, statusId: requestBody.statusId || "status-0", position: fixtureCards.filter((card) => card.statusId === (requestBody.statusId || "status-0")).length, archived: false, pathIds: [], labelIds: [] };
      fixtureCards.push(body);
    }
    if (method === "POST" && path === "/boards/board-1/archive") {
      boardArchiveRequests += 1;
      boardIsArchived = true;
      body = { ...board, archived: true };
    }
    if (method === "POST" && path === "/boards/board-1/restore") {
      boardIsArchived = false;
      body = { ...board, archived: false };
    }
    if (method === "PUT" && path === "/boards/board-1") {
      board.name = request.postDataJSON().name;
      body = { ...board };
    }
    if (method === "POST" && cardRoute?.[2] === "archive" && routedCard) {
      routedCard.archived = true; body = routedCard;
    }
    if (method === "POST" && cardRoute?.[2] === "restore" && routedCard) {
      routedCard.archived = false; body = routedCard;
    }
    if (method === "POST" && cardRoute?.[2] === "move" && routedCard) {
      cardMoveRequests += 1;
      const requestBody = request.postDataJSON();
      routedCard.statusId = requestBody.statusId;
      routedCard.position = requestBody.position;
      body = routedCard;
    }
    if (method === "PUT" && cardRoute && !cardRoute[2] && routedCard) {
      cardUpdateRequests += 1;
      if (failCardUpdateOnce && cardUpdateFailures++ === 0) {
        await route.fulfill({ status: failCardUpdateStatus, contentType: "application/json", body: JSON.stringify({ message: failCardUpdateStatus === 409 ? "Card changed elsewhere" : "Temporary failure" }) });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayCardUpdateMs || 100));
      Object.assign(routedCard, request.postDataJSON());
      body = routedCard;
    }
    if (method === "PUT" && path === "/boards/board-1/statuses/status-0") {
      fixtureStatuses[0].name = request.postDataJSON().name;
      body = fixtureStatuses[0];
    }
    const sortRoute = path.match(/^\/boards\/board-1\/statuses\/([^/]+)\/sort$/);
    if (method === "PUT" && sortRoute) {
      const status = fixtureStatuses.find((item) => item.id === sortRoute[1]);
      status.cardSort = request.postDataJSON().cardSort;
      sortRequests.push(`${status.id}:${status.cardSort}`);
      body = status;
    }
    if (method === "PUT" && path === "/boards/board-1/statuses/order") {
      const ids = request.postDataJSON().ids;
      fixtureStatuses.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).forEach((status, index) => { status.position = index; });
      body = fixtureStatuses;
    }
    if (method === "POST" && path === "/boards/board-1/statuses/status-0/archive") {
      fixtureStatuses[0].archived = true;
      fixtureCards.filter((card) => card.statusId === "status-0" && !card.archived).forEach((card, index) => { card.statusId = "status-1"; card.position = index; });
      body = {};
    }
    if (method === "POST" && path === "/boards/board-1/statuses/status-3/restore") {
      fixtureStatuses[3].archived = false;
      body = fixtureStatuses[3];
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/board?board=board-1&view=kanban`);
  await page.getByRole("heading", { name: "Boards" }).waitFor();
  return { context, page, getBoardArchiveRequests: () => boardArchiveRequests, getCardUpdateRequests: () => cardUpdateRequests, getCardMoveRequests: () => cardMoveRequests, getLazyPageRequests: () => lazyPageRequests, sortRequests, firstPageRequests, timerStarts };
}

const selectedTab = (page) => page.locator(".board-tab.selected");
// The view switch and the Manage boards gear sit in the toolbar on wide
// screens and in the board menu (the tab bar's More button) on phones.
async function boardAction(page, name) {
  const direct = page.getByRole("button", { name, exact: true });
  if (await direct.isVisible().catch(() => false)) return direct.click();
  await page.locator("button.board-tab-more").click();
  await page.locator('.board-more-menu [role^="menuitem"]', { hasText: new RegExp(`^${name}`) }).click();
}
// The card editor saves itself; closing it flushes the pending save.
async function closeCard(page) {
  await page.getByRole("button", { name: "Close card" }).click();
  await page.locator(".card-editor").waitFor({ state: "detached" });
}

// Picks an inclusive range in the editor's date-range picker, paging months as needed.
async function pickCardDates(page, start, end) {
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

// Status and archival are changed from inside the card editor.
async function setCardStatus(page, title, status) {
  await page.locator(".board-card", { hasText: title }).click();
  await page.getByRole("combobox", { name: "Status" }).selectOption({ label: status });
  await closeCard(page);
}
async function archiveCardFromEditor(page, title) {
  await page.locator(".board-card", { hasText: title }).click();
  await page.getByRole("button", { name: "Archive card" }).click();
  await page.getByRole("alertdialog", { name: "Archive card?" }).getByRole("button", { name: "Archive" }).click();
  await page.locator(".card-editor").waitFor({ state: "detached" });
}

// Status management and board archival live in the board settings dialog,
// opened from the board's name in the Boards dialog behind the single gear.
async function openBoardSettings(page) {
  const name = (await page.locator(".board-tab.selected").innerText()).trim();
  await boardAction(page, "Manage boards");
  await page.getByRole("dialog", { name: "Boards" }).getByRole("button", { name, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Board settings" });
  await dialog.waitFor();
  return dialog;
}

// Archived items live on their own page, reached from the board footer.
async function openArchive(page) {
  const footer = page.locator("footer.board-footer");
  await footer.scrollIntoViewIfNeeded();
  await footer.getByRole("link", { name: "Archived items" }).click();
  await page.getByRole("heading", { name: "Archive", exact: true }).waitFor();
}
async function restoreFromArchive(page, label) {
  await openArchive(page);
  await page.getByRole("button", { name: `Restore ${label}` }).click();
  await page.getByRole("button", { name: `Restore ${label}` }).waitFor({ state: "detached" });
  await page.getByRole("link", { name: "Back to board" }).click();
  await page.getByRole("heading", { name: "Boards" }).waitFor();
}

describe("board browser acceptance", () => {
  it("does not expose board data before authentication", async (t) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    t.after(() => context.close());
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/board`);
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Boards" }).count(), 0);
  });

  it("renders the same dated card in Kanban and as a Gantt timeline bar", async (t) => {
    const { page } = await fixture(t);
    await boardAction(page, "Gantt");
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Ship timeline" }).count(), 1);
    assert.match(await page.locator(".timeline-bar").innerText(), /Ship timeline/);
    assert.equal(new URL(page.url()).searchParams.get("view"), "gantt");
  });

  it("writes the default timeline window into URL state when switching to Gantt", async (t) => {
    const { page } = await fixture(t);
    await boardAction(page, "Gantt");
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("view"), "gantt");
    assert.match(url.searchParams.get("from") || "", /^\d{4}-\d{2}-\d{2}$/);
    assert.match(url.searchParams.get("to") || "", /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(await page.getByRole("textbox", { name: "Timeline start date" }).inputValue(), url.searchParams.get("from"));
    assert.equal(await page.getByRole("textbox", { name: "Timeline end date" }).inputValue(), url.searchParams.get("to"));
  });

  it("restores Gantt date inputs when browser history changes the URL", async (t) => {
    const { page } = await fixture(t);
    await boardAction(page, "Gantt");
    const initialUrl = new URL(page.url());
    const initialFrom = initialUrl.searchParams.get("from");
    const initialTo = initialUrl.searchParams.get("to");
    await page.getByRole("button", { name: "Next timeline window" }).click();
    await page.waitForFunction((previousFrom) => new URL(location.href).searchParams.get("from") !== previousFrom, initialFrom);
    await page.goBack();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("view") === "gantt");
    assert.equal(await page.getByRole("textbox", { name: "Timeline start date" }).inputValue(), initialFrom);
    assert.equal(await page.getByRole("textbox", { name: "Timeline end date" }).inputValue(), initialTo);
  });

  it("removes an edited out-of-window card from Gantt but keeps it in Kanban", async (t) => {
    const { page } = await fixture(t);
    await boardAction(page, "Gantt");
    await page.locator(".timeline-bar", { hasText: "Ship timeline" }).click();
    await pickCardDates(page, dateOnly(40), dateOnly(42));
    await closeCard(page);
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    await page.locator(".timeline-bar", { hasText: "Ship timeline" }).waitFor({ state: "detached" });
    assert.equal(await page.locator(".timeline-bar", { hasText: "Ship timeline" }).count(), 0);
    await boardAction(page, "Kanban");
    await page.getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("reconciles moved, archived, and restored cards between Kanban and Gantt", async (t) => {
    const { page } = await fixture(t);
    await boardAction(page, "Gantt");
    await boardAction(page, "Kanban");
    await setCardStatus(page, "Ship timeline", "Pending");
    await boardAction(page, "Gantt");
    await page.locator(".timeline-row small").filter({ hasText: "Pending" }).waitFor();

    await boardAction(page, "Kanban");
    await archiveCardFromEditor(page, "Ship timeline");
    await boardAction(page, "Gantt");
    await page.locator(".board-empty").filter({ hasText: "No dated active cards" }).waitFor();

    await boardAction(page, "Kanban");
    await restoreFromArchive(page, "Ship timeline");
    await boardAction(page, "Gantt");
    await page.locator(".timeline-bar", { hasText: "Ship timeline" }).waitFor();
  });

  it("shows a newly created dated card after switching to Gantt", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Add card to Backlog" }).click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Timeline from Kanban");
    await pickCardDates(page, dateOnly(1), dateOnly(3));
    await closeCard(page);
    await boardAction(page, "Gantt");
    await page.locator(".timeline-bar", { hasText: "Timeline from Kanban" }).waitFor();
  });

  it("keeps one card present through edit, move, archive, and restore", async (t) => {
    const { page } = await fixture(t);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Never disappears");
    await pickCardDates(page, dateOnly(), dateOnly(2));
    await closeCard(page);
    await page.getByRole("heading", { name: "Never disappears" }).waitFor();
    await setCardStatus(page, "Never disappears", "Pending");
    await page.locator(".kanban-column").nth(1).getByRole("heading", { name: "Never disappears" }).waitFor();
    await archiveCardFromEditor(page, "Never disappears");
    await restoreFromArchive(page, "Never disappears");
    await page.getByRole("heading", { name: "Never disappears" }).waitFor();
    await boardAction(page, "Gantt");
    await page.locator(".timeline-bar", { hasText: "Never disappears" }).waitFor();
    assert.equal(await page.locator(".timeline-bar", { hasText: "Never disappears" }).count() >= 1, true);
  });

  it("keeps Kanban usable on mobile and passes axe checks", async (t) => {
    const { page } = await fixture(t);
    await page.locator(".kanban-column").first().waitFor();
    assert.equal(await page.locator(".kanban-column").count(), 4);
    assert.ok(await page.locator(".kanban").evaluate((element) => element.scrollWidth >= element.clientWidth));
    const results = await new AxeBuilder({ page }).analyze();
    assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(", "));
  });

  it("passes axe checks on the desktop board layout", async (t) => {
    const { page } = await fixture(t, 1280);
    const results = await new AxeBuilder({ page }).analyze();
    assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(", "));
  });

  it("passes axe checks on the mobile Gantt layout", async (t) => {
    const { page } = await fixture(t, 390);
    await boardAction(page, "Gantt");
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(", "));
  });

  it("passes axe checks on the desktop Gantt layout", async (t) => {
    const { page } = await fixture(t, 1280);
    await boardAction(page, "Gantt");
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(", "));
  });

  it("captures disposable Kanban and Gantt screenshots without repository artifacts", async (t) => {
    const { page } = await fixture(t, 390);
    const kanbanPath = join(screenshotDir, "kanban-mobile.png");
    const ganttPath = join(screenshotDir, "gantt-mobile.png");
    await page.screenshot({ path: kanbanPath, fullPage: true });
    await boardAction(page, "Gantt");
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    await page.screenshot({ path: ganttPath, fullPage: true });
    assert.equal(existsSync(kanbanPath), true);
    assert.equal(existsSync(ganttPath), true);
  });

  it("frames the card and its editor with the path color", async (t) => {
    const { page } = await fixture(t);
    const edges = (locator) => locator.evaluate((element) => { const style = getComputedStyle(element); return [style.borderTopColor, style.borderLeftColor, style.borderTopWidth, style.borderLeftWidth]; });
    assert.deepEqual(await edges(page.locator(".board-card").first()), ["rgb(18, 171, 120)", "rgb(18, 171, 120)", "6px", "6px"]);
    await page.locator(".board-card").first().click();
    // A card carries one path, so the editor offers a single-select dropdown.
    const pathSelect = page.locator("select[name='cardPaths']");
    assert.equal(await pathSelect.getAttribute("multiple"), null);
    assert.deepEqual(await pathSelect.locator("option").allInnerTexts(), ["No path", "Product", "Research"]);
    assert.equal(await pathSelect.inputValue(), "path-1");
    assert.deepEqual((await edges(page.locator(".card-editor"))).slice(0, 2), ["rgb(18, 171, 120)", "rgb(18, 171, 120)"]);
    await pathSelect.selectOption({ label: "Research" });
    assert.equal(await pathSelect.inputValue(), "path-2");
    await closeCard(page);
  });

  it("does not expose archived paths or deleted BOARD labels in the editor", async (t) => {
    const { page } = await fixture(t);
    await page.locator(".board-card").first().click();
    assert.equal(await page.locator("select[name='cardPaths']").locator("option", { hasText: "Archived path" }).count(), 0);
    await page.locator(".card-labels-picker input").click();
    const options = (await page.locator(".v-overlay-container .v-list-item-title").allInnerTexts()).map((name) => name.trim());
    assert.deepEqual(options.sort(), boardLabels.map((label) => label.name).sort(), "Only the live BOARD labels are offered");
  });

  it("restores board route state through browser history", async (t) => {
    const { page } = await fixture(t, 800);
    await boardAction(page, "Gantt");
    await page.goBack();
    assert.equal(new URL(page.url()).searchParams.get("view"), "kanban");
    await page.goForward();
    assert.equal(new URL(page.url()).searchParams.get("view"), "gantt");
  });

  it("resolves an invalid board query to the available board", async (t) => {
    const { page } = await fixture(t);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/board?board=missing-board&view=kanban`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();
    await selectedTab(page).waitFor();
    assert.equal(await selectedTab(page).textContent(), "Product");
    assert.equal(new URL(page.url()).searchParams.get("board"), "board-1");
  });

  it("shows an explicit empty state for an archived board query with no active boards", async (t) => {
    const { page } = await fixture(t, 390, false, false, false, true);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/board?board=archived-board&view=kanban`);
    await page.getByRole("heading", { name: "Create your first board" }).waitFor();
    assert.equal(await page.locator(".board-card").count(), 0);
  });

  it("restores an archived board and selects its cards", async (t) => {
    const { page } = await fixture(t, 390, false, false, false, true);
    await openArchive(page);
    await page.getByRole("button", { name: "Restore Product board" }).click();
    await page.getByRole("link", { name: "Back to board" }).click();
    await page.getByRole("heading", { name: "Boards" }).waitFor();
    await selectedTab(page).waitFor();
    assert.equal(await selectedTab(page).textContent(), "Product");
    await page.getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("opens a new-board dialog from the Boards dialog and returns there on Escape", async (t) => {
    const { page } = await fixture(t);
    assert.equal(await page.getByRole("textbox", { name: "New board name" }).count(), 0, "No inline board input on the page");
    assert.equal(await page.getByRole("button", { name: "Add board" }).count(), 0, "No Add board button on the page");
    await boardAction(page, "Manage boards");
    const manager = page.getByRole("dialog", { name: "Boards" });
    await manager.getByRole("button", { name: "Add board" }).click();
    const dialog = page.getByRole("dialog", { name: "New board" });
    await dialog.waitFor();
    assert.equal(await manager.count(), 0, "The Boards dialog gives way to New board");
    assert.equal(await dialog.getByRole("textbox", { name: "New board name" }).evaluate((input) => document.activeElement === input), true);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await manager.waitFor();
    assert.equal(await manager.getByRole("button", { name: "Add board" }).evaluate((button) => document.activeElement === button), true);
  });

  it("renames the selected board from board settings, without losing its active view", async (t) => {
    const { page } = await fixture(t);
    await selectedTab(page).click();
    assert.equal(await page.getByRole("textbox", { name: "Board name", exact: true }).count(), 0, "A tab click must not start a rename");
    const settings = await openBoardSettings(page);
    await settings.getByRole("textbox", { name: "Name", exact: true }).fill("Renamed board");
    await settings.getByRole("textbox", { name: "Name", exact: true }).press("Enter");
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await selectedTab(page).filter({ hasText: /^Renamed board$/ }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("board"), "board-1");
    assert.equal(new URL(page.url()).searchParams.get("view"), "kanban");
    assert.equal(await page.getByRole("heading", { name: "Ship timeline" }).count(), 1);
  });

  it("creates a blank-title card from a column and edits it in a flat editor", async (t) => {
    const { page } = await fixture(t);
    assert.equal(await page.getByRole("textbox", { name: "New card title" }).count(), 0, "No page-level add-card input");
    await page.getByRole("button", { name: "Add card to Pending" }).click();
    await page.locator(".kanban-column", { hasText: "Pending" }).locator('.board-card[aria-label="Untitled card"]').waitFor();
    assert.equal(await page.getByText("Untitled card").count(), 0, "No visible Untitled card placeholder");
    const editor = page.getByRole("dialog", { name: "Edit card" });
    assert.equal(await editor.locator("h2").count(), 0, "No Edit card heading");
    assert.equal(await editor.locator("label", { hasText: /^(Title|Body)$/ }).count(), 0, "Title and body are unlabelled");
    assert.equal(await editor.getByRole("button", { name: /Save card|Cancel/ }).count(), 0, "Edits save themselves");
    assert.equal(await editor.locator(".ProseMirror").count(), 1);
    assert.equal(await editor.getByRole("combobox", { name: "Status" }).inputValue(), "status-1");
  });

  it("autosaves edits and closes with Cmd/Ctrl+Enter from the body", async (t) => {
    const { page, getCardUpdateRequests } = await fixture(t);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Saved by itself");
    await page.locator(".card-editor .save-state").filter({ hasText: "Saved" }).waitFor();
    assert.equal(getCardUpdateRequests(), 1, "Rapid typing coalesces into one save");
    await page.getByRole("heading", { name: "Saved by itself" }).waitFor();

    await page.locator(".card-editor .ProseMirror").click();
    await page.keyboard.type("Body line");
    await page.keyboard.press("ControlOrMeta+Enter");
    await page.locator(".card-editor").waitFor({ state: "detached" });
    assert.equal(getCardUpdateRequests(), 2, "Closing flushes the pending body edit");
  });

  it("uses the note body line height and paragraph spacing in the card body", async (t) => {
    const { page } = await fixture(t);
    await page.locator(".board-card").first().click();
    await page.locator(".card-editor .ProseMirror").click();
    await page.keyboard.type("First line");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second line");
    const [lineHeight, fontSize, marginTop, marginBottom] = await page.locator(".card-editor .ProseMirror p").first().evaluate((element) => { const style = getComputedStyle(element); return [style.lineHeight, style.fontSize, style.marginTop, style.marginBottom].map(parseFloat); });
    assert.ok(Math.abs(lineHeight / fontSize - 1.45) < 0.02, `line-height ratio ${lineHeight / fontSize}`);
    assert.equal(marginTop, 0);
    assert.equal(marginBottom, 8);
  });

  it("shows the Archived items link without a border", async (t) => {
    const { page } = await fixture(t, 1280);
    const link = page.locator("footer.board-footer").getByRole("link", { name: "Archived items" });
    await link.waitFor();
    const borders = await link.evaluate((element) => { const style = getComputedStyle(element); return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]; });
    assert.deepEqual(borders, ["0px", "0px", "0px", "0px"]);
  });

  it("keeps the date picker open until OK and shows a single confirmed day once", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.locator(".board-card").first().click();
    const day = dateOnly(5);
    await page.getByRole("textbox", { name: "Card dates" }).click();
    const cell = page.locator(`.dp__menu [data-test-id="dp-${day}"]`).first();
    if (!(await cell.count())) await page.locator(".dp__menu").getByRole("button", { name: "Next month" }).click();
    await cell.click();
    await cell.click();
    assert.equal(await page.locator(".dp__menu").count(), 1, "Picking a range leaves the picker open");
    const okBox = await page.locator(".dp__menu").getByRole("button", { name: "OK" }).boundingBox();
    assert.ok(okBox.height >= 32 && okBox.width >= 44, `OK is a comfortable target (${okBox.width}x${okBox.height})`);
    await page.locator(".dp__menu").getByRole("button", { name: "OK" }).click();
    await page.locator(".dp__menu").waitFor({ state: "detached" });
    const input = page.getByRole("textbox", { name: "Card dates" });
    assert.doesNotMatch(await input.inputValue(), /–/, "A single day is not shown as a range");

    await input.click();
    await page.locator(".dp__menu").waitFor();
    const body = page.locator(".card-body-editor");
    const box = await body.boundingBox();
    await body.click({ position: { x: box.width - 20, y: box.height - 20 } });
    await page.locator(".dp__menu").waitFor({ state: "detached" });
    assert.equal(await page.locator(".card-editor").count(), 1, "An outside click closes only the picker");
  });

  it("confirms a single picked day without expecting a range end", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.locator(".board-card").first().click();
    const day = dateOnly(6);
    await page.getByRole("textbox", { name: "Card dates" }).click();
    const cell = page.locator(`.dp__menu [data-test-id="dp-${day}"]`).first();
    if (!(await cell.count())) await page.locator(".dp__menu").getByRole("button", { name: "Next month" }).click();
    await cell.click();
    await page.locator(".dp__menu").getByRole("button", { name: "OK" }).click();
    await page.locator(".dp__menu").waitFor({ state: "detached" });
    await page.locator(".card-editor .save-state").filter({ hasText: "Saved" }).waitFor();
    await closeCard(page);
    const [, month, date] = day.split("-").map(Number);
    const label = `${date} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]}`;
    await page.locator(".board-card .card-dates", { hasText: new RegExp(`^${label}`) }).first().waitFor();
    assert.doesNotMatch(await page.locator(".board-card .card-dates").first().textContent(), /–/);
  });

  it("keeps the card title at the top of the editor, level with the close button", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.locator(".board-card").first().click();
    const editor = page.locator(".card-editor");
    await editor.waitFor();
    assert.equal(await editor.evaluate((element) => getComputedStyle(element).paddingTop), "0px");
    const box = await editor.boundingBox();
    const title = await page.getByRole("textbox", { name: "Title", exact: true }).boundingBox();
    const close = await page.getByRole("button", { name: "Close card" }).boundingBox();
    assert.ok(title.y - box.y <= 12, `Title starts near the top (${title.y - box.y}px)`);
    assert.ok(Math.abs(title.y + title.height / 2 - (close.y + close.height / 2)) <= 2, "Close is vertically centred on the title");
    assert.ok(close.x > title.x + title.width - 1, "Close sits to the right of the title");
  });

  // CT-04
  it("starts a session from a card and hides every play button", async (t) => {
    const { page, timerStarts } = await fixture(t, 1280);
    const play = page.locator(".board-card").first().getByRole("button", { name: "Start a session for Ship timeline" });
    await play.waitFor();
    const card = await page.locator(".board-card").first().boundingBox();
    const box = await play.boundingBox();
    assert.ok(box.x + box.width >= card.x + card.width - 16 && box.y <= card.y + 16, "The play button sits at the card's top right");
    await play.click();
    await page.locator(".board-card-play").first().waitFor({ state: "detached" });
    assert.deepEqual(timerStarts, [{ pathId: "path-1", labelIds: [], description: "Ship timeline" }]);
    assert.equal(await page.locator(".card-editor").count(), 0, "Starting a session does not open the card");
    await page.getByRole("button", { name: "Stop timer" }).waitFor();

    await page.getByRole("button", { name: "Stop timer" }).click();
    await play.waitFor();
    await page.locator(".board-card").first().click();
    const header = page.locator(".card-editor-header");
    assert.deepEqual(await header.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))), ["Start a session for Ship timeline", "Close card"]);
  });

  it("darkens the play button in dark theme, on cards and in the tracker", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.locator(".board-card-play").first().waitFor();
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    const luminance = (color) => { const [r, g, b] = color.match(/\d+/g).slice(0, 3).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cardBackground = await page.locator(".board-card .board-card-play").first().evaluate((element) => getComputedStyle(element).backgroundColor);
    const trackerBackground = await page.getByRole("button", { name: "Start timer" }).evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.ok(luminance(cardBackground) < 80, `The card play button is dark (${cardBackground})`);
    assert.equal(trackerBackground, cardBackground, "The tracker shares the dark play button");
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    assert.equal(await page.getByRole("button", { name: "Start timer" }).evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(237, 248, 240)", "Light theme keeps the original play button");
  });

  for (const [width, height] of [[1280, 900], [390, 844]]) {
    it(`keeps columns equally tall, within the screen, and scrollable (${width}x${height})`, async (t) => {
      const { page } = await fixture(t, width, true);
      await page.locator(".board-card").first().waitFor();
      const columns = page.locator(".kanban-column");
      const heights = await columns.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
      assert.ok(heights.every((value) => Math.abs(value - heights[0]) <= 1), `Columns share one height: ${heights}`);
      const bottom = await columns.first().evaluate((item) => item.getBoundingClientRect().bottom);
      assert.ok(bottom <= height, `Columns end within the screen (${bottom} <= ${height})`);
      const dense = columns.first();
      assert.ok(await dense.evaluate((item) => item.scrollHeight > item.clientHeight), "The dense column overflows inside itself");
      await dense.evaluate((item) => { item.scrollTop = 200; });
      assert.ok(await dense.evaluate((item) => item.scrollTop > 0), "The hidden cards scroll into view");
      assert.equal(await dense.locator("header").evaluate((header) => getComputedStyle(header).position), "sticky", "The column header stays visible while scrolling");

      // A keyboard or an address bar shrinks the visible viewport; the columns follow.
      await page.setViewportSize({ width, height: height - 250 });
      await page.waitForFunction((limit) => document.querySelector(".kanban-column").getBoundingClientRect().bottom <= limit, height - 250);
    });
  }

  it("keeps short columns equal to the tallest one", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.locator(".board-card").first().waitFor();
    const heights = await page.locator(".kanban-column").evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
    assert.ok(heights.every((value) => value === heights[0]), `Columns share one height: ${heights}`);
  });

  it("searches and picks card labels, then shows them on the card", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.locator(".board-card").first().click();
    const input = page.locator(".card-labels-picker input");
    await input.click();
    await input.fill("bu");
    assert.equal(await input.evaluate((element) => getComputedStyle(element).outlineStyle), "none", "Only the field shows a focus ring, not the text inside it");
    const options = page.locator(".v-overlay-container .v-list-item-title");
    await page.waitForFunction(() => document.querySelectorAll(".v-overlay-container .v-list-item-title").length === 1);
    assert.deepEqual((await options.allInnerTexts()).map((name) => name.trim()), ["Bug"], "Typing searches the labels");
    await options.first().click();
    // Bug is the seventh label, so it joins the count rather than a visible chip.
    await page.locator(".card-labels-picker .card-labels-more", { hasText: /^\+\d+$/ }).waitFor();
    await page.waitForFunction(() => { const more = document.querySelector(".card-labels-picker .card-labels-more"); const chips = document.querySelectorAll(".card-labels-picker .card-labels-chip").length; return more && chips + Number(more.textContent.trim().slice(1)) === 7; });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".card-editor").count(), 1, "Escape closes the label menu before the editor");
    await page.locator(".card-editor .save-state").filter({ hasText: "Saved" }).waitFor();
    await closeCard(page);
    await page.locator(".board-card .board-card-label", { hasText: "Bug" }).waitFor();
  });

  it("keeps the label picker to one row with a count and lists selected labels first", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.locator(".board-card").first().click();
    const picker = page.locator(".card-labels-picker");
    await picker.locator(".card-labels-more").waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".card-labels-picker .card-labels-chip").length > 0);
    const field = await picker.locator(".v-field").boundingBox();
    assert.ok(field.height <= 40, `The picker does not grow (${field.height}px)`);
    const chips = await picker.locator(".card-labels-chip").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
    assert.ok(chips.length >= 1 && chips.length < 6, `Only the chips that fit are shown (${chips.length})`);
    assert.ok(chips.every((top) => Math.abs(top - chips[0]) < 1), "Chips stay on one row");
    assert.equal((await picker.locator(".card-labels-more").innerText()).trim(), `+${6 - chips.length}`);
    await picker.locator(".v-field").click();
    const options = (await page.locator(".v-overlay-container .v-list-item-title").allInnerTexts()).map((name) => name.trim());
    assert.deepEqual(options.slice(0, 6).sort(), ["Backend", "Design", "Docs", "Frontend", "Operations", "Research"], "Selected labels come first");
    assert.equal(options[6], "Bug");
  });

  it("turns off browser completions on the board's inputs", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.locator(".board-card").first().click();
    await page.locator(".card-labels-picker input").click();
    const fields = await page.locator("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea").evaluateAll((items) => items.map((item) => `${item.getAttribute("aria-label") || item.name || item.className}:${item.getAttribute("autocomplete")}`));
    assert.ok(fields.length >= 3, `Title, dates, and labels at least (${fields})`);
    assert.deepEqual(fields.filter((field) => !field.endsWith(":off")), [], "Every field opts out of browser completions");
  });

  it("keeps a card's labels to one compact row between priority and title", async (t) => {
    const { page } = await fixture(t, 1280);
    const card = page.locator(".board-card").first();
    const row = card.locator(".board-card-labels");
    await row.waitFor();
    const chips = await row.locator(".board-card-label").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
    assert.ok(chips.length > 1);
    assert.ok(chips.every((top) => Math.abs(top - chips[0]) < 1), "Every label sits on one row");
    const box = await row.boundingBox();
    assert.ok(box.height <= 24, `The label row is compact (${box.height}px)`);
    assert.ok(await row.evaluate((element) => element.scrollWidth >= element.clientWidth && getComputedStyle(element).overflow === "hidden"), "Extra labels are clipped, not wrapped");
    const priority = await card.locator(".priority").boundingBox();
    const title = await card.locator("h3").boundingBox();
    assert.ok(priority.y + priority.height <= box.y && box.y + box.height <= title.y, "Labels sit between the priority and the title");
  });

  it("moves the view switch and board settings into the board menu on phones", async (t) => {
    const { page } = await fixture(t, 390);
    await page.locator(".board-card").first().waitFor();
    assert.equal(await page.locator(".view-switch").isVisible().catch(() => false), false, "No view switch row on phones");
    assert.equal(await page.getByRole("button", { name: "Manage boards", exact: true }).count(), 0, "No gear on phones");
    const menuButton = page.getByRole("button", { name: "Board menu" });
    await menuButton.click();
    const menu = page.getByRole("menu", { name: "Board menu" });
    assert.deepEqual(await menu.locator('[role^="menuitem"]').evaluateAll((items) => items.map((item) => `${item.getAttribute("role")}:${item.textContent.trim()}:${item.getAttribute("aria-checked") ?? ""}`)), ["menuitemradio:Kanban:true", "menuitemradio:Gantt:false", "menuitem:Manage boards…:"]);
    await menu.getByRole("menuitemradio", { name: "Gantt" }).click();
    await menu.waitFor({ state: "detached" });
    await page.waitForFunction(() => new URL(location.href).searchParams.get("view") === "gantt");
    await menuButton.click();
    assert.equal(await menu.getByRole("menuitemradio", { name: "Gantt" }).getAttribute("aria-checked"), "true");
    await menu.getByRole("menuitem", { name: "Manage boards…" }).click();
    await page.getByRole("dialog", { name: "Boards" }).waitFor();
  });

  it("keeps the view switch and gear in the toolbar on wide screens", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.locator(".board-card").first().waitFor();
    assert.equal(await page.locator(".view-switch").isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "Manage boards", exact: true }).isVisible(), true);
    assert.equal(await page.locator("button.board-tab-more").count(), 0, "No menu when every board fits");
  });

  it("reports a failed action in a snackbar above the floating tracker", async (t) => {
    const { page, context } = await fixture(t, 390);
    await context.route("**/api/v1/timers", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.fallback()));
    await page.locator(".board-card-play").first().click();
    const snackbar = page.locator(".app-snackbar").filter({ hasText: "Could not start a session. Try again." });
    await snackbar.waitFor();
    assert.equal(await page.locator(".board-error").count(), 0, "Action errors do not use the inline banner");
    assert.equal(await snackbar.getByRole("status").count(), 1, "The snackbar is announced politely");
    const box = await snackbar.locator(".v-snackbar__wrapper").boundingBox();
    const tracker = await page.locator(".floating-tracker").boundingBox();
    assert.ok(box.y + box.height <= tracker.y - 4, `The snackbar sits above the tracker (${box.y + box.height} <= ${tracker.y})`);
    assert.ok(box.x >= 0 && box.x + box.width <= 390, "The snackbar fits the phone screen");
    await snackbar.getByRole("button", { name: "Dismiss message" }).click();
    await snackbar.waitFor({ state: "detached" });
  });

  it("sorts a column by priority from its header", async (t) => {
    const { page, sortRequests, firstPageRequests } = await fixture(t, 1280);
    await page.locator(".board-card").first().waitFor();
    const toggle = page.getByRole("button", { name: "Sort Backlog by priority" });
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    const reloadsBefore = firstPageRequests.filter((id) => id === "status-0").length;
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('button[aria-label="Sort Backlog by priority"]')?.getAttribute("aria-pressed") === "true");
    assert.deepEqual(sortRequests, ["status-0:PRIORITY"]);
    assert.equal(firstPageRequests.filter((id) => id === "status-0").length, reloadsBefore + 1, "Sorting reloads the column from its first page");
    await page.locator(".board-card").first().waitFor();
  });

  it("restores focus to the card after closing its editor", async (t) => {
    const { page } = await fixture(t);
    const card = page.locator(".board-card").first();
    await card.click();
    await page.keyboard.press("Escape");
    await page.waitForSelector(".card-editor", { state: "detached" });
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("board-card")), true);
  });

  it("warns before unloading a card with unsaved changes", async (t) => {
    const { page } = await fixture(t);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Unsaved navigation");
    const unloadResult = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented, returnValue: event.returnValue };
    });
    assert.equal(unloadResult.defaultPrevented || unloadResult.returnValue === "", true);
  });

  it("keeps a conflicted card editor open and allows a retry", async (t) => {
    const { page } = await fixture(t, 390, false, false, false, false, true);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Retry this save");
    await page.getByRole("alert").filter({ hasText: "changed elsewhere" }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Retry this save", "The draft is kept");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: "Retry this save" }).waitFor();
  });

  it("keeps a failed card save retryable without losing the draft", async (t) => {
    const { page } = await fixture(t, 390, false, false, false, false, true, 503);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Retry after outage");
    await page.getByRole("alert").filter({ hasText: "Could not save card" }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Retry after outage");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: "Retry after outage" }).waitFor();
  });

  it("shows timeout-specific editor feedback and keeps the draft retryable", async (t) => {
    const { page } = await fixture(t, 390, false, false, false, false, false, 409, false, 16000);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Timed out draft");
    await page.getByRole("alert").filter({ hasText: "The request timed out." }).waitFor({ timeout: 20000 });
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Timed out draft");
  });

  it("archives a card and restores it from the archive page", async (t) => {
    const { page } = await fixture(t);
    assert.deepEqual(await page.locator(".board-card").getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))), ["Start a session for Ship timeline"], "Cards carry only their play button");
    await page.locator(".board-card", { hasText: "Ship timeline" }).click();
    await page.getByRole("button", { name: "Archive card" }).click();
    await page.getByRole("alertdialog", { name: "Archive card?" }).waitFor();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
    await page.getByRole("heading", { name: "Ship timeline" }).waitFor({ state: "detached" });

    await openArchive(page);
    const restore = page.getByRole("button", { name: "Restore Ship timeline" });
    await restore.waitFor();
    // Only the archived card is listed; active cards stay on the board.
    assert.deepEqual(await page.locator(".archive-row strong").allInnerTexts(), ["Ship timeline"]);
    await restore.click();
    await page.getByRole("link", { name: "Back to board" }).click();
    await page.getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("renames a status in board settings and moves a card with the keyboard", async (t) => {
    const { page } = await fixture(t);
    const column = page.locator(".kanban-column").first();
    await column.getByRole("heading", { name: "Ship timeline" }).waitFor();
    assert.deepEqual(await column.locator("header button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))), ["Sort Backlog by priority", "Add card to Backlog"], "Columns only offer sorting and adding a card");
    const settings = await openBoardSettings(page);
    await settings.getByRole("textbox", { name: "Status name Backlog" }).fill("Ready");
    await settings.getByRole("textbox", { name: "Status name Backlog" }).press("Enter");
    await column.getByRole("heading", { name: "Ready" }).waitFor();
    await page.keyboard.press("Escape");
    await settings.waitFor({ state: "detached" });
    await setCardStatus(page, "Ship timeline", "Pending");
    await page.locator(".kanban-column").nth(1).getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("confirms status archival before sending the destructive request", async (t) => {
    const { page } = await fixture(t);
    await (await openBoardSettings(page)).getByRole("button", { name: "Archive Backlog status" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Archive status?" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    assert.equal(await page.getByRole("alertdialog", { name: "Archive status?" }).count(), 0);
  });

  it("reassigns cards when a status is archived", async (t) => {
    const { page } = await fixture(t);
    const settings = await openBoardSettings(page);
    await settings.getByRole("button", { name: "Archive Backlog status" }).click();
    await page.getByRole("alertdialog", { name: "Archive status?" }).getByRole("button", { name: "Archive" }).click();
    await settings.getByRole("textbox", { name: "Status name Backlog" }).waitFor({ state: "detached" });
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await page.locator(".kanban-column").nth(0).getByRole("heading", { name: "Pending" }).waitFor();
    await page.locator(".kanban-column").nth(0).getByRole("heading", { name: "Ship timeline" }).waitFor();
    // The archived status is listed on the archive page, not inline on the board.
    assert.equal(await page.locator(".archived-list").count(), 0);
    await openArchive(page);
    await page.getByRole("button", { name: "Restore Backlog status" }).waitFor();
  });

  it("reorders statuses by dragging their handle in board settings", async (t) => {
    const { page } = await fixture(t);
    const settings = await openBoardSettings(page);
    assert.equal(await settings.getByRole("button", { name: /^Move / }).count(), 0, "Arrows are replaced by drag handles");
    const handle = await settings.getByRole("button", { name: "Reorder Pending" }).boundingBox();
    const target = await settings.getByRole("button", { name: "Reorder Backlog" }).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + 4, { steps: 8 });
    await page.mouse.up();
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await page.locator(".kanban-column").first().locator("h2").filter({ hasText: "Pending" }).waitFor();
    assert.equal(await page.locator(".kanban-column").nth(0).locator("h2").innerText(), "Pending");
    assert.equal(await page.locator(".kanban-column").nth(1).locator("h2").innerText(), "Backlog");
  });

  it("moves an existing card with pointer drag and drop", async (t) => {
    const { page } = await fixture(t);
    await page.locator(".board-card").first().evaluate((card, target) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", card.getAttribute("data-card-id") || "card-1");
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
    }, await page.locator(".kanban-column").nth(1).elementHandle());
    await page.locator(".kanban-column").nth(1).getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("inserts a dragged card at the pointer target within its column", async (t) => {
    const { page } = await fixture(t, 390, true);
    const column = page.locator(".kanban-column").first();
    const first = column.locator(".board-card").nth(0);
    const second = column.locator(".board-card").nth(1);
    await first.evaluate((card, target) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", "dense-0");
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
    }, await second.elementHandle());
    await page.waitForFunction(() => document.querySelector(".kanban-column")?.querySelector(".board-card h3")?.textContent === "Dense card 2");
    assert.equal(await column.locator(".board-card h3").first().innerText(), "Dense card 2");
    assert.equal(await column.locator(".board-card h3").nth(1).innerText(), "Dense card 1");
  });

  it("moves a card with touch taps through the editor's status select", async (t) => {
    const { page } = await fixture(t, 390);
    await page.locator(".board-card", { hasText: "Ship timeline" }).tap();
    await page.getByRole("combobox", { name: "Status" }).selectOption({ label: "Pending" });
    await page.getByRole("button", { name: "Close card" }).tap();
    await page.locator(".kanban-column").nth(1).getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("reorders cards in a column with the keyboard alternative", async (t) => {
    const { page } = await fixture(t, 390, true);
    const column = page.locator(".kanban-column").first();
    const first = column.locator(".board-card").first();
    await first.focus();
    await page.keyboard.press("Alt+ArrowDown");
    await page.waitForFunction(() => document.querySelector(".kanban-column")?.querySelector(".board-card h3")?.textContent === "Dense card 2");
    assert.equal(await column.locator(".board-card h3").first().innerText(), "Dense card 2");
  });

  it("restores an archived status from the archive page", async (t) => {
    const { page } = await fixture(t, 390, false, false, true);
    await page.locator(".kanban-column").first().waitFor();
    assert.equal(await page.locator(".kanban-column").count(), 3, "The archived status is hidden from the board");
    await openArchive(page);
    await page.getByRole("button", { name: "Restore Done status" }).click();
    await page.getByRole("button", { name: "Restore Done status" }).waitFor({ state: "detached" });
    await page.getByRole("link", { name: "Back to board" }).click();
    await page.locator(".kanban-column").filter({ has: page.locator("h2", { hasText: "Done" }) }).waitFor();
  });

  it("loads a dense column in a 20-card page and exposes the next page", async (t) => {
    const { page } = await fixture(t, 800, true);
    await page.getByRole("heading", { name: "Dense card 1", exact: true }).waitFor();
    assert.equal(await page.locator(".kanban-column").first().locator(".board-card").count(), 20);
    assert.equal(await page.getByRole("button", { name: /Load more cards/ }).count(), 0);
    await page.locator(".load-more-sentinel").first().evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.getByRole("heading", { name: "Dense card 21" }).waitFor();
    assert.equal(await page.locator(".kanban-column").first().locator(".board-card").count(), 21);
  });

  it("keeps dense position order and ignores an invalid drop", async (t) => {
    const { page, getCardMoveRequests } = await fixture(t, 800, true);
    const cardsInColumn = page.locator(".kanban-column").first().locator(".board-card");
    await page.getByRole("heading", { name: "Dense card 20", exact: true }).waitFor();
    assert.deepEqual((await cardsInColumn.locator("h3").allTextContents()).slice(0, 20), Array.from({ length: 20 }, (_, index) => `Dense card ${index + 1}`));
    await page.locator(".kanban-column").nth(1).evaluate((element) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", "missing-card");
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
    });
    assert.equal(getCardMoveRequests(), 0);
    assert.equal(await cardsInColumn.count(), 20);
  });

  it("retries a failed lazy page without losing the existing cards", async (t) => {
    const { page } = await fixture(t, 800, true, false, false, false, false, 409, true);
    await page.getByRole("heading", { name: "Dense card 20", exact: true }).waitFor();
    await page.locator(".load-more-sentinel").first().evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.getByRole("button", { name: "Retry loading cards" }).waitFor();
    assert.equal(await page.locator(".kanban-column").first().locator(".board-card").count(), 20);
    await page.getByRole("button", { name: "Retry loading cards" }).click();
    await page.getByRole("heading", { name: "Dense card 21", exact: true }).waitFor();
  });

  it("coalesces duplicate lazy-page boundary requests in the browser", async (t) => {
    const { page, getLazyPageRequests } = await fixture(t, 800, true);
    const sentinel = page.locator(".load-more-sentinel").first();
    await sentinel.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await sentinel.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.getByRole("heading", { name: "Dense card 21", exact: true }).waitFor();
    assert.equal(getLazyPageRequests(), 1);
  });

  it("lets the user dismiss a recoverable board-load error", async (t) => {
    const { page } = await fixture(t, 390, false, true);
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "Dismiss board error" }).click();
    assert.equal(await page.getByRole("alert").count(), 0);
  });

  it("confirms board archival before sending the destructive request", async (t) => {
    const { page, getBoardArchiveRequests } = await fixture(t);
    assert.equal(await page.locator("footer.board-footer").getByRole("button").count(), 0, "Board archival is not a page-level control");
    const settings = await openBoardSettings(page);
    await settings.getByRole("button", { name: "Archive board" }).click();
    await page.getByRole("alertdialog", { name: "Archive board?" }).waitFor();
    assert.equal(getBoardArchiveRequests(), 0);
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    assert.equal(await page.getByRole("alertdialog").count(), 0);
    assert.equal(getBoardArchiveRequests(), 0);
    await settings.getByRole("button", { name: "Archive board" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
    await settings.waitFor({ state: "detached" });
    await page.getByRole("heading", { name: "Create your first board" }).waitFor();
    assert.equal(await page.locator(".board-card").count(), 0);
    assert.equal(getBoardArchiveRequests(), 1);
  });
});

// PB-28: every path owns a board; hiding it from the Paths page removes its tab.
describe("path boards", () => {
  async function pathBoardFixture(t) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
    t.after(() => context.close());
    const paths = [];
    const boards = [{ id: "custom-1", name: "Custom", archived: false, pathId: null, hidden: false, pinned: false }, { id: "custom-2", name: "Second", archived: false, pathId: null, hidden: false, pinned: false }];
    const boardStatuses = {};
    const boardCards = {};
    const visibilityRequests = [];
    const orderRequests = [];
    const statusesFor = (boardId) => (boardStatuses[boardId] ||= ["Backlog", "Pending", "In Progress", "Done"].map((name, index) => ({ id: `${boardId}-status-${index}`, name, position: index, archived: false })));
    await context.addInitScript(() => localStorage.setItem("know_token", "board-test-token"));
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace("/api/v1", "");
      const method = request.method();
      let body = [];
      let status = 200;
      let match;
      if (path === "/paths" && method === "POST") {
        const input = request.postDataJSON();
        const id = `path-${paths.length + 1}`;
        const board = { id: `board-${id}`, name: input.name, archived: false, pathId: id, hidden: false, pinned: false };
        boards.splice(0, 0, board);
        body = { id, name: input.name, description: input.description || null, color: input.color || "#12ab78", status: "ACTIVE", boardId: board.id, boardHidden: false };
        paths.push(body);
        status = 201;
      } else if (path === "/paths") body = paths.map((item) => ({ ...item, boardHidden: boards.find((board) => board.id === item.boardId).hidden }));
      else if (path === "/boards") body = url.searchParams.get("archived") === "true" ? [] : boards.filter((board) => url.searchParams.get("includeHidden") === "true" || !board.hidden);
      else if ((match = path.match(/^\/boards\/([^/]+)\/pin$/))) {
        const board = boards.find((item) => item.id === match[1]);
        board.pinned = request.postDataJSON().pinned;
        boards.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
        body = board;
      } else if (path === "/boards/order" && method === "PUT") {
        const ids = request.postDataJSON().ids;
        orderRequests.push(ids);
        const ordered = ids.map((id) => boards.find((item) => item.id === id));
        for (let index = 0, next = 0; index < boards.length; index += 1) if (ids.includes(boards[index].id)) boards[index] = ordered[next++];
        status = 204;
        body = "";
      } else if ((match = path.match(/^\/boards\/([^/]+)\/visibility$/))) {
        const board = boards.find((item) => item.id === match[1]);
        board.hidden = request.postDataJSON().hidden;
        visibilityRequests.push(request.postDataJSON());
        body = board;
      } else if ((match = path.match(/^\/boards\/([^/]+)\/statuses$/))) body = statusesFor(match[1]);
      else if ((match = path.match(/^\/boards\/([^/]+)\/cards\/page$/))) body = { items: (boardCards[match[1]] || []).filter((card) => card.statusId === url.searchParams.get("statusId")), nextCursor: null };
      else if ((match = path.match(/^\/boards\/([^/]+)\/cards$/)) && method === "POST") {
        const board = boards.find((item) => item.id === match[1]);
        const input = request.postDataJSON();
        const cards = (boardCards[board.id] ||= []);
        body = { id: `card-${board.id}-${cards.length + 1}`, statusId: input.statusId || statusesFor(board.id)[0].id, title: input.title || "", body: "{}", priority: "MEDIUM", position: cards.length, archived: false, pathIds: board.pathId ? [board.pathId] : [], labelIds: [], createdAt: "", updatedAt: "t1" };
        cards.push(body);
        status = 201;
      } else if ((match = path.match(/^\/boards\/([^/]+)\/cards\/([^/]+)$/)) && method === "PUT") {
        const card = boardCards[match[1]].find((item) => item.id === match[2]);
        Object.assign(card, request.postDataJSON(), { pathIds: card.pathIds });
        body = card;
      }
      await route.fulfill({ status, contentType: "application/json", body: status === 204 ? "" : JSON.stringify(body) });
    });
    const page = await context.newPage();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    return { page, origin, visibilityRequests, orderRequests };
  }

  it("creates a board with each path and hides it from the Paths page after confirmation", async (t) => {
    const { page, origin, visibilityRequests } = await pathBoardFixture(t);
    await page.goto(`${origin}/paths`);
    await page.getByRole("button", { name: "Add path" }).first().click();
    await page.getByRole("textbox", { name: "New path name" }).fill("Launch");
    await page.locator(".path-create-form").getByRole("button", { name: "Add path" }).click();
    await page.getByRole("heading", { name: "Launch" }).waitFor();

    await page.goto(`${origin}/board`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();
    const launchTab = page.locator(".board-tab", { hasText: "Launch" });
    await launchTab.waitFor();
    assert.equal(await page.locator(".board-tab-dot").count(), 1);

    await launchTab.click();
    await page.getByRole("button", { name: "Add card to Backlog" }).click();
    await page.locator(".card-editor").waitFor();
    assert.equal(await page.locator('.card-editor select[name="cardPaths"]').count(), 0);
    await page.getByRole("button", { name: "Close card" }).click();
    await page.locator(".card-editor").waitFor({ state: "detached" });

    await page.goto(`${origin}/paths`);
    await page.getByRole("button", { name: "Edit" }).first().click();
    const toggle = page.getByRole("switch", { name: "Show on board" });
    assert.equal(await toggle.isChecked(), true);
    await toggle.click();
    const dialog = page.locator(".prompt-dialog");
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Hide the “Launch” board\?/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    assert.equal(await toggle.isChecked(), true);
    assert.equal(visibilityRequests.length, 0);

    await toggle.click();
    await page.locator(".prompt-dialog").getByRole("button", { name: "Hide board" }).click();
    await page.getByText("Launch board is hidden").waitFor();
    assert.deepEqual(visibilityRequests, [{ hidden: true }]);

    await page.goto(`${origin}/board`);
    await page.locator(".board-tab", { hasText: "Custom" }).waitFor();
    assert.equal(await page.locator(".board-tab", { hasText: "Launch" }).count(), 0);
  });

  // PB-23, PB-24, PB-31: one gear opens the Boards dialog for pinning, ordering, and settings.
  it("pins, reorders, and opens settings from the Boards dialog", async (t) => {
    const { page, origin, orderRequests } = await pathBoardFixture(t);
    await page.goto(`${origin}/board`);
    await page.locator(".board-tab", { hasText: "Second" }).waitFor();
    assert.equal(await page.locator(".board-tab-settings").count(), 0);

    await boardAction(page, "Manage boards");
    const manager = page.getByRole("dialog", { name: "Boards" });
    await manager.getByRole("button", { name: "Reorder Second" }).press("ArrowUp");
    await page.waitForFunction(() => document.querySelector(".boards-manager-name")?.textContent?.trim() === "Second");
    assert.deepEqual(orderRequests.at(-1), ["custom-2", "custom-1"]);

    const handle = manager.getByRole("button", { name: "Reorder Custom" });
    const target = manager.getByRole("button", { name: "Reorder Second" });
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y - 4, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector(".boards-manager-name")?.textContent?.trim() === "Custom");
    assert.deepEqual(orderRequests.at(-1), ["custom-1", "custom-2"]);

    await manager.getByRole("button", { name: "Pin Second" }).click();
    await manager.getByRole("button", { name: "Unpin Second" }).waitFor();
    assert.equal((await manager.locator(".boards-manager-name").first().innerText()).trim(), "Second");

    await manager.getByRole("button", { name: "Custom", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Board settings" });
    await settings.waitFor();
    assert.equal(await settings.getByRole("textbox", { name: "Name", exact: true }).inputValue(), "Custom");

    await settings.getByRole("button", { name: "Back to boards" }).click();
    await manager.waitFor();
    assert.equal(await settings.count(), 0);
  });

  // Long board lists fit on screen: rows are dense on fine pointers, and dialogs cover the floating tracker.
  it("keeps Boards dialog rows compact and above the floating tracker", async (t) => {
    const { page, origin } = await pathBoardFixture(t);
    await page.goto(`${origin}/board`);
    await page.locator(".board-tab", { hasText: "Second" }).waitFor();
    const tracker = page.locator(".floating-tracker");
    await tracker.waitFor();

    await boardAction(page, "Manage boards");
    const manager = page.getByRole("dialog", { name: "Boards" });
    await manager.waitFor();
    const rows = await manager.locator(".boards-manager-list li").evaluateAll((items) => items.map((item) => item.getBoundingClientRect()));
    assert.ok(rows.length >= 2);
    for (const row of rows) assert.ok(row.height <= 32, `row height ${row.height}px should be at most 32px`);
    assert.ok(rows[1].top - rows[0].bottom <= 1, "rows should sit next to each other");

    const box = await tracker.boundingBox();
    const topmost = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest(".dialog-backdrop")), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    assert.ok(topmost, "the dialog backdrop should cover the floating tracker");
  });
});

// Board tabs never scroll sideways: the open board keeps a reserved first slot
// and boards that do not fit move into a More menu.
describe("board tab overflow", () => {
  const names = ["Launch plan", "Research", "Hiring", "A board with a rather long name for its tab", "Ops", "Marketing", "Design system", "Finance", "Legal", "Support", "Roadmap", "Infra", "Mobile", "Sales"];
  async function overflowFixture(t, width = 1280, touch = width <= 390) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, colorScheme: "light", reducedMotion: "reduce" });
    t.after(() => context.close());
    const boards = names.map((name, index) => ({ id: `board-${index}`, name, archived: false, pathId: null, hidden: false, pinned: false }));
    await context.addInitScript(() => localStorage.setItem("know_token", "board-test-token"));
    await context.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace("/api/v1", "");
      let body = [];
      if (path === "/boards") body = url.searchParams.get("archived") === "true" ? [] : boards;
      else if (/^\/boards\/[^/]+\/statuses$/.test(path)) body = [{ id: `${path.split("/")[2]}-status`, name: "Backlog", position: 0, archived: false, cardSort: "MANUAL" }];
      else if (/^\/boards\/[^/]+\/cards\/page$/.test(path)) body = { items: [], nextCursor: null };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/board`);
    await page.locator(".board-tab-current .board-tab").waitFor();
    return page;
  }
  const tabNames = (page) => page.locator(".board-tabs .board-tab").evaluateAll((tabs) => tabs.filter((tab) => tab.checkVisibility()).map((tab) => tab.textContent.trim()));

  for (const width of [1280, 390]) {
    it(`fits the tabs without sideways scrolling and lists the rest under More (${width}px)`, async (t) => {
      const page = await overflowFixture(t, width);
      const tabs = page.locator(".board-tabs");
      assert.ok(await tabs.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "Board tabs never scroll sideways");
      const more = page.getByRole("button", { name: /^More boards/ });
      await more.waitFor();
      const shown = await tabNames(page);
      assert.equal(shown[0], "Launch plan", "The open board comes first");
      await more.click();
      const menu = page.getByRole("menu", { name: "More boards" });
      // On phones the menu also holds the views and Manage boards…
      const hidden = (await menu.getByRole("menuitem").allInnerTexts()).map((text) => text.trim()).filter((text) => text !== "Manage boards…");
      assert.ok(hidden.length > 0);
      assert.deepEqual([...shown, ...hidden].sort(), [...names].sort(), "Every board is either a tab or in More, once");
      for (const tab of await page.locator(".board-tabs .board-tab").all()) {
        if (!(await tab.isVisible())) continue;
        const box = await tab.boundingBox();
        const bar = await tabs.boundingBox();
        assert.ok(box.x + box.width <= bar.x + bar.width + 1, "Visible tabs sit fully inside the bar");
      }
    });
  }

  for (const width of [390, 1280]) {
    it(`opens the More menu right under its button (${width}px)`, async (t) => {
      const page = await overflowFixture(t, width);
      const more = page.getByRole("button", { name: /^More boards/ });
      await more.click();
      const menu = page.getByRole("menu", { name: "More boards" });
      await menu.waitFor();
      const button = await more.boundingBox();
      const box = await menu.boundingBox();
      assert.ok(box.y >= button.y + button.height - 1 && box.y <= button.y + button.height + 8, `Menu top ${box.y} sits just below the button bottom ${button.y + button.height}`);
      assert.ok(Math.abs(box.x + box.width - (button.x + button.width)) <= 1, "Menu lines up with the button's right edge");
      assert.ok(box.x >= 0 && box.x + box.width <= width, "Menu stays on screen");
    });
  }

  it("does not leave a tapped-looking highlight on the tab that slides under a finger", async (t) => {
    const page = await overflowFixture(t, 820, true);
    const first = page.locator(".board-tab-list .board-tab").first();
    await first.tap();
    await page.waitForFunction(() => document.querySelector(".board-tab-current .board-tab")?.textContent?.trim() !== "Launch plan");
    const backgrounds = await page.locator(".board-tab-list .board-tab").evaluateAll((tabs) => tabs.map((tab) => getComputedStyle(tab).backgroundColor));
    assert.ok(backgrounds.every((color) => color === "rgba(0, 0, 0, 0)"), `Unselected tabs stay flat after a tap: ${backgrounds}`);
  });

  it("opens a board from More into the reserved first slot without shifting it", async (t) => {
    const page = await overflowFixture(t);
    const slot = page.locator(".board-tab-current");
    const before = await slot.boundingBox();
    await page.getByRole("button", { name: /^More boards/ }).click();
    const menu = page.getByRole("menu", { name: "More boards" });
    await menu.getByRole("menuitem", { name: "Sales" }).click();
    await menu.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.querySelector(".board-tab-current .board-tab")?.textContent?.trim() === "Sales");
    assert.equal(new URL(page.url()).searchParams.get("board"), "board-13");
    const after = await slot.boundingBox();
    assert.deepEqual([after.x, after.width], [before.x, before.width], "The reserved slot does not move or resize");
    assert.equal((await tabNames(page)).filter((name) => name === "Sales").length, 1);
    await page.getByRole("button", { name: /^More boards/ }).click();
    assert.ok((await menu.getByRole("menuitem").allInnerTexts()).every((text) => text.trim() !== "Sales"));
  });

  it("works the More menu from the keyboard and closes it on an outside click", async (t) => {
    const page = await overflowFixture(t);
    const more = page.getByRole("button", { name: /^More boards/ });
    await more.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "More boards" });
    await menu.waitFor();
    assert.equal(await more.getAttribute("aria-expanded"), "true");
    assert.equal(await menu.getByRole("menuitem").first().evaluate((item) => document.activeElement === item), true, "Opening focuses the first item");
    await page.keyboard.press("ArrowDown");
    assert.equal(await menu.getByRole("menuitem").nth(1).evaluate((item) => document.activeElement === item), true);
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    assert.equal(await more.evaluate((button) => document.activeElement === button), true, "Escape returns focus to More");

    await more.click();
    await menu.waitFor();
    await page.mouse.click(5, 600);
    await menu.waitFor({ state: "detached" });
  });

  it("shows a very long open board name truncated in its slot", async (t) => {
    const page = await overflowFixture(t);
    await page.getByRole("button", { name: /^More boards/ }).click();
    const item = page.getByRole("menu", { name: "More boards" }).getByRole("menuitem", { name: "A board with a rather long name for its tab" });
    if (await item.count()) await item.click();
    else await page.locator(".board-tabs .board-tab", { hasText: "A board with a rather long" }).click();
    const current = page.locator(".board-tab-current .board-tab");
    await page.waitForFunction(() => document.querySelector(".board-tab-current .board-tab")?.textContent?.includes("rather long"));
    assert.equal(await current.getAttribute("title"), "A board with a rather long name for its tab");
    assert.ok(await current.evaluate((element) => element.scrollWidth > element.clientWidth), "The long name is truncated");
  });
});
