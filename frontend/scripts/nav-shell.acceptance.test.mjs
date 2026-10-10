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
const searchResult = (id, type, title, snippet) => ({ id, type, title, snippet, at: "2026-10-01T10:00:00Z", date: null, archived: false, via: null, viaName: null, color: null, pathId: null, pathName: null, pathColor: null, boardId: null, boardName: null, statusName: null, endedAt: null, durationSeconds: null });

before(async () => { server = await createServer({ server: { host: "127.0.0.1", port: 0 } }); await server.listen(); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await server?.close(); });

async function fixture(t, width, { warmup = false, authenticated = true, rejectReportsAuth = false, calendarLabels = [], pathSeeds = [], themeSurfaces = false, noteSeeds = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 390, colorScheme: "light", reducedMotion: "reduce" });
  t.after(() => context.close());
  const requests = [];
  const reportQueries = [];
  const paths = [...pathSeeds];
  let notes = [...noteSeeds];
  const calendarDays = [];
  const preferences = { theme: "light", kanbanWide: false, ganttWide: false, recentPathIds: [] };
  let currentTimer = null;
  let pausedTimer = {};
  let rejectNextReportsRequest = rejectReportsAuth;
  if (authenticated) await context.addInitScript(() => {
    if (sessionStorage.getItem("nav_auth_seeded") !== "true") {
      localStorage.setItem("know_token", "nav-test-token");
      sessionStorage.setItem("nav_auth_seeded", "true");
    }
  });
  // Playwright sets navigator.webdriver, which turns the navigation warm-up off unless forced.
  if (warmup) await context.addInitScript(() => localStorage.setItem("know_warmup", "force"));
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const method = route.request().method();
    requests.push(path);
    const rejectedSession = rejectNextReportsRequest && path === "/reports";
    if (rejectedSession) rejectNextReportsRequest = false;
    let body = [];
    if (path === "/time-entries") body = { sessions: [], page: 0, totalPages: 1, totalSessions: 0 };
    else if (path === "/auth/login" && method === "POST") body = { token: "signed-in-nav-test-token" };
    else if (path === "/logs/log-deep-link") body = { id: "log-deep-link", body: "Directly loaded log entry", occurredAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, labelIds: [] };
    else if (path === "/logs") body = [];
    else if (path === "/time-entries/s1") body = { id: "s1", pathId: null, labelIds: [], startedAt: "2026-10-01T09:00:00Z", endedAt: "2026-10-01T10:00:00Z", durationSeconds: 3600, description: "Browser direct session", source: "MANUAL" };
    else if (path === "/paths" && method === "POST") {
      body = { ...route.request().postDataJSON(), id: "path-1", status: "ACTIVE", pinned: false };
      paths.push(body);
    }
    else if (path.startsWith("/paths/") && method === "PUT") {
      const id = path.split("/").at(-1);
      const index = paths.findIndex((item) => item.id === id);
      body = { ...paths[index], ...route.request().postDataJSON() };
      if (index >= 0) paths[index] = body;
    }
    else if (path === "/paths") body = paths;
    else if (path.startsWith("/paths/") && path.endsWith("/summary")) {
      const pathId = path.split("/")[2];
      body = { path: paths.find((item) => item.id === pathId), trackedSeconds: 0, recentActivity: [] };
    }
    else if (path.startsWith("/boards/") && path.endsWith("/visibility") && method === "POST") {
      const boardId = path.split("/")[2];
      const owner = paths.find((item) => item.boardId === boardId);
      if (owner) owner.boardHidden = route.request().postDataJSON().hidden;
      body = { id: boardId, name: owner?.name || "Product", pathId: owner?.id || null, archived: false, hidden: owner?.boardHidden || false };
    }
    else if (path === "/boards") {
      if (url.searchParams.get("archived") === "true") body = [];
      else {
        const pathBoards = paths
          .filter((item) => item.boardId && !item.boardHidden)
          .map((item) => ({ id: item.boardId, name: item.name, pathId: item.id, archived: false, hidden: false }));
        body = pathBoards.length ? pathBoards : [{ id: "board-1", name: "Product", archived: false }];
      }
    }
    else if (path === "/boards/board-1/statuses") body = statuses;
    else if (path === "/boards/board-1/cards/page") body = { items: url.searchParams.get("statusId") === "status-0" ? [card] : [], nextCursor: null };
    else if (path === "/boards/board-1/cards") body = url.searchParams.get("archived") === "true" ? [] : [card];
    else if (path === "/boards/board-1/gantt") body = [card];
    else if (path === "/timers" && method === "POST") {
      currentTimer = { id: "browser-timer", ...route.request().postDataJSON(), startedAt: new Date().toISOString(), running: true };
      body = currentTimer;
    }
    else if (path === "/timers/pause" && method === "POST") {
      pausedTimer = { ...currentTimer, pausedSeconds: 3 };
      currentTimer = null;
      body = pausedTimer;
    }
    else if (/^\/timers\/[^/]+\/stop$/.test(path) && method === "POST") {
      body = { id: currentTimer?.id, endedAt: new Date().toISOString(), running: false };
      currentTimer = null;
    }
    else if (path === "/timers/current") body = currentTimer;
    else if (path === "/labels" && method === "POST") {
      body = { id: `calendar-label-${calendarLabels.length + 1}`, ...route.request().postDataJSON() };
      calendarLabels.push(body);
    }
    else if (path === "/labels/label-deep-link/history") body = { labelId: "label-deep-link", name: "Deep link label", color: "#3B82F6", firstUsedAt: null, lastUsedAt: null, totalUses: 0, trackedSeconds: 0, uses: { sessions: 0, logs: 0, notes: 0, calendarDays: 0, cards: 0 }, timeline: [], hours: [], related: [] };
    else if (path === "/labels/label-deep-link/history/records") body = { items: [], hasMore: false };
    else if (path === "/labels") body = calendarLabels;
    else if (path === "/notes/order" && method === "PUT") {
      const { noteIds } = route.request().postDataJSON();
      notes = noteIds.map((id) => notes.find((item) => item.id === id)).filter(Boolean);
      body = notes;
    }
    else if (path === "/notes") body = { items: url.searchParams.get("archived") === "true" ? [] : notes, page: 0, size: 20, totalItems: notes.length, totalPages: notes.length ? 1 : 0 };
    else if (path === "/notes/n1") body = notes.find((note) => note.id === "n1") || { id: "n1", title: "Browser deep link", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Loaded directly" }] }] }), contentText: "Loaded directly", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", version: 1, tags: [], pinned: false };
    else if (path === "/notes/search-note") body = { id: "search-note", title: "Reports research note", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Opened from global search" }] }] }), contentText: "Opened from global search", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", version: 1, tags: [], pinned: false };
    else if (path === "/auth/me") body = { email: "nav-test@example.test", hasPassword: true, hasGoogle: false };
    else if (path === "/search") {
      const query = url.searchParams.get("q");
      const moreType = url.searchParams.get("types");
      const moreResults = query?.toLocaleLowerCase() === "more";
      const noteResults = moreType === "NOTE"
        ? [searchResult("more-note-2", "NOTE", "More note two", "Second note"), searchResult("more-note-3", "NOTE", "More note three", "Third note")]
        : moreType === "LOG"
          ? [searchResult("more-log-2", "LOG", "More log two", "Second log")]
          : [searchResult("more-note-1", "NOTE", "More note one", "First note")];
      const logResults = moreType === "LOG"
        ? [searchResult("more-log-2", "LOG", "More log two", "Second log")]
        : moreType === "NOTE"
          ? []
          : [searchResult("more-log-1", "LOG", "More log one", "First log")];
      const reportsResults = [
        [{ type: "NOTE", total: 1, capped: false, results: [{ ...searchResult("search-note", "NOTE", "Reports research note", "Found report draft"), via: "LABEL", viaName: "Reports label" }] }],
        [{ type: "LOG", total: 1, capped: false, results: [searchResult("search-log", "LOG", "Report export log", "Export completed")] }],
      ].flat();
      const groups = !query ? [] : moreResults
        ? moreType === "NOTE"
          ? [{ type: "NOTE", total: 3, capped: false, results: noteResults }]
          : moreType === "LOG"
            ? [{ type: "LOG", total: 2, capped: false, results: logResults }]
            : [{ type: "NOTE", total: 3, capped: false, results: noteResults }, { type: "LOG", total: 2, capped: false, results: logResults }]
        : reportsResults;
      body = { groups, fuzzy: false, incomplete: false };
    }
    else if (path.startsWith("/reports")) {
      reportQueries.push(url.searchParams.toString());
      const chartPath = { id: "theme-path", label: "Theme path", seconds: 3600, color: "#3b82f6" };
      const chartDay = { date: today, totalSeconds: 3600, paths: [chartPath] };
      body = { period: "WEEK", from: url.searchParams.get("startDate"), to: url.searchParams.get("endDate"), totalSeconds: themeSurfaces ? 3600 : 0, days: themeSurfaces ? [chartDay] : [], paths: themeSurfaces ? [chartPath] : [], sessionLabels: [], calendarLabels: [] };
    }
    else if (path === "/preferences" && method === "PUT") {
      Object.assign(preferences, route.request().postDataJSON());
      body = preferences;
    }
    else if (path === "/preferences") body = preferences;
    else if (path === "/timers/draft") body = pausedTimer;
    else if (path === "/calendar/days" && method === "GET") body = calendarDays;
    else if (path === "/calendar/days/range" && method === "PUT") body = [];
    else if (path.startsWith("/calendar/days/") && method === "PUT") {
      const payload = route.request().postDataJSON();
      const record = {
        date: path.split("/").at(-1),
        note: payload.note,
        labels: (payload.labels || []).map((assignment) => {
          const label = calendarLabels.find((item) => item.id === assignment.labelId);
          return {
            labelId: assignment.labelId,
            name: label?.name || assignment.labelId,
            color: label?.color || null,
            portion: assignment.portion,
          };
        }),
      };
      const index = calendarDays.findIndex((day) => day.date === record.date);
      if (index === -1) calendarDays.push(record);
      else calendarDays[index] = record;
      body = record;
    }
    const missingRecord = path === "/notes/gone" || path === "/time-entries/gone" || path === "/logs/gone" || path === "/paths/gone" || path.startsWith("/labels/gone/history");
    await route.fulfill({ status: rejectedSession ? 401 : missingRecord ? 404 : 200, json: rejectedSession ? { message: "Session expired" } : missingRecord ? { message: "Not found" } : body });
  });
  const page = await context.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  if (authenticated) await page.locator(".dashboard-shell > header nav").waitFor();
  else await page.locator(".auth").waitFor();
  return { page, requests, reportQueries, calendarLabels, paths };
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

