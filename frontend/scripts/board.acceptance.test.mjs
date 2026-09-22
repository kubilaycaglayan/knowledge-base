import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

let server, browser;
const board = { id: "board-1", name: "Product", archived: false };
const statuses = ["Backlog", "Pending", "In Progress", "Done"].map((name, index) => ({ id: `status-${index}`, name, position: index, archived: false }));
const cards = [{ id: "card-1", statusId: "status-0", title: "Ship timeline", body: "{}", priority: "HIGH", startDate: "2026-04-05", dueDate: "2026-04-07", position: 0, archived: false, pathIds: ["path-1"], labelIds: [] }];

before(async () => { server = await createServer({ server: { host: "127.0.0.1", port: 0 } }); await server.listen(); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await server?.close(); });

async function fixture(t, width = 390, dense = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  t.after(() => context.close());
  const fixtureCards = dense ? Array.from({ length: 21 }, (_, index) => ({ id: `dense-${index}`, statusId: "status-0", title: `Dense card ${index + 1}`, body: "{}", priority: "MEDIUM", position: index, archived: false, pathIds: [], labelIds: [] })) : cards.map((card) => ({ ...card }));
  const fixtureStatuses = statuses.map((status) => ({ ...status }));
  await context.addInitScript(() => localStorage.setItem("know_token", "board-test-token"));
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let body = [];
    const request = route.request();
    const method = request.method();
    if (path === "/boards") body = [board];
    else if (path === "/boards/board-1/statuses") body = fixtureStatuses;
    else if (path === "/boards/board-1/cards") body = fixtureCards;
    else if (path === "/boards/board-1/cards/page") { const url = new URL(request.url()); const statusId = url.searchParams.get("statusId"); const cursor = Number(url.searchParams.get("cursor") || -1); const limit = Number(url.searchParams.get("limit") || 20); const page = fixtureCards.filter((card) => card.statusId === statusId && !card.archived && card.position > cursor).sort((a, b) => a.position - b.position).slice(0, limit + 1); const more = page.length > limit; body = { items: more ? page.slice(0, limit) : page, nextCursor: more ? page[limit - 1].position : null }; }
    else if (path === "/boards/board-1/gantt") body = fixtureCards.filter((card) => !card.archived && (card.startDate || card.dueDate));
    else if (path === "/paths") body = [{ id: "path-1", name: "Product", color: "#12ab78", status: "ACTIVE" }];
    else if (path === "/labels") body = [];
    if (method === "POST" && path === "/boards/board-1/cards") {
      const requestBody = request.postDataJSON();
      body = { ...requestBody, id: `card-${cards.length + 1}`, statusId: "status-0", position: cards.length, archived: false, pathIds: [], labelIds: [] };
      fixtureCards.push(body);
    }
    if (method === "POST" && path === "/boards/board-1/cards/card-1/archive") {
      fixtureCards[0].archived = true; body = fixtureCards[0];
    }
    if (method === "POST" && path === "/boards/board-1/cards/card-1/restore") {
      fixtureCards[0].archived = false; body = fixtureCards[0];
    }
    if (method === "POST" && path === "/boards/board-1/cards/card-1/move") {
      const requestBody = request.postDataJSON();
      fixtureCards[0].statusId = requestBody.statusId;
      fixtureCards[0].position = requestBody.position;
      body = fixtureCards[0];
    }
    if (method === "PUT" && path === "/boards/board-1/statuses/status-0") {
      fixtureStatuses[0].name = request.postDataJSON().name;
      body = fixtureStatuses[0];
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/board?board=board-1&view=kanban`);
  await page.getByRole("heading", { name: "Boards" }).waitFor();
  return { context, page };
}

describe("board browser acceptance", () => {
  it("renders the same dated card in Kanban and as a Gantt timeline bar", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.getByRole("heading", { name: "Timeline" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Ship timeline" }).count(), 1);
    assert.match(await page.locator(".timeline-bar").innerText(), /Ship timeline/);
    assert.equal(new URL(page.url()).searchParams.get("view"), "gantt");
  });

  it("keeps Kanban usable on mobile and passes axe checks", async (t) => {
    const { page } = await fixture(t);
    assert.equal(await page.locator(".kanban-column").count(), 4);
    assert.ok(await page.locator(".kanban").evaluate((element) => element.scrollWidth >= element.clientWidth));
    const results = await new AxeBuilder({ page }).analyze();
    assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(", "));
  });

  it("renders the first active path color as the card outliner accent", async (t) => {
    const { page } = await fixture(t);
    assert.equal(await page.locator(".board-card").first().evaluate((element) => getComputedStyle(element).borderInlineStartColor), "rgb(18, 171, 120)");
  });

  it("restores board route state through browser history", async (t) => {
    const { page } = await fixture(t, 800);
    await page.getByRole("button", { name: "Gantt" }).click();
    await page.goBack();
    assert.equal(new URL(page.url()).searchParams.get("view"), "kanban");
    await page.goForward();
    assert.equal(new URL(page.url()).searchParams.get("view"), "gantt");
  });

  it("creates a blank-title card and safely protects unsaved edits", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("textbox", { name: "New card title" }).fill("");
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByRole("heading", { name: "Untitled card" }).waitFor();
    await page.locator(".board-card").last().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Unsaved change");
    await page.getByRole("button", { name: "Cancel" }).click();
    assert.equal(await page.getByRole("heading", { name: "Discard unsaved changes?" }).count(), 1);
    await page.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Unsaved change");
  });

  it("archives a card and restores it from the archived-card list", async (t) => {
    const { page } = await fixture(t);
    await page.getByRole("button", { name: "Archive Ship timeline" }).click();
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

  it("loads a dense column in a 20-card page and exposes the next page", async (t) => {
    const { page } = await fixture(t, 800, true);
    await page.getByRole("heading", { name: "Dense card 1", exact: true }).waitFor();
    assert.equal(await page.locator(".kanban-column").first().locator(".board-card").count(), 20);
    assert.equal(await page.getByRole("button", { name: /Load more cards/ }).count(), 0);
    await page.locator(".load-more-sentinel").first().evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.getByRole("heading", { name: "Dense card 21" }).waitFor();
    assert.equal(await page.locator(".kanban-column").first().locator(".board-card").count(), 21);
  });
});
