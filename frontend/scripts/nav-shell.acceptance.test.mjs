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

async function fixture(t, width, { warmup = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 390, colorScheme: "light", reducedMotion: "reduce" });
  t.after(() => context.close());
  const requests = [];
  const reportQueries = [];
  const paths = [];
  await context.addInitScript(() => localStorage.setItem("know_token", "nav-test-token"));
  // Playwright sets navigator.webdriver, which turns the navigation warm-up off unless forced.
  if (warmup) await context.addInitScript(() => localStorage.setItem("know_warmup", "force"));
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const method = route.request().method();
    requests.push(path);
    let body = [];
    if (path === "/time-entries") body = { sessions: [], page: 0, totalPages: 1, totalSessions: 0 };
    else if (path === "/time-entries/s1") body = { id: "s1", pathId: null, labelIds: [], startedAt: "2026-10-01T09:00:00Z", endedAt: "2026-10-01T10:00:00Z", durationSeconds: 3600, description: "Browser direct session", source: "MANUAL" };
    else if (path === "/paths" && method === "POST") {
      body = { ...route.request().postDataJSON(), id: "path-1", status: "ACTIVE", pinned: false };
      paths.push(body);
    }
    else if (path === "/paths") body = paths;
    else if (path === "/paths/path-1/summary") body = { path: paths[0], trackedSeconds: 0, recentActivity: [] };
    else if (path === "/boards") body = url.searchParams.get("archived") === "true" ? [] : [{ id: "board-1", name: "Product", archived: false }];
    else if (path === "/boards/board-1/statuses") body = statuses;
    else if (path === "/boards/board-1/cards/page") body = { items: url.searchParams.get("statusId") === "status-0" ? [card] : [], nextCursor: null };
    else if (path === "/boards/board-1/cards") body = url.searchParams.get("archived") === "true" ? [] : [card];
    else if (path === "/boards/board-1/gantt") body = [card];
    else if (path === "/timers/current") body = null;
    else if (path === "/notes") body = { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 };
    else if (path === "/notes/n1") body = { id: "n1", title: "Browser deep link", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Loaded directly" }] }] }), contentText: "Loaded directly", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", version: 1, tags: [], pinned: false };
    else if (path.startsWith("/reports")) {
      reportQueries.push(url.searchParams.toString());
      body = { period: "WEEK", from: url.searchParams.get("startDate"), to: url.searchParams.get("endDate"), totalSeconds: 0, days: [], paths: [], sessionLabels: [], calendarLabels: [] };
    }
    else if (path === "/timers/draft" || path === "/preferences") body = {};
    const missingRecord = path === "/notes/gone" || path === "/time-entries/gone" || path === "/logs/gone" || path === "/paths/gone" || path.startsWith("/labels/gone/history");
    await route.fulfill({ status: missingRecord ? 404 : 200, json: missingRecord ? { message: "Not found" } : body });
  });
  const page = await context.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".dashboard-shell > header nav").waitFor();
  return { page, requests, reportQueries };
}

async function until(condition) {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(condition(), "Timed out waiting for the mocked request");
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
  const { page, requests } = await fixture(t, width);
  const expected = await header(page);
  assert.equal(expected.marginBottom, "10px");
  for (const path of pages) {
    await visit(page, path);
    assert.deepEqual(await header(page), expected, `Nav bar on ${path} must match the other pages`);
  }
  await visit(page, "/board");
  await page.locator(".board-page").waitFor();
  await page.getByRole("button", { name: "Gantt", exact: true }).or(page.locator("button.board-tab-more")).first().waitFor();
  await openGantt(page);
  assert.deepEqual(await header(page), expected, "Nav bar in the Gantt view must match the other pages");
});

it("keeps the Gantt timeline full width while the nav bar stays standard", async (t) => {
  const { page, requests } = await fixture(t, 1600);
  await visit(page, "/board");
  await page.locator(".board-page").waitFor();
  await page.getByRole("button", { name: "Gantt", exact: true }).or(page.locator("button.board-tab-more")).first().waitFor();
  await openGantt(page);
  const main = await page.locator(".dashboard-shell > main").evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(main > 1500, `Gantt main content must keep the full shell width: ${main}`);
  assert.equal((await header(page)).width, 1200);
});

it("navigates home from the logo without a page reload and reuses cached sessions", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await until(() => requests.includes("/time-entries"));
  await visit(page, "/logs");
  await page.evaluate(() => { window.__noReload = true; });
  const homeData = ["/time-entries", "/paths", "/labels"];
  const before = requests.filter((path) => homeData.includes(path)).length;
  const brand = page.getByRole("link", { name: "Knowledge Base" });
  assert.equal(await brand.getAttribute("href"), "/");
  await brand.click();
  await page.waitForFunction(() => location.pathname === "/");
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__noReload), true, "Logo click must use client-side routing");
  assert.equal(requests.filter((path) => homeData.includes(path)).length, before, "Returning home must reuse cached sessions, paths, and labels");
});