it("keeps shell actions reachable without horizontal overflow at narrow, wide, and 50%-zoom-equivalent widths", async (t) => {
  const { page } = await fixture(t, 1440);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const width of [320, 390, 1280, 1920, 2880]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    assert.ok(layout.content <= layout.viewport, `${width}px layout overflows horizontally: ${layout.content}px > ${layout.viewport}px`);
    for (const link of await nav.getByRole("link").all()) {
      assert.equal(await link.isVisible(), true, `primary destination is hidden at ${width}px`);
      const rect = await link.boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= layout.viewport, `primary destination is outside the ${width}px viewport`);
    }
    assert.equal(await page.getByRole("link", { name: "Settings" }).isVisible(), true, `Settings is hidden at ${width}px`);
  }
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
  await page.getByRole("button", { name: "Start timer" }).waitFor();
  const pageHeadings = page.locator("main h1:visible");
  assert.equal(await pageHeadings.count(), 1);
  assert.equal((await pageHeadings.first().textContent())?.trim(), "Sessions");
  await page.locator(".floating-tracker-host.inline").waitFor();
});

it("keeps a running timer active after route navigation and browser reload", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.getByRole("textbox", { name: "Timer description" }).fill("Persist across views");
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.getByRole("button", { name: "Stop timer" }).waitFor();

  await visit(page, "/board");
  await page.locator(".board-page").waitFor();
  await page.getByRole("button", { name: "Stop timer" }).waitFor();
  await page.reload();
  await page.locator(".board-page").waitFor();
  await page.getByRole("button", { name: "Stop timer" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/board");
});

it("keeps a paused session understandable after route navigation and reload", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.getByRole("textbox", { name: "Timer description" }).fill("Paused browser session");
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.getByRole("button", { name: "Pause session" }).click();
  await page.getByText("Paused", { exact: true }).waitFor();

  await visit(page, "/board");
  await page.locator(".board-page").waitFor();
  await page.getByText("Paused", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Resume session" }).waitFor();
  await page.reload();
  await page.locator(".board-page").waitFor();
  await page.getByText("Paused", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Resume session" }).waitFor();
});

it("moves focus from the skip link to the main content", async (t) => {
  const { page } = await fixture(t, 1440);
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await skipLink.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.id === "main-content");
  assert.equal(new URL(page.url()).hash, "#main-content");
});

it("keeps every supported primary destination reachable at phone width", async (t) => {
  const { page } = await fixture(t, 390);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const links = nav.getByRole("link");
  const destinations = await links.evaluateAll((elements) => elements.map((element) => ({
    text: element.textContent?.trim().replace(/\s+/g, " "),
    href: element.getAttribute("href"),
    rect: element.getBoundingClientRect().toJSON(),
  })));
  assert.deepEqual(destinations.map(({ href }) => href), [
    "/board", "/logs", "/notes", "/calendar", "/reports", "/paths", "/labels",
  ]);
  for (const destination of destinations) {
    assert.ok(destination.rect.width > 0 && destination.rect.height >= 44, `${destination.text} has a phone-sized target`);
    assert.ok(destination.rect.left >= 0 && destination.rect.right <= 390, `${destination.text} stays within the phone viewport`);
  }
});

const reorderNotes = () => [
  { id: "note-a", title: "Browser note A", content: "{}", contentText: "First note", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, tags: [], pinned: false },
  { id: "note-b", title: "Browser note B", content: "{}", contentText: "Second note", createdAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", version: 1, tags: [], pinned: false },
];

it("reorders notes with a touch-sized control at phone width", async (t) => {
  const { page, requests } = await fixture(t, 390, { noteSeeds: reorderNotes() });
  await visit(page, "/notes");
  const moveDown = page.getByRole("button", { name: "Move Browser note A down" });
  const bounds = await moveDown.boundingBox();
  assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44);
  await moveDown.tap();
  await page.waitForFunction(() => [...document.querySelectorAll(".note-row strong")].map((item) => item.textContent).join() === "Browser note B,Browser note A");
  assert.ok(requests.includes("/notes/order"));
});

it("reorders notes with the keyboard on desktop", async (t) => {
  const { page, requests } = await fixture(t, 1440, { noteSeeds: reorderNotes() });
  await visit(page, "/notes");
  const moveDown = page.getByRole("button", { name: "Move Browser note A down" });
  await moveDown.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll(".note-row strong")].map((item) => item.textContent).join() === "Browser note B,Browser note A");
  assert.ok(requests.includes("/notes/order"));
});

