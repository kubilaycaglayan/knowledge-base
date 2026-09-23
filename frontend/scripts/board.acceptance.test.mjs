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
const statuses = ["Backlog", "Pending", "In Progress", "Done"].map((name, index) => ({ id: `status-${index}`, name, position: index, archived: false }));
const dateOnly = (offset = 0) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
const cards = [{ id: "card-1", statusId: "status-0", title: "Ship timeline", body: "{}", priority: "HIGH", startDate: dateOnly(), dueDate: dateOnly(2), position: 0, archived: false, pathIds: ["path-1"], labelIds: [] }];

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
    else if (path === "/boards/board-1/cards") body = fixtureCards;
    else if (path === "/boards/board-1/cards/page") { const url = new URL(request.url()); const statusId = url.searchParams.get("statusId"); const cursor = Number(url.searchParams.get("cursor") || -1); const limit = Number(url.searchParams.get("limit") || 20); if (cursor >= 19) lazyPageRequests += 1; if (failPageOnce && cursor >= 19 && pageFailures++ === 0) { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary page failure" }) }); return; } const page = fixtureCards.filter((card) => card.statusId === statusId && !card.archived && card.position > cursor).sort((a, b) => a.position - b.position).slice(0, limit + 1); const more = page.length > limit; body = { items: more ? page.slice(0, limit) : page, nextCursor: more ? page[limit - 1].position : null }; }
    else if (path === "/boards/board-1/gantt") body = fixtureCards.filter((card) => !card.archived && (card.startDate || card.dueDate));
    else if (path === "/paths") body = [{ id: "path-1", name: "Product", color: "#12ab78", status: "ACTIVE" }, { id: "path-2", name: "Research", color: "#3366cc", status: "ACTIVE" }, { id: "path-archived", name: "Archived path", color: "#999999", status: "ARCHIVED" }];
    else if (path === "/labels") body = [];
    const cardRoute = path.match(/^\/boards\/board-1\/cards\/([^/]+)(?:\/(archive|restore|move))?$/);
    const routedCard = cardRoute && fixtureCards.find((card) => card.id === cardRoute[1]);
    if (method === "POST" && path === "/boards/board-1/cards") {
      const requestBody = request.postDataJSON();
      body = { ...requestBody, id: `card-${cards.length + 1}`, statusId: "status-0", position: cards.length, archived: false, pathIds: [], labelIds: [] };
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
    if (method === "PUT" && path === "/boards/board-1/statuses/order") {
      const ids = request.postDataJSON().ids;
      fixtureStatuses.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).forEach((status, index) => { status.position = index; });
      body = fixtureStatuses;
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
  return { context, page, getBoardArchiveRequests: () => boardArchiveRequests, getCardUpdateRequests: () => cardUpdateRequests, getCardMoveRequests: () => cardMoveRequests, getLazyPageRequests: () => lazyPageRequests };
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
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Ship timeline" }).count(), 1);
    assert.match(await page.locator(".timeline-bar").innerText(), /Ship timeline/);
    assert.equal(new URL(page.url()).searchParams.get("view"), "gantt");
  });

  it("writes the default timeline window into URL state when switching to Gantt", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("view"), "gantt");
    assert.match(url.searchParams.get("from") || "", /^\d{4}-\d{2}-\d{2}$/);
    assert.match(url.searchParams.get("to") || "", /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(await page.getByRole("textbox", { name: "Timeline start date" }).inputValue(), url.searchParams.get("from"));
    assert.equal(await page.getByRole("textbox", { name: "Timeline end date" }).inputValue(), url.searchParams.get("to"));
  });

  it("removes an edited out-of-window card from Gantt but keeps it in Kanban", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.locator(".timeline-bar", { hasText: "Ship timeline" }).click();
    await page.locator("input[name='startDate']").fill(dateOnly(40));
    await page.locator("input[name='dueDate']").fill(dateOnly(42));
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    await page.locator(".timeline-bar", { hasText: "Ship timeline" }).waitFor({ state: "detached" });
    assert.equal(await page.locator(".timeline-bar", { hasText: "Ship timeline" }).count(), 0);
    await page.getByRole("button", { name: "Kanban" }).click();
    await page.getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("reconciles moved, archived, and restored cards between Kanban and Gantt", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.getByRole("button", { name: "Kanban" }).click();
    await page.getByRole("button", { name: "Move card to next status" }).click();
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.locator(".timeline-row small").filter({ hasText: "Pending" }).waitFor();

    await page.getByRole("button", { name: "Kanban" }).click();
    await page.getByRole("button", { name: "Archive Ship timeline" }).click();
    await page.getByRole("alertdialog", { name: "Archive card?" }).getByRole("button", { name: "Archive" }).click();
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.locator(".board-empty").filter({ hasText: "No dated active cards" }).waitFor();

    await page.getByRole("button", { name: "Kanban" }).click();
    await page.getByRole("button", { name: "Show archived cards" }).click();
    await page.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.locator(".timeline-bar", { hasText: "Ship timeline" }).waitFor();
  });

  it("shows a newly created dated card after switching to Gantt", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("textbox", { name: "New card title" }).fill("Timeline from Kanban");
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByRole("heading", { name: "Timeline from Kanban" }).waitFor();
    await page.locator(".board-card", { hasText: "Timeline from Kanban" }).click();
    await page.locator("input[name='startDate']").fill(dateOnly(1));
    await page.locator("input[name='dueDate']").fill(dateOnly(3));
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.locator(".timeline-bar", { hasText: "Timeline from Kanban" }).waitFor();
  });

  it("keeps one card present through edit, move, archive, and restore", async (t) => {
    const { page } = await fixture(t);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Never disappears");
    await page.locator("input[name='startDate']").fill(dateOnly());
    await page.locator("input[name='dueDate']").fill(dateOnly(2));
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("heading", { name: "Never disappears" }).waitFor();
    await page.getByRole("button", { name: "Move card to next status" }).click();
    await page.locator(".kanban-column").nth(1).getByRole("heading", { name: "Never disappears" }).waitFor();
    await page.getByRole("button", { name: "Archive Never disappears" }).click();
    await page.getByRole("alertdialog", { name: "Archive card?" }).getByRole("button", { name: "Archive" }).click();
    await page.getByRole("button", { name: "Show archived cards" }).click();
    await page.getByText("Never disappears", { exact: true }).last().waitFor();
    await page.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("heading", { name: "Never disappears" }).waitFor();
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    assert.equal(await page.getByText("Never disappears", { exact: true }).count() >= 1, true);
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
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(", "));
  });

  it("passes axe checks on the desktop Gantt layout", async (t) => {
    const { page } = await fixture(t, 1280);
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(", "));
  });

  it("captures disposable Kanban and Gantt screenshots without repository artifacts", async (t) => {
    const { page } = await fixture(t, 390);
    const kanbanPath = join(screenshotDir, "kanban-mobile.png");
    const ganttPath = join(screenshotDir, "gantt-mobile.png");
    await page.screenshot({ path: kanbanPath, fullPage: true });
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    await page.screenshot({ path: ganttPath, fullPage: true });
    assert.equal(existsSync(kanbanPath), true);
    assert.equal(existsSync(ganttPath), true);
  });

  it("renders the first active path color as the card outliner accent", async (t) => {
    const { page } = await fixture(t);
    assert.equal(await page.locator(".board-card").first().evaluate((element) => getComputedStyle(element).borderInlineStartColor), "rgb(18, 171, 120)");
    await page.locator(".board-card").first().click();
    assert.equal(await page.getByRole("checkbox", { name: "Product" }).count(), 1);
    assert.equal(await page.getByRole("checkbox", { name: "Research" }).count(), 1);
    await page.getByRole("checkbox", { name: "Research" }).check();
    assert.equal(await page.getByRole("checkbox", { name: "Research" }).isChecked(), true);
    await page.getByRole("button", { name: "Save card" }).click();
  });

  it("does not expose archived paths or deleted BOARD labels in the editor", async (t) => {
    const { page } = await fixture(t);
    await page.locator(".board-card").first().click();
    assert.equal(await page.getByRole("checkbox", { name: "Archived path" }).count(), 0);
    assert.equal(await page.getByRole("group", { name: "Board labels" }).getByRole("checkbox").count(), 0);
  });

  it("restores board route state through browser history", async (t) => {
    const { page } = await fixture(t, 800);
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.goBack();
    assert.equal(new URL(page.url()).searchParams.get("view"), "kanban");
    await page.goForward();
    assert.equal(new URL(page.url()).searchParams.get("view"), "gantt");
  });

  it("resolves an invalid board query to the available board", async (t) => {
    const { page } = await fixture(t);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/board?board=missing-board&view=kanban`);
    await page.getByRole("heading", { name: "Boards" }).waitFor();
    await page.getByRole("combobox", { name: "Current board" }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "Current board" }).inputValue(), "board-1");
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
    await page.getByRole("button", { name: "Archived boards" }).click();
    await page.getByText("Product", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Restore" }).click();
    await page.waitForFunction(() => document.querySelector("#board-select")?.value === "board-1");
    assert.equal(await page.getByRole("combobox", { name: "Current board" }).inputValue(), "board-1");
    await page.getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("provides a compact add-board plus action", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Add board" }).click();
    assert.equal(await page.getByRole("textbox", { name: "New board name" }).evaluate((input) => document.activeElement === input), true);
  });

  it("renames the selected board without losing its active view", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Rename board" }).click();
    await page.getByRole("textbox", { name: "Board name", exact: true }).fill("Renamed board");
    await page.getByRole("button", { name: "Save board" }).click();
    await page.getByRole("option", { name: "Renamed board" }).waitFor({ state: "attached" });
    assert.equal(await page.getByRole("combobox", { name: "Current board" }).inputValue(), "board-1");
    assert.equal(await page.getByRole("heading", { name: "Ship timeline" }).count(), 1);
  });

  it("creates a blank-title card and safely protects unsaved edits", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("textbox", { name: "New card title" }).fill("");
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByRole("heading", { name: "Untitled card" }).waitFor();
    await page.locator(".board-card").last().click();
    assert.equal(await page.locator(".card-editor textarea[name=body]").count(), 0);
    assert.equal(await page.locator(".card-editor .ProseMirror").count(), 1);
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Unsaved change");
    await page.getByRole("button", { name: "Cancel" }).click();
    assert.equal(await page.getByRole("heading", { name: "Discard unsaved changes?" }).count(), 1);
    await page.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Unsaved change");
  });

  it("rejects a reversed card date range inline and keeps the editor open", async (t) => {
    const { page } = await fixture(t);
    await page.locator(".board-card").first().click();
    await page.locator("input[name='startDate']").fill("2026-04-10");
    await page.locator("input[name='dueDate']").fill("2026-04-05");
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("alert", { name: "Date range error" }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).count(), 1);
  });

  it("coalesces rapid card save submissions", async (t) => {
    const { page, getCardUpdateRequests } = await fixture(t);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Saved once");
    const save = page.getByRole("button", { name: "Save card" });
    const firstSave = save.click({ force: true });
    await save.dispatchEvent("click");
    await firstSave;
    await page.getByRole("heading", { name: "Saved once" }).waitFor();
    assert.equal(getCardUpdateRequests(), 1);
  });

  it("keeps a conflicted card editor open and allows a retry", async (t) => {
    const { page } = await fixture(t, 390, false, false, false, false, true);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Retry this save");
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("alert").filter({ hasText: "changed elsewhere" }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("heading", { name: "Retry this save" }).waitFor();
  });

  it("keeps a failed card save retryable without losing the draft", async (t) => {
    const { page } = await fixture(t, 390, false, false, false, false, true, 503);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Retry after outage");
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("alert").filter({ hasText: "Could not save card" }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Retry after outage");
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("heading", { name: "Retry after outage" }).waitFor();
  });

  it("shows timeout-specific editor feedback and keeps the draft retryable", async (t) => {
    const { page } = await fixture(t, 390, false, false, false, false, false, 409, false, 16000);
    await page.locator(".board-card").first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Timed out draft");
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByRole("alert").filter({ hasText: "The request timed out. Try again." }).waitFor({ timeout: 20000 });
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Timed out draft");
  });

  it("archives a card and restores it from the archived-card list", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Archive Ship timeline" }).click();
    await page.getByRole("alertdialog", { name: "Archive card?" }).waitFor();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
    await page.getByRole("button", { name: "Show archived cards" }).click();
    await page.getByText("Ship timeline", { exact: true }).last().waitFor();
    await page.getByRole("button", { name: "Restore" }).first().click();
    await page.getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("renames a status and moves a card with the keyboard alternative", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Rename Backlog" }).click();
    await page.getByRole("textbox", { name: "Rename Backlog" }).fill("Ready");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("heading", { name: "Ready" }).waitFor();
    await page.getByRole("button", { name: "Move card to next status" }).first().click();
    await page.locator(".kanban-column").nth(1).getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("reorders statuses with accessible icon actions", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Move Pending earlier" }).click();
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

  it("moves a card with touch tap and keyboard Enter alternatives", async (t) => {
    const { page } = await fixture(t, 390);
    const moveNext = page.getByRole("button", { name: "Move card to next status" }).first();
    await moveNext.tap();
    await page.locator(".kanban-column").nth(1).getByRole("heading", { name: "Ship timeline" }).waitFor();
    const movePrevious = page.getByRole("button", { name: "Move card to previous status" }).first();
    await movePrevious.focus();
    await movePrevious.press("Enter");
    await page.locator(".kanban-column").first().getByRole("heading", { name: "Ship timeline" }).waitFor();
  });

  it("reveals and restores archived statuses", async (t) => {
    const { page } = await fixture(t, 390, false, false, true);
    await page.getByRole("button", { name: "Show archived statuses" }).click();
    await page.getByRole("button", { name: "Restore Done status" }).click();
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
    await page.getByRole("button", { name: "Archive board" }).click();
    await page.getByRole("alertdialog", { name: "Archive board?" }).waitFor();
    assert.equal(getBoardArchiveRequests(), 0);
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    assert.equal(await page.getByRole("alertdialog").count(), 0);
    assert.equal(getBoardArchiveRequests(), 0);
    await page.getByRole("button", { name: "Archive board" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
    await page.getByRole("heading", { name: "Create your first board" }).waitFor();
    assert.equal(await page.locator(".board-card").count(), 0);
    assert.equal(getBoardArchiveRequests(), 1);
  });
});
