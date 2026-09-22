import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

let server, browser;
const board = { id: "board-1", name: "Product", archived: false };
const statuses = ["Backlog", "Pending", "In Progress", "Done"].map((name, index) => ({ id: `status-${index}`, name, position: index, archived: false }));
const cards = [{ id: "card-1", statusId: "status-0", title: "Ship timeline", body: "{}", priority: "HIGH", startDate: "2026-04-05", dueDate: "2026-04-07", position: 0, archived: false, pathIds: [], labelIds: [] }];

before(async () => { server = await createServer({ server: { host: "127.0.0.1", port: 0 } }); await server.listen(); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await server?.close(); });

async function fixture(t, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  t.after(() => context.close());
  await context.addInitScript(() => localStorage.setItem("know_token", "board-test-token"));
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let body = [];
    const request = route.request();
    const method = request.method();
    if (path === "/boards") body = [board];
    else if (path === "/boards/board-1/statuses") body = statuses;
    else if (path === "/boards/board-1/cards") body = cards;
    else if (path === "/boards/board-1/gantt") body = cards.filter((card) => !card.archived && (card.startDate || card.dueDate));
    else if (path === "/paths") body = [];
    else if (path === "/labels") body = [];
    if (method === "POST" && path === "/boards/board-1/cards") {
      const requestBody = request.postDataJSON();
      body = { ...requestBody, id: `card-${cards.length + 1}`, statusId: "status-0", position: cards.length, archived: false, pathIds: [], labelIds: [] };
      cards.push(body);
    }
    if (method === "POST" && path === "/boards/board-1/cards/card-1/archive") {
      cards[0].archived = true; body = cards[0];
    }
    if (method === "POST" && path === "/boards/board-1/cards/card-1/restore") {
      cards[0].archived = false; body = cards[0];
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
});