it("renders every supported top-level route after a direct browser load", async (t) => {
  const { page } = await fixture(t, 1440);
  const routes = [
    ["/", ".session-list"],
    ["/sessions", ".session-list", "/"],
    ["/paths", ".paths-page"],
    ["/timeline", 'h1:text-is("Timeline")'],
    ["/logs", ".logs-page"],
    ["/reports", ".reports-page"],
    ["/calendar", ".calendar-page"],
    ["/imports", 'h1:text-is("Imports")'],
    ["/settings", ".settings-view"],
    ["/labels", ".labels-view"],
    ["/board", ".board-page"],
    ["/notes", ".notes-page"],
  ];

  for (const [path, selector, canonicalPath = path] of routes) {
    await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
    await page.locator(selector).waitFor();
    assert.equal(new URL(page.url()).pathname, canonicalPath);
  }
});

it("keeps protected deep-link content hidden while signed out and restores it after sign-in", async (t) => {
  const { page, requests } = await fixture(t, 1440, { authenticated: false });
  const query = "?startDate=2026-09-01&endDate=2026-09-07&aggregation=month";
  await page.goto(`${server.resolvedUrls.local[0]}reports${query}`);
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  assert.equal(await page.locator(".reports-page").count(), 0);
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 0);
  assert.match(await page.title(), /Knowledge Base.*Sign in/);

  await page.getByRole("textbox", { name: "Email" }).fill("nav-test@example.test");
  await page.getByRole("textbox", { name: "Password" }).fill("nav-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".reports-page").waitFor();

  assert.equal(new URL(page.url()).pathname, "/reports");
  assert.equal(new URL(page.url()).search, query);
  assert.ok(requests.includes("/auth/login"));
});

it("rejects external and protocol-relative post-login redirects", async (t) => {
  for (const redirect of ["https://outside.example/path", "//outside.example/path"]) {
    const { page } = await fixture(t, 1440, { authenticated: false });
    await page.goto(`${server.resolvedUrls.local[0]}reports?redirect=${encodeURIComponent(redirect)}`);
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    await page.getByRole("textbox", { name: "Email" }).fill("nav-test@example.test");
    await page.getByRole("textbox", { name: "Password" }).fill("nav-test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForFunction(() => location.pathname === "/");
    assert.equal(new URL(page.url()).origin, new URL(server.resolvedUrls.local[0]).origin);
    assert.equal(new URL(page.url()).pathname, "/");
  }
});

it("clears authentication on sign-out and keeps protected routes gated on Back and reload", async (t) => {
  const { page } = await fixture(t, 1440);
  await visit(page, "/reports");
  await page.locator(".reports-page").waitFor();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("know_token")), null);

  await page.goBack();
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/");
  assert.equal(await page.locator(".reports-page").count(), 0);

  await page.goto(`${server.resolvedUrls.local[0]}reports`);
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  assert.equal(await page.locator(".reports-page").count(), 0);
});

it("returns to sign-in after a saved session is rejected and permits authentication again", async (t) => {
  const { page } = await fixture(t, 1440, { rejectReportsAuth: true });
  await page.goto(`${server.resolvedUrls.local[0]}reports`);
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("know_token")), null);
  assert.equal(await page.locator(".reports-page").count(), 0);

  await page.getByRole("textbox", { name: "Email" }).fill("nav-test@example.test");
  await page.getByRole("textbox", { name: "Password" }).fill("nav-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".reports-page").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("know_token")), "signed-in-nav-test-token");
});