it("opens the Sessions workspace directly with its empty state and inline tracker", async (t) => {
  const { page } = await fixture(t, 1440);
  assert.equal(new URL(page.url()).pathname, "/");
  assert.equal(await page.title(), "Knowledge Base · Sessions");
  await page.getByRole("region", { name: "Sessions" }).waitFor();
  await page.getByText("No sessions recorded yet.", { exact: true }).waitFor();
  await page.locator(".floating-tracker-host.inline").waitFor();
});

it("redirects /sessions to the Sessions home and restores history with Back and Forward", async (t) => {
  const { page } = await fixture(t, 1440);
  await visit(page, "/logs");
  await page.locator(".logs-page").waitFor();

  await page.evaluate(() => { history.pushState({}, "", "/sessions"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForFunction(() => location.pathname === "/");
  await page.getByRole("region", { name: "Sessions" }).waitFor();

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.locator(".logs-page").waitFor();

  await page.goForward();
  await page.waitForFunction(() => location.pathname === "/");
  await page.getByRole("region", { name: "Sessions" }).waitFor();
});

it("creates a Path in the browser and reloads it from the API fixture", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await visit(page, "/paths");
  await page.locator(".paths-page").waitFor();
  await page.getByRole("button", { name: "Add path" }).click();
  await page.getByRole("textbox", { name: "New path name" }).fill("Reading");
  await page.locator("form.path-create-form button[type=submit]").click();
  await page.locator(".path-title", { hasText: "Reading" }).waitFor();
  assert.ok(requests.includes("/paths"));

  await page.reload();
  await page.locator(".path-title", { hasText: "Reading" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/paths");
});

it("restores report filters after navigation and browser Back/Forward", async (t) => {
  const { page } = await fixture(t, 1440);
  const search = "?startDate=2026-09-01&endDate=2026-09-07&aggregation=month";
  await page.evaluate((query) => {
    history.pushState({}, "", `/reports${query}`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, search);
  await page.waitForFunction(() => location.pathname === "/reports");
  await page.locator(".reports-page").waitFor();
  const assertReportQuery = async () => {
    await page.waitForFunction(() => location.pathname === "/reports" && new URLSearchParams(location.search).get("startDate") === "2026-09-01");
    const params = new URLSearchParams(new URL(page.url()).search);
    assert.equal(params.get("endDate"), "2026-09-07");
    assert.equal(params.get("aggregation"), "month");
  };
  await assertReportQuery();

  await page.locator('a[href="/logs"]').first().click();
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.locator(".logs-page").waitFor();
  await page.locator('a[href="/reports"]').first().click();
  await page.waitForFunction(() => location.pathname === "/reports");
  await page.locator(".reports-page").waitFor();
  await assertReportQuery();

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.goForward();
  await assertReportQuery();
});

it("loads report filters from a direct query URL and keeps them on reload", async (t) => {
  const { page, reportQueries } = await fixture(t, 1440);
  const query = "?startDate=2026-09-01&endDate=2026-09-07&aggregation=month";
  await page.goto(`${server.resolvedUrls.local[0]}reports${query}`);
  await page.locator(".reports-page").waitFor();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Report aggregation"]')?.value === "MONTH");
  assert.equal(new URL(page.url()).search, query);

  await page.reload();
  await page.locator(".reports-page").waitFor();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Report aggregation"]')?.value === "MONTH");
  assert.equal(new URL(page.url()).search, query);
  assert.ok(reportQueries.filter((value) => value.includes("startDate=2026-09-01") && value.includes("endDate=2026-09-07")).length >= 2);
});

it("keeps report date and total controls reachable on a phone viewport", async (t) => {
  const { page, reportQueries } = await fixture(t, 390);
  await page.goto(`${server.resolvedUrls.local[0]}reports`);
  await page.locator(".reports-page").waitFor();
  const dateRange = page.getByLabel("Report date range");
  await dateRange.waitFor();
  await dateRange.tap();
  const todayPreset = page.getByText("Today", { exact: true });
  await todayPreset.waitFor();
  await todayPreset.tap();
  await page.waitForFunction(() => {
    const params = new URL(location.href).searchParams;
    const today = new Date().toISOString().slice(0, 10);
    return params.get("startDate") === today && params.get("endDate") === today;
  });
  await page.getByRole("button", { name: "Previous date range" }).click();
  await page.waitForFunction(() =>
    new URL(location.href).searchParams.has("startDate"),
  );

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport,
    `Reports must not create horizontal page overflow: ${JSON.stringify(dimensions)}`,
  );
  const bounds = await Promise.all(
    [dateRange, page.locator(".total-display"), page.locator(".chart-frame")].map((locator) =>
      locator.boundingBox(),
    ),
  );
  assert.ok(
    bounds.every((box) => box && box.x >= 0 && box.x + box.width <= 390),
  );
  for (const name of ["Filter by paths", "Group by"]) {
    assert.equal(await page.getByRole("combobox", { name }).isVisible(), true);
  }
  const textBounds = await Promise.all(
    [dateRange, page.locator(".total-display")].map((locator) =>
      locator.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    ),
  );
  assert.ok(textBounds.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth));
  assert.ok(
    reportQueries.length >= 2,
    "the previous-range control must reload the report",
  );
});

it("selects a calendar range with touch taps and keyboard input", async (t) => {
  const phone = await fixture(t, 390);
  await phone.page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await phone.page.locator(".calendar-page").waitFor();
  const touchRangeButton = phone.page.getByRole("button", {
    name: "Start date range selection",
  });
  const touchRangeBounds = await touchRangeButton.boundingBox();
  assert.ok(touchRangeBounds && touchRangeBounds.height >= 44);
  await touchRangeButton.tap();
  await phone.page
    .getByRole("status")
    .filter({ hasText: "Choose a start date" })
    .waitFor();
  const phoneDays = phone.page.locator("button.calendar-day");
  await phoneDays.nth(8).tap();
  assert.equal(await phone.page.locator('button.calendar-day[aria-pressed="true"]').count(), 1);
  await phone.page
    .getByRole("status")
    .filter({ hasText: "Choose an end date" })
    .waitFor();
  await phoneDays.nth(10).tap();
  assert.equal(await phone.page.locator('button.calendar-day[aria-pressed="true"]').count(), 1);
  await phone.page.locator(".day-editor-heading h2").filter({ hasText: "–" }).waitFor();
  assert.equal(
    await phone.page.getByRole("button", { name: "Apply to range" }).isEnabled(),
    true,
  );

  const desktop = await fixture(t, 1440);
  await desktop.page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await desktop.page.locator(".calendar-page").waitFor();
  const startRange = desktop.page.getByRole("button", {
    name: "Start date range selection",
  });
  await startRange.focus();
  await desktop.page.keyboard.press("Enter");
  const desktopDays = desktop.page.locator("button.calendar-day");
  await desktopDays.nth(8).focus();
  await desktop.page.keyboard.press("Enter");
  await desktopDays.nth(10).focus();
  await desktop.page.keyboard.press("Space");
  await desktop.page.locator(".day-editor-heading h2").filter({ hasText: "–" }).waitFor();
  assert.equal(
    await desktop.page.getByRole("button", { name: "Apply to range" }).isEnabled(),
    true,
  );
});

it("opens a session detail when the browser loads its deep link directly", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}sessions/s1`);
  const dialog = page.getByRole("dialog");
  await dialog.filter({ hasText: "Browser direct session" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/sessions/s1");
});

it("shows an unavailable state for a missing session opened by browser deep link", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}sessions/gone`);
  const dialog = page.getByRole("dialog");
  await dialog.filter({ hasText: "This session doesn’t exist any more" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/sessions/gone");
});

it("shows an unavailable state for a missing log opened by browser deep link", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}logs/gone`);
  await page.getByRole("dialog").filter({ hasText: "This log doesn’t exist any more" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/logs/gone");
});

it("shows an unavailable state for a missing path opened by browser deep link", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}paths/gone`);
  await page.getByText("That path doesn’t exist any more").waitFor();
  assert.equal(new URL(page.url()).pathname, "/paths/gone");
});

