import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { createServer } from "vite";
import { chromium } from "playwright";

// Mocked API only: no real credentials, backend writes, or personal data.
let server, browser;
const pages = ["/", "/board", "/logs", "/notes", "/calendar", "/reports", "/paths", "/labels", "/settings"];
const today = new Date().toISOString().slice(0, 10);
const statuses = ["Backlog", "In Progress", "Done"].map((name, position) => ({ id: `status-${position}`, name, position, archived: false, cardSort: "MANUAL" }));
const card = { id: "card-1", statusId: "status-0", title: "Ship timeline", body: "{}", priority: "HIGH", startDate: today, dueDate: today, position: 0, archived: false, pathIds: [], labelIds: [] };

before(async () => { server = await createServer({ server: { host: "127.0.0.1", port: 0 } }); await server.listen(); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await server?.close(); });

async function fixture(t, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 390, colorScheme: "light", reducedMotion: "reduce" });
  t.after(() => context.close());
  const requests = [];
  await context.addInitScript(() => localStorage.setItem("know_token", "nav-test-token"));
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    requests.push(path);
    let body = [];
    if (path === "/time-entries") body = { sessions: [], page: 0, totalPages: 1, totalSessions: 0 };
    else if (path === "/boards") body = url.searchParams.get("archived") === "true" ? [] : [{ id: "board-1", name: "Product", archived: false }];
    else if (path === "/boards/board-1/statuses") body = statuses;
    else if (path === "/boards/board-1/cards/page") body = { items: url.searchParams.get("statusId") === "status-0" ? [card] : [], nextCursor: null };
    else if (path === "/boards/board-1/cards") body = url.searchParams.get("archived") === "true" ? [] : [card];
    else if (path === "/boards/board-1/gantt") body = [card];
    else if (path === "/timers/current") body = null;
    else if (path === "/timers/draft" || path === "/preferences" || path.startsWith("/reports")) body = {};
    await route.fulfill({ json: body });
  });
  const page = await context.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".dashboard-shell > header nav").waitFor();
  return { page, requests };
}

async function visit(page, path) {
  await page.evaluate((target) => { history.pushState({}, "", target); dispatchEvent(new PopStateEvent("popstate")); }, path);
  await page.waitForFunction((target) => location.pathname === target, path);
  await page.waitForTimeout(150);
}

async function openGantt(page) {
  const direct = page.getByRole("button", { name: "Gantt", exact: true });
  if (await direct.isVisible().catch(() => false)) await direct.click();
  else {
    await page.locator("button.board-tab-more").click();
    await page.locator('.board-more-menu [role^="menuitem"]', { hasText: /^Gantt/ }).click();
  }
  await page.locator(".board-page-gantt").waitFor();
  await page.waitForTimeout(150);
}

const header = (page) => page.locator(".dashboard-shell > header").evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, width: rect.width, marginBottom: getComputedStyle(element).marginBottom };
});

for (const width of [390, 1440]) it(`uses one nav bar size and a 10px bottom margin on every page at ${width}px`, async (t) => {
  const { page } = await fixture(t, width);
  const expected = await header(page);
  assert.equal(expected.marginBottom, "10px");
  for (const path of pages) {
    await visit(page, path);
    assert.deepEqual(await header(page), expected, `Nav bar on ${path} must match the other pages`);
  }
  await visit(page, "/board");
  await page.getByRole("button", { name: /Product/ }).first().waitFor();
  await openGantt(page);
  assert.deepEqual(await header(page), expected, "Nav bar in the Gantt view must match the other pages");
});

it("keeps the Gantt timeline full width while the nav bar stays standard", async (t) => {
  const { page } = await fixture(t, 1600);
  await visit(page, "/board");
  await page.getByRole("button", { name: /Product/ }).first().waitFor();
  await openGantt(page);
  const main = await page.locator(".dashboard-shell > main").evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(main > 1500, `Gantt main content must keep the full shell width: ${main}`);
  assert.equal((await header(page)).width, 1200);
});

it("navigates home from the logo without a page reload and reuses cached sessions", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  while (!requests.includes("/time-entries")) await page.waitForTimeout(50);
  await visit(page, "/logs");
  await page.evaluate(() => { window.__noReload = true; });
  const before = requests.filter((path) => path === "/time-entries").length;
  const brand = page.getByRole("link", { name: "Knowledge Base" });
  assert.equal(await brand.getAttribute("href"), "/");
  await brand.click();
  await page.waitForFunction(() => location.pathname === "/");
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__noReload), true, "Logo click must use client-side routing");
  assert.equal(requests.filter((path) => path === "/time-entries").length, before, "Returning home must reuse the cached sessions page");
});