it("opens each primary navigation route and updates the active link and title", async (t) => {
  const { page } = await fixture(t, 1440);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const destinations = [
    ["Board", "/board", ".board-page", "Board"],
    ["Logs", "/logs", ".logs-page", "Logs"],
    ["Notes", "/notes", ".notes-page", "Notes"],
    ["Calendar", "/calendar", ".calendar-page", "Calendar"],
    ["Reports", "/reports", ".reports-page", "Reports"],
    ["Paths", "/paths", ".paths-page", "Paths"],
    ["Labels", "/labels", ".labels-view", "Labels"],
  ];

  for (const [label, path, selector, title] of destinations) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await page.waitForFunction((expected) => location.pathname === expected, path);
    await page.locator(selector).waitFor();
    const activeLink = nav.getByRole("link", { name: label, exact: true });
    assert.equal(await activeLink.getAttribute("aria-current"), "page");
    await page.waitForFunction((expected) => document.title === expected, `Knowledge Base · ${title}`);
  }

  await nav.getByRole("link", { name: "Board", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/board");
  await nav.getByRole("link", { name: "Logs", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/board");
  await page.waitForFunction(() => document.title === "Knowledge Base · Board");
  await page.goForward();
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.waitForFunction(() => document.title === "Knowledge Base · Logs");
});

it("downloads the Knowledge Base export from Settings in the browser", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await visit(page, "/settings");
  await page.getByRole("tab", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Knowledge Base CSV" }).click();
  const file = await download;
  assert.equal(file.suggestedFilename(), "knowledge-base-export.csv");
  await page.getByRole("status").filter({ hasText: "Your Knowledge Base export is ready." }).waitFor();
  assert.ok(requests.includes("/imports/knowledge-base/export"));
});

it("supports keyboard navigation and opening a primary link in a new tab", async (t) => {
  const { page } = await fixture(t, 1440);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const reportsLink = nav.getByRole("link", { name: "Reports", exact: true });
  await reportsLink.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.pathname === "/reports");
  await page.locator(".reports-page").waitFor();

  const calendarLink = nav.getByRole("link", { name: "Calendar", exact: true });
  const newTab = page.context().waitForEvent("page");
  await calendarLink.click({ modifiers: ["Control"] });
  const opened = await newTab;
  await opened.locator(".calendar-page").waitFor();
  assert.equal(new URL(opened.url()).pathname, "/calendar");
});

it("shows the floating tracker on eligible routes but not Sessions or focused phone inputs", async (t) => {
  const { page } = await fixture(t, 390);
  const floatingTracker = page.locator(".floating-tracker-host:not(.inline)");
  const eligibleRoutes = [
    "/board",
    "/logs",
    "/notes",
    "/calendar",
    "/reports",
    "/paths",
    "/labels",
  ];
  for (const path of eligibleRoutes) {
    await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
    await floatingTracker.waitFor();
    assert.equal(await floatingTracker.isVisible(), true, `${path} should show the floating tracker`);
  }

  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".session-list").waitFor();
  assert.equal(await floatingTracker.count(), 0, "Sessions home uses its inline tracker only");
  await page.goto(`${server.resolvedUrls.local[0]}sessions/s1`);
  await page.getByRole("dialog").filter({ hasText: "Browser direct session" }).waitFor();
  assert.equal(await floatingTracker.count(), 0, "Session detail must not show the floating tracker");

  await page.goto(`${server.resolvedUrls.local[0]}logs`);
  await floatingTracker.waitFor();
  const logInput = page.getByRole("textbox", { name: "Log text" });
  await logInput.focus();
  await floatingTracker.waitFor({ state: "detached" });
  assert.equal(await logInput.evaluate((element) => document.activeElement === element), true);
  assert.equal(await logInput.evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight), true);
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

it("opens path history when the browser loads its deep link directly", async (t) => {
  const { page, requests } = await fixture(t, 1440, {
    pathSeeds: [{ id: "path-deep-link", name: "Writing", status: "ACTIVE" }],
  });
  const appUrl = server.resolvedUrls.local[0];
  await page.goto(`${appUrl}paths/path-deep-link`);

  const history = page.locator(".path-history-dialog");
  await history.waitFor();
  assert.equal(new URL(page.url()).pathname, "/paths/path-deep-link");
  await history.getByRole("heading", { name: "Writing" }).waitFor();
  await history.getByText("No recent activity yet.", { exact: true }).waitFor();
  assert.ok(requests.includes("/paths/path-deep-link/summary"));
});

it("changes and persists an existing Path color using only the keyboard", async (t) => {
  const initialPath = {
    id: "path-edit",
    name: "Keyboard path",
    color: "#F8FAFC",
    description: "",
    status: "ACTIVE",
    pinned: false,
  };
  const { page, paths } = await fixture(t, 1440, { pathSeeds: [initialPath] });
  page.setDefaultTimeout(4000);
  await visit(page, "/paths");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editColorButton = page.getByRole("button", { name: "Choose edit path color" });
  await editColorButton.click();
  const blue = page.getByRole("button", { name: "Set edit path color: Blue (#3B82F6)" });
  await blue.focus();
  await page.keyboard.press("Enter");
  assert.equal(await editColorButton.evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(59, 130, 246)");
  await page.locator("form.path-edit button.primary").click();
  await page.locator(".path-title", { hasText: "Keyboard path" }).waitFor();
  assert.equal(paths[0]?.color, "#3B82F6");

  await page.reload();

  await page.locator(".path-title", { hasText: "Keyboard path" }).waitFor();
  assert.equal(
    await page.locator(".path .dot").evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(59, 130, 246)",
  );
});

it("restores a hidden Path board tab after showing it from Paths", async (t) => {
  const { page, requests } = await fixture(t, 1440, {
    pathSeeds: [{ id: "path-1", name: "Writing", status: "ACTIVE", boardId: "board-1", boardHidden: true }],
  });
  const appUrl = server.resolvedUrls.local[0];
  await page.goto(`${appUrl}paths`);
  await page.getByRole("heading", { name: "Paths" }).waitFor();
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const boardSwitch = page.getByRole("switch", { name: "Show on board" });
  assert.equal(await boardSwitch.isChecked(), false);
  await boardSwitch.check();
  await page.getByText("Writing board is shown.", { exact: true }).waitFor();
  await until(() => requests.includes("/boards/board-1/visibility"));

  await page.goto(`${appUrl}board`);
  await page.locator(".board-page").waitFor();
  await page.getByRole("button", { name: "Writing", exact: true }).waitFor();
});

it("restores report filters after navigation and browser Back/Forward", async (t) => {
  const { page } = await fixture(t, 1440);
  const search = "?startDate=2026-09-01&endDate=2026-09-07&aggregation=month&pathId=path-1&labelId=label-1";
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
    assert.deepEqual(params.getAll("pathId"), ["path-1"]);
    assert.deepEqual(params.getAll("labelId"), ["label-1"]);
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
  const query = "?startDate=2026-09-01&endDate=2026-09-07&aggregation=month&pathId=path-1&labelId=label-1";
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

it("keeps the Labels search query after a direct load and browser reload", async (t) => {
  const { page } = await fixture(t, 1440, {
    calendarLabels: [{ id: "label-focus", name: "Deep focus", color: "#3B82F6", scopes: ["NOTE", "LOG"] }],
  });
  const url = `${server.resolvedUrls.local[0]}labels?q=Deep%20focus`;
  await page.goto(url);
  await page.locator(".labels-view").waitFor();
  const assertQueryState = async () => {
    assert.equal(new URL(page.url()).searchParams.get("q"), "Deep focus");
    assert.equal(await page.getByRole("searchbox", { name: "Search labels" }).inputValue(), "Deep focus");
    await page.getByText("Deep focus", { exact: true }).waitFor();
  };
  await assertQueryState();

  await page.reload();
  await page.locator(".labels-view").waitFor();
  await assertQueryState();
});

it("switches report aggregation by keyboard and preserves Path and Label filters", async (t) => {
  const { page } = await fixture(t, 1440);
  page.setDefaultTimeout(5000);
  await page.goto(
    `${server.resolvedUrls.local[0]}reports?startDate=2026-10-04&endDate=2026-10-10&aggregation=DAY&pathId=path-1&labelId=label-1`,
  );
  await page.locator(".reports-page").waitFor();
  const expectedWeek = await page.evaluate(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { start: iso(start), end: iso(end) };
  });
  const aggregation = page.getByRole("combobox", { name: "Report aggregation" });
  await aggregation.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await page.waitForFunction(() => {
    const params = new URL(location.href).searchParams;
    return params.get("aggregation") === "week";
  }, undefined, { timeout: 5000 });
  const query = new URL(page.url()).searchParams;
  assert.equal(await aggregation.inputValue(), "WEEK");
  assert.equal(query.get("startDate"), expectedWeek.start);
  assert.equal(query.get("endDate"), expectedWeek.end);
  assert.equal(query.get("pathId"), "path-1");
  assert.equal(query.get("labelId"), "label-1");
  assert.equal(query.get("aggregation"), "week");
});

it("normalizes malformed report query values on direct browser load", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(
    `${server.resolvedUrls.local[0]}reports?startDate=not-a-date&endDate=2026-09-07&aggregation=unknown`,
  );
  await page.locator(".reports-page").waitFor();
  const expectedWeek = await page.evaluate(() => {
    const start = new Date();
    const weekday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekday);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { start: iso(start), end: iso(end) };
  });

  await page.waitForFunction((expected) => {
    const params = new URL(location.href).searchParams;
    return params.get("startDate") === expected.start &&
      params.get("endDate") === expected.end &&
      params.get("aggregation") === "day";
  }, expectedWeek);
  assert.equal(await page.getByRole("combobox", { name: "Report aggregation" }).inputValue(), "DAY");
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
  await dateRange.tap();
  await page.getByText("Yesterday", { exact: true }).tap();
  await page.waitForFunction(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const expected = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    const params = new URL(location.href).searchParams;
    return params.get("startDate") === expected && params.get("endDate") === expected;
  });
  const expectedPrevious = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() - 2);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  await page.getByRole("button", { name: "Previous date range" }).click();
  await page.waitForFunction((expected) => {
    const params = new URL(location.href).searchParams;
    return params.get("startDate") === expected && params.get("endDate") === expected;
  }, expectedPrevious);

  await dateRange.tap();
  const monthLabel = await page.locator(".dp__month_year_wrap").first().textContent();
  const displayedMonth = new Date(monthLabel.replace(/([A-Za-z]+)(\d{4})/, "$1 $2"));
  const customStart = `${displayedMonth.getFullYear()}-${String(displayedMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const customEnd = `${displayedMonth.getFullYear()}-${String(displayedMonth.getMonth() + 1).padStart(2, "0")}-03`;
  await page.locator(".dp__cell_inner:not(.dp__cell_offset)").filter({ hasText: /^1$/ }).first().tap();
  assert.equal(await page.locator(".dp__menu").isVisible(), true, "the custom range stays open after choosing its start");
  await page.locator(".dp__cell_inner:not(.dp__cell_offset)").filter({ hasText: /^3$/ }).first().tap();
  await page.waitForFunction(({ start, end }) => {
    const params = new URL(location.href).searchParams;
    return params.get("startDate") === start && params.get("endDate") === end;
  }, { start: customStart, end: customEnd });

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
  const dateInputBounds = await page.getByRole("textbox", { name: "Datepicker input" }).boundingBox();
  assert.ok(dateInputBounds && dateInputBounds.width >= 240, "the selected date interval has enough input width to remain readable");
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
  assert.ok(textBounds.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth), JSON.stringify(textBounds));
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

it("returns the Calendar to today with a touch-sized navigation control", async (t) => {
  const { page } = await fixture(t, 390);
  await page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await page.locator(".calendar-page").waitFor();
  const current = await page.evaluate(() => ({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth()),
    day: String(new Date().getDate()),
    date: [
      new Date().getFullYear(),
      String(new Date().getMonth() + 1).padStart(2, "0"),
      String(new Date().getDate()).padStart(2, "0"),
    ].join("-"),
  }));

  await page.getByRole("button", { name: "Previous month" }).tap();
  const todayButton = page.getByRole("button", { name: "Today" });
  const bounds = await todayButton.boundingBox();
  assert.ok(bounds && bounds.height >= 44);
  const navigationCenters = await page.locator(".calendar-navigation > *").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top + rect.height / 2;
    }),
  );
  assert.ok(Math.max(...navigationCenters) - Math.min(...navigationCenters) < 1);
  await todayButton.tap();

  assert.equal(await page.getByRole("combobox", { name: "Calendar year" }).inputValue(), current.year);
  assert.equal(await page.getByRole("combobox", { name: "Calendar month" }).inputValue(), current.month);
  assert.equal(await page.locator('button.calendar-day[aria-pressed="true"] time').textContent(), current.day);
  assert.ok(await page.locator("button.calendar-day").count() >= 35);
  await page.waitForFunction(
    (expected) => new URL(location.href).searchParams.get("date") === expected,
    current.date,
  );
});

it("loads a Calendar date deep link and retains it after browser reload", async (t) => {
  const { page } = await fixture(t, 1440);
  const url = `${server.resolvedUrls.local[0]}calendar?date=2026-09-01`;
  await page.goto(url);
  await page.locator(".calendar-page").waitFor();
  const assertLinkedDate = async () => {
    assert.equal(new URL(page.url()).searchParams.get("date"), "2026-09-01");
    assert.equal(await page.getByRole("combobox", { name: "Calendar month" }).inputValue(), "8");
    assert.equal(await page.getByRole("combobox", { name: "Calendar year" }).inputValue(), "2026");
    assert.equal(await page.locator('button.calendar-day[aria-pressed="true"] time').textContent(), "1");
  };
  await assertLinkedDate();
  assert.match(await page.title(), /Knowledge Base.*Calendar/);

  await page.reload();

  await page.locator(".calendar-page").waitFor();
  await assertLinkedDate();
  assert.match(await page.title(), /Knowledge Base.*Calendar/);
});

it("clears an impossible Calendar date query and falls back to today", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}calendar?date=2026-02-30`);
  await page.locator(".calendar-page").waitFor();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("date"));

  const current = await page.evaluate(() => ({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth()),
    day: String(new Date().getDate()),
  }));
  assert.equal(await page.getByRole("combobox", { name: "Calendar year" }).inputValue(), current.year);
  assert.equal(await page.getByRole("combobox", { name: "Calendar month" }).inputValue(), current.month);
  assert.equal(await page.locator('button.calendar-day[aria-pressed="true"] time').textContent(), current.day);
});