it("shows an unavailable history state for a missing label deep link", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}labels/gone`);
  await page.getByRole("alert").filter({ hasText: "Could not load this label’s history." }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/labels/gone");
});

it("loads a note editor when the browser opens its deep link directly", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}notes/n1`);
  await page.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/notes/n1");
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), "Browser deep link");
  await page.getByRole("textbox", { name: "Note content" }).waitFor();
  assert.match(await page.getByRole("textbox", { name: "Note content" }).innerText(), /Loaded directly/);
});

it("shows an unavailable state for a missing note opened by browser deep link", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}notes/gone`);
  await page.getByRole("alert").filter({ hasText: "Unable to open this note." }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/notes/gone");
});

it("WU-10: warms the other pages once, then reloads inside the cooldown send no warm-up", async (t) => {
  const { page, requests } = await fixture(t, 1440, { warmup: true });
  const warmed = ["/notes", "/calendar/days", "/reports", "/logs"];
  const count = (path) => requests.filter((value) => value === path).length;
  await until(() => requests.includes("/logs"));
  for (const path of warmed) assert.equal(count(path), 1, `${path} must be warmed exactly once`);
  await until(() => requests.includes("/boards/all/gantt"));
  const boardRequests = () => requests.filter((path) => path.startsWith("/boards")).length;
  const warmedBoard = boardRequests();

  await visit(page, "/board");
  await page.locator(".board-page").waitFor();
  await page.getByRole("button", { name: "Gantt", exact: true }).or(page.locator("button.board-tab-more")).first().waitFor();
  await openGantt(page);
  assert.equal(boardRequests(), warmedBoard, "A warmed Board page and its Gantt view must not refetch boards");

  await visit(page, "/reports");
  await page.locator(".reports-page").waitFor();
  await page.waitForTimeout(300);
  assert.equal(count("/reports"), 1, "A warmed Reports page must not refetch its report");

  await visit(page, "/calendar");
  await page.waitForTimeout(300);
  assert.equal(count("/calendar/days"), 1, "A warmed Calendar must not refetch its month");

  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".dashboard-shell > header nav").waitFor();
  await page.waitForTimeout(6000);
  for (const path of warmed) assert.equal(count(path), 1, `A reload inside the cooldown must not warm ${path} again`);
});