it("selects a calendar day with touch and updates its details panel", async (t) => {
  const { page } = await fixture(t, 390);
  await page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await page.locator(".calendar-page").waitFor();
  const target = page.locator("button.calendar-day:not(.muted)").nth(2);
  const targetDay = await target.locator("time").textContent();
  const targetBounds = await target.boundingBox();
  assert.ok(targetBounds && targetBounds.height >= 44);

  await target.tap();

  assert.equal(await target.getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.locator('button.calendar-day[aria-pressed="true"]').count(),
    1,
  );
  assert.match(
    await page.locator(".day-editor-heading h2").textContent(),
    new RegExp(`\\b${targetDay}\\b`),
  );
});

it("edits and saves a Calendar day at phone width without horizontal overflow", async (t) => {
  const { page } = await fixture(t, 390);
  await page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await page.locator(".calendar-page").waitFor();
  const target = page.locator("button.calendar-day:not(.muted)").nth(2);
  await target.tap();

  const editor = page.locator(".day-editor");
  await editor.locator("textarea").fill("Phone width calendar note");
  const save = page.getByRole("button", { name: "Save day" });
  await save.scrollIntoViewIfNeeded();
  const saveBounds = await save.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(saveBounds && viewport);
  assert.ok(saveBounds.x >= 0 && saveBounds.x + saveBounds.width <= viewport.width);
  assert.ok(saveBounds.y + saveBounds.height <= viewport.height);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );

  const saved = page.waitForResponse((response) =>
    response.url().includes("/calendar/days/") &&
    response.request().method() === "PUT",
  );
  await save.tap();
  await saved;
  await page.reload();
  await page.locator(".calendar-page").waitFor();
  assert.equal(await page.locator(".day-editor textarea").inputValue(), "Phone width calendar note");
});

it("selects a calendar day with the keyboard and retains focus", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await page.locator(".calendar-page").waitFor();
  const target = page.locator("button.calendar-day:not(.muted)").nth(2);
  const targetDay = await target.locator("time").textContent();
  await target.focus();
  await page.keyboard.press("Enter");

  assert.equal(await target.getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.locator('button.calendar-day[aria-pressed="true"]').count(),
    1,
  );
  assert.equal(await target.evaluate((element) => element === document.activeElement), true);
  assert.match(
    await page.locator(".day-editor-heading h2").textContent(),
    new RegExp(`\\b${targetDay}\\b`),
  );
});

it("reloads a saved Calendar note from its selected day record", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await page.locator(".calendar-page").waitFor();
  const note = "Browser fixture calendar note";
  await page.locator(".day-editor textarea").fill(note);
  const saved = page.waitForResponse((response) =>
    response.url().includes("/calendar/days/") &&
    response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save day" }).click();
  await saved;

  await page.reload();

  await page.locator(".calendar-page").waitFor();
  await page.waitForFunction(
    (expected) => document.querySelector(".day-editor textarea")?.value === expected,
    note,
  );
  assert.equal(await page.locator(".day-editor textarea").inputValue(), note);
});

it("reloads a saved Calendar label assignment on its selected day", async (t) => {
  const label = {
    id: "leave",
    name: "Sick leave",
    color: "#2878D5",
    scopes: ["CALENDAR"],
  };
  const { page } = await fixture(t, 1440, { calendarLabels: [label] });
  await page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await page.locator(".calendar-page").waitFor();
  const checkbox = page.getByRole("checkbox", { name: "Sick leave" });
  await checkbox.check();
  const saved = page.waitForResponse((response) =>
    response.url().includes("/calendar/days/") &&
    response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save day" }).click();
  await saved;

  await page.reload();

  await page.locator(".calendar-page").waitFor();
  await page.waitForFunction(() => {
    const checkbox = document.querySelector('.day-label input[type="checkbox"]');
    return checkbox instanceof HTMLInputElement && checkbox.checked;
  });
  assert.equal(await page.getByRole("checkbox", { name: "Sick leave" }).isChecked(), true);
});

it("creates a Calendar label with default scopes and reloads its assignment", async (t) => {
  const { page, calendarLabels } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await page.locator(".calendar-page").waitFor();
  await page.getByRole("button", { name: "Open label picker" }).click();
  const input = page.locator('.label-picker-menu input[aria-label="Add or create calendar label"]');
  await input.fill("Vacation");
  await page.getByRole("option", { name: "Create Vacation" }).click();

  assert.deepEqual(
    { color: calendarLabels[0]?.color, scopes: calendarLabels[0]?.scopes },
    { color: "#F8FAFC", scopes: ["NOTE", "CALENDAR", "TIME_ENTRY", "LOG", "BOARD"] },
  );
  const checkbox = page.getByRole("checkbox", { name: "Vacation" });
  assert.equal(await checkbox.isChecked(), true);
  const saved = page.waitForResponse((response) =>
    response.url().includes("/calendar/days/") &&
    response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save day" }).click();
  await saved;

  await page.reload();

  await page.locator(".calendar-page").waitFor();
  await page.waitForFunction(() => {
    const row = [...document.querySelectorAll(".day-label")]
      .find((item) => item.querySelector("label")?.textContent?.trim() === "Vacation");
    const checkbox = row?.querySelector('input[type="checkbox"]');
    return checkbox instanceof HTMLInputElement && checkbox.checked;
  });
  assert.equal(await page.getByRole("checkbox", { name: "Vacation" }).isChecked(), true);
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

it("opens a log detail when the browser loads its deep link directly", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}logs/log-deep-link`);
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Directly loaded log entry", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/logs/log-deep-link");
  assert.ok(requests.includes("/logs/log-deep-link"));
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

it("opens label history when the browser loads its deep link directly", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}labels/label-deep-link`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Deep link label" }).waitFor();
  await dialog.getByText("Not used yet.", { exact: false }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/labels/label-deep-link");
  assert.ok(requests.some((path) => path.startsWith("/labels/label-deep-link/history")));
});

it("opens the board archive when the browser loads its route directly", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}board/archive`);
  await page.locator(".archive-page").waitFor();
  await page.getByRole("heading", { name: "Archive", exact: true }).waitFor();
  await page.getByText("No archived boards.", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/board/archive");
  assert.ok(requests.includes("/boards"));
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

it("opens and uses the Notes editor with touch-sized controls on mobile", async (t) => {
  const note = {
    id: "n1",
    title: "Browser deep link",
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Loaded directly" }] }] }),
    contentText: "Loaded directly",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-02T10:00:00Z",
    version: 1,
    tags: [],
    pinned: false,
  };
  const { page } = await fixture(t, 390, { noteSeeds: [note] });
  await visit(page, "/notes");
  const noteLink = page.getByRole("link", { name: "Open Browser deep link" });
  await noteLink.tap();
  await page.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/notes/n1");
  await page.getByRole("textbox", { name: "Note content" }).tap();
  const controls = await page.locator(".note-toolbar button").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  assert.ok(controls.length > 0 && controls.every(({ width, height }) => width >= 44 && height >= 44));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("button", { name: "Back to notes" }).tap();
  await page.waitForFunction(() => location.pathname === "/notes");
});

it("keeps long note titles and paragraphs within a phone-width editor", async (t) => {
  const longTitle = `Planning ${"weekly priorities ".repeat(10)}`.trim();
  const longBody = `${"A".repeat(400)} ${"Long body paragraph with readable words. ".repeat(40)}`;
  const note = {
    id: "n1",
    title: longTitle,
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: longBody }] }] }),
    contentText: longBody,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-02T10:00:00Z",
    version: 1,
    tags: [],
    pinned: false,
  };
  const { page } = await fixture(t, 390, { noteSeeds: [note] });
  await page.goto(`${server.resolvedUrls.local[0]}notes/n1`);
  const title = page.getByRole("textbox", { name: "Note title" });
  const body = page.getByRole("textbox", { name: "Note content" });
  await title.waitFor();
  assert.equal(await title.inputValue(), longTitle);
  assert.equal(await body.innerText(), longBody);
  const widths = await page.evaluate(() => [
    document.documentElement,
    document.querySelector(".rich-editor"),
    document.querySelector(".ProseMirror"),
  ].map((element) => ({ client: element.clientWidth, scroll: element.scrollWidth })));
  assert.ok(widths.every(({ client, scroll }) => scroll <= client), JSON.stringify(widths));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});

it("shows an unavailable state for a missing note opened by browser deep link", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}notes/gone`);
  await page.getByRole("alert").filter({ hasText: "Unable to open this note." }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/notes/gone");
});

it("applies light and dark appearance changes across routes and reloads", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}settings`);
  await page.locator(".settings-view").waitFor();

  const root = page.locator("html");
  const preference = page.getByRole("combobox", { name: "Theme preference" });
  await preference.selectOption("dark");
  assert.equal(await root.getAttribute("data-theme"), "dark");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "dark");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--workspace-background").trim()), "#151a22");

  await visit(page, "/reports");
  await page.locator(".reports-page").waitFor();
  assert.equal(await root.getAttribute("data-theme"), "dark");
  await page.reload();
  await page.locator(".reports-page").waitFor();
  assert.equal(await root.getAttribute("data-theme"), "dark");

  await visit(page, "/settings");
  await page.locator(".settings-view").waitFor();
  await page.getByRole("combobox", { name: "Theme preference" }).selectOption("light");
  assert.equal(await root.getAttribute("data-theme"), "light");
  assert.equal(await page.evaluate(() => localStorage.getItem("knowledge-base-theme")), "light");
  await visit(page, "/reports");
  await page.locator(".reports-page").waitFor();
  await page.reload();
  await page.locator(".reports-page").waitFor();
  assert.equal(await root.getAttribute("data-theme"), "light");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--workspace-background").trim()), "#f7f8fa");
});

it("keeps dialogs, menus, native selects, date picker, and report chart readable in both themes", async (t) => {
  const { page } = await fixture(t, 1440, { themeSurfaces: true });
  const contrast = (foreground, background) => {
    const luminance = (color) => {
      const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
      const normalizedHex = hex?.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
      const channels = normalizedHex
        ? normalizedHex.match(/../g).map((channel) => parseInt(channel, 16))
        : color.match(/[\d.]+/g).slice(0, 3).map(Number);
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  const assertReadable = (foreground, background, label) => {
    assert.ok(contrast(foreground, background) >= 4.5, `${label} contrast must be at least 4.5:1 (${foreground} on ${background})`);
  };
  const surfaceColors = async (selector) => page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { foreground: style.color, background: style.backgroundColor };
  });

  for (const themeName of ["light", "dark"]) {
    await page.goto(`${server.resolvedUrls.local[0]}settings`);
    await page.locator(".settings-view").waitFor();
    await page.getByRole("combobox", { name: "Theme preference" }).selectOption(themeName);
    const nativeSelect = await surfaceColors(".theme-select");
    assertReadable(nativeSelect.foreground, nativeSelect.background, `${themeName} native select`);

    await page.goto(`${server.resolvedUrls.local[0]}board`);
    await page.locator(".board-page").waitFor();
    await page.getByRole("button", { name: "Manage boards" }).click();
    const dialog = page.locator(".confirm-dialog[role=dialog]");
    await dialog.waitFor();
    const dialogColors = await surfaceColors(".confirm-dialog[role=dialog]");
    assertReadable(dialogColors.foreground, dialogColors.background, `${themeName} dialog`);
    await dialog.getByRole("button", { name: "Done" }).click();

    await openGantt(page);
    await page.getByRole("button", { name: /^Choose board:/ }).click();
    await page.getByRole("menu", { name: "Choose board" }).waitFor();
    const menu = await surfaceColors(".board-more-menu");
    const menuItem = await surfaceColors(".board-more-menu .board-more-item");
    assertReadable(menuItem.foreground, menu.background, `${themeName} menu`);

    await page.goto(`${server.resolvedUrls.local[0]}reports`);
    await page.locator(".reports-page").waitFor();
    const chart = page.locator(".chart-frame");
    await chart.locator("svg").waitFor();
    const chartColors = await page.evaluate(() => {
      const text = document.querySelector(".chart-frame svg text[fill]");
      return {
        foreground: text?.getAttribute("fill") || "",
        background: getComputedStyle(document.documentElement).getPropertyValue("--workspace-surface").trim(),
      };
    });
    assert.ok(chartColors.foreground, `${themeName} report chart has visible SVG labels`);
    assertReadable(chartColors.foreground, chartColors.background, `${themeName} report chart labels`);

    const dateRange = page.getByLabel("Report date range");
    await dateRange.click();
    const dateMenu = page.locator(".report-date-range .dp__menu");
    await dateMenu.waitFor();
    const dateColors = await page.evaluate(() => {
      const menu = document.querySelector(".report-date-range .dp__menu");
      const cell = menu?.querySelector(".dp__cell_inner");
      if (!menu || !cell) return null;
      return {
        foreground: getComputedStyle(cell).color,
        background: getComputedStyle(menu).backgroundColor,
        themeClass: menu.className,
      };
    });
    assert.ok(dateColors, `${themeName} date picker renders calendar cells`);
    assert.match(dateColors.themeClass, new RegExp(`dp__theme_${themeName}`));
    assertReadable(dateColors.foreground, dateColors.background, `${themeName} date picker`);
  }
});

it("opens global search from the header or shortcut and lists matching pages before records", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(server.resolvedUrls.local[0]);
  const trigger = page.locator(".global-search-trigger");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  await dialog.waitFor();
  const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  await dialog.locator(".global-search-close").click();
  await page.keyboard.press("Control+k");
  await dialog.waitFor();
  await input.fill("Reports");

  const pageResult = page.getByRole("option", { name: "Reports, page" });
  const recordResult = page.getByRole("option", { name: /Reports research note/ });
  await pageResult.waitFor();
  await recordResult.waitFor();
  assert.equal(await page.getByRole("heading", { name: "Pages" }).count(), 1);
  assert.equal(await page.getByRole("heading", { name: /Notes/ }).count(), 1);
  assert.equal(await pageResult.evaluate((element, record) => Boolean(element.compareDocumentPosition(record) & Node.DOCUMENT_POSITION_FOLLOWING), await recordResult.elementHandle()), true);
});

it("keeps global search usable with touch at phone width", async (t) => {
  const { page } = await fixture(t, 390);
  await page.goto(server.resolvedUrls.local[0]);
  const trigger = page.locator(".global-search-trigger");
  const target = await trigger.boundingBox();
  assert.ok(target);
  await page.touchscreen.tap(target.x + target.width / 2, target.y + target.height / 2);

  const dialog = page.getByRole("dialog", { name: "Search everything" });
  await dialog.waitFor();
  const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  assert.equal(await input.getAttribute("type"), "search");
  assert.equal(await input.getAttribute("enterkeyhint"), "go");
  await input.fill("Reports");
  const result = page.getByRole("option", { name: /Reports research note/ });
  await result.waitFor();
  const dimensions = await dialog.evaluate((element) => ({
    right: element.getBoundingClientRect().right,
    left: element.getBoundingClientRect().left,
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.left >= 0 && dimensions.right <= dimensions.viewport);
  assert.ok(dimensions.documentWidth <= dimensions.viewport);
});

it("groups matching record types, shows note context, and opens the active result with Enter", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(server.resolvedUrls.local[0]);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  await dialog.waitFor();
  const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  await input.fill("Reports");

  const note = page.getByRole("option", { name: /Reports research note/ });
  const log = page.getByRole("option", { name: /Report export log/ });
  await note.waitFor();
  await log.waitFor();
  assert.equal(await page.getByRole("heading", { name: /Notes/ }).count(), 1);
  assert.equal(await page.getByRole("heading", { name: /Logs/ }).count(), 1);
  assert.match(await note.innerText(), /Found report draft/);
  assert.match(await note.innerText(), /Label: Reports label/);

  await input.press("ArrowDown");
  assert.equal(await note.getAttribute("aria-selected"), "true");
  await input.press("Enter");
  await page.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/notes/search-note");
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), "Reports research note");
});

it("opens the active global search result in a new tab with Control+Enter and native link behavior", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(server.resolvedUrls.local[0]);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  await dialog.waitFor();
  const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  await input.fill("Reports");
  const note = page.getByRole("option", { name: /Reports research note/ });
  await note.waitFor();
  await input.press("ArrowDown");
  assert.equal(await note.getAttribute("aria-selected"), "true");

  const opened = page.context().waitForEvent("page");
  await input.press("Control+Enter");
  const newTab = await opened;
  await newTab.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(new URL(newTab.url()).pathname, "/notes/search-note");
  assert.equal(await dialog.isVisible(), true);
  assert.equal(new URL(page.url()).pathname, "/");

  assert.equal(await note.evaluate((element) => element.tagName), "A");
  assert.equal(await note.getAttribute("href"), "/notes/search-note");
  const modifiedClickTab = page.context().waitForEvent("page");
  await note.click({ modifiers: ["Control"] });
  const linkTab = await modifiedClickTab;
  await linkTab.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(new URL(linkTab.url()).pathname, "/notes/search-note");
  assert.equal(await dialog.isVisible(), true);

  await note.evaluate((element) => {
    element.addEventListener("contextmenu", (event) => {
      window.__navContextMenuAllowed = !event.defaultPrevented;
    }, { once: true });
  });
  await note.click({ button: "right" });
  assert.equal(await page.evaluate(() => window.__navContextMenuAllowed), true);
  assert.equal(new URL(page.url()).pathname, "/");
});

it("loads more global search results only for the selected record type", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(server.resolvedUrls.local[0]);
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Search everything" }).waitFor();
  const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  await input.fill("More");
  await page.getByRole("option", { name: /Show 2 more notes/ }).waitFor();
  await page.getByRole("option", { name: /Show 1 more logs/ }).waitFor();

  await page.getByRole("option", { name: /Show 2 more notes/ }).click();
  await page.locator("#global-search-note-more-note-2").waitFor();
  await page.locator("#global-search-note-more-note-3").waitFor();
  assert.equal(await page.locator("#global-search-log-more-log-2").count(), 0);
  assert.equal(await page.getByRole("option", { name: /Show 1 more logs/ }).count(), 1);

  await page.getByRole("option", { name: /Show 1 more logs/ }).click();
  await page.locator("#global-search-log-more-log-2").waitFor();
  assert.equal(await page.locator("#global-search-note-more-note-2").count(), 1);
  assert.equal(await page.locator("#global-search-note-more-note-3").count(), 1);
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
