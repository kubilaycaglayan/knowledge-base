import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";
import { chromium } from "playwright";
import { activate, auditCloseAction, auditContainment, auditFocusCycle, chooseNativeOption, requireTouchInput } from "./overlay-audit.mjs";

// Mocked API only: no real credentials, backend writes, or personal data.
let server, browser, viteCacheDir;
const pages = ["/", "/board", "/logs", "/notes", "/calendar", "/reports", "/paths", "/labels", "/settings"];
const today = new Date().toISOString().slice(0, 10);
const statuses = ["Backlog", "In Progress", "Done"].map((name, position) => ({ id: `status-${position}`, name, position, archived: false, cardSort: "MANUAL" }));
const card = { id: "card-1", statusId: "status-0", title: "Ship timeline", body: "{}", priority: "HIGH", startDate: today, dueDate: today, position: 0, archived: false, pathIds: [], labelIds: [] };
const searchResult = (id, type, title, snippet) => ({ id, type, title, snippet, at: "2026-10-01T10:00:00Z", date: null, archived: false, via: null, viaName: null, color: null, pathId: null, pathName: null, pathColor: null, boardId: null, boardName: null, statusName: null, endedAt: null, durationSeconds: null });

before(async () => {
  // Use a cold Vite cache so dependency optimization cannot make the first
  // browser assertions race a page reload on CI but pass with a warm local cache.
  viteCacheDir = await mkdtemp(join(tmpdir(), "knowledge-base-nav-vite-"));
  server = await createServer({
    cacheDir: viteCacheDir,
    optimizeDeps: {
      include: [
        "vuetify/components/VBtn",
        "vuetify/components/VIcon",
        "vuetify/components/VList",
        "vuetify/components/VSelect",
        "vuetify/components/VSnackbar",
        "vuetify/components/VMenu",
        "vuetify/components/VChip",
        "vuetify/components/VTable",
      ],
    },
    server: { host: "127.0.0.1", port: 0, hmr: false },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await server?.close();
  if (viteCacheDir) await rm(viteCacheDir, { recursive: true, force: true });
});

it("pre-optimizes lazy Vuetify shell dependencies before browser assertions", async () => {
  const optimizer = server.environments.client.depsOptimizer;
  await Promise.all(Object.values(optimizer.metadata.discovered).map(({ processing }) => processing));
  const optimized = optimizer.metadata.optimized;
  for (const dependency of [
    "vuetify/components/VBtn",
    "vuetify/components/VIcon",
    "vuetify/components/VList",
    "vuetify/components/VSelect",
    "vuetify/components/VSnackbar",
    "vuetify/components/VMenu",
    "vuetify/components/VChip",
    "vuetify/components/VTable",
  ]) {
    assert.ok(optimized[dependency], `${dependency} must be ready before Chromium tests can trigger a dev-server reload`);
  }
});

async function fixture(t, width, { warmup = false, clock = false, authenticated = true, rejectReportsAuth = false, failSearchOnce = false, failSearchQuery = null, failImportOnce = false, failLogDeleteOnce = false, failLogUpdateOnce = false, failNoteUpdateOnce = false, failTimelineNoteOnce = false, calendarLabels = [], pathSeeds = [], themeSurfaces = false, noteSeeds = [], timelineSeeds = [], logSeeds = [], logBody = "Directly loaded log entry", boardCardTitle = card.title, boardCards = [card], boardList = null, browserZoom = false, sessionSeeds = [], pathActivity = [], noteConflictOnce = null } = {}) {
  const contextOptions = { viewport: { width, height: 900 }, hasTouch: width <= 390, colorScheme: "light", reducedMotion: "reduce" };
  const zoomSession = browserZoom ? await zoomableContext(contextOptions) : null;
  const context = zoomSession?.context || await browser.newContext(contextOptions);
  context.routeWebSocket("**/ws/timers", (webSocket) => webSocket.close());
  t.after(async () => {
    await context.close();
    if (zoomSession) await rm(zoomSession.root, { recursive: true, force: true });
  });
  if (contextOptions.hasTouch) await requireTouchInput(t, context);
  const requests = [];
  const completedRequests = [];
  const reportQueries = [];
  const pathOrderWrites = [];
  const pathMergeWrites = [];
  const removedPaths = new Map();
  const paths = [...pathSeeds];
  let notes = [...noteSeeds];
  const logs = [...logSeeds];
  const calendarDays = [];
  const importBatches = [];
  const preferences = { theme: "light", kanbanWide: false, ganttWide: false, recentPathIds: [] };
  let currentTimer = null;
  let pausedTimer = {};
  let rejectNextReportsRequest = rejectReportsAuth;
  let searchFailurePending = failSearchOnce;
  let failedSearchQueryPending = failSearchQuery;
  let importFailurePending = failImportOnce;
  let logDeleteFailurePending = failLogDeleteOnce;
  let logUpdateFailurePending = failLogUpdateOnce;
  let noteUpdateFailurePending = failNoteUpdateOnce;
  let timelineNoteFailurePending = failTimelineNoteOnce;
  let noteConflictPending = noteConflictOnce;
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
    if (searchFailurePending && path === "/search") {
      searchFailurePending = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary search failure" }) });
      return;
    }
    if (failedSearchQueryPending && path === "/search" && url.searchParams.get("q") === failedSearchQueryPending) {
      failedSearchQueryPending = null;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary search failure" }) });
      return;
    }
    if (importFailurePending && path === "/imports/knowledge-base" && method === "POST") {
      importFailurePending = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary import failure" }) });
      return;
    }
    if (logDeleteFailurePending && path.startsWith("/logs/") && method === "DELETE") {
      logDeleteFailurePending = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary log delete failure" }) });
      return;
    }
    if (logUpdateFailurePending && path.startsWith("/logs/") && method === "PUT") {
      logUpdateFailurePending = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary log save failure" }) });
      return;
    }
    if (noteUpdateFailurePending && path.startsWith("/notes/") && method === "PUT") {
      noteUpdateFailurePending = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary note update failure" }) });
      return;
    }
    if (noteConflictPending && path.startsWith("/notes/") && method === "PUT") {
      // Another window saved first: store its version, then reject this save.
      const id = path.split("/").at(-1);
      const index = notes.findIndex((note) => note.id === id);
      notes[index] = { ...notes[index], ...noteConflictPending, version: notes[index].version + 1, updatedAt: new Date().toISOString() };
      noteConflictPending = null;
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Note changed in another window" }) });
      return;
    }
    if (timelineNoteFailurePending && path === "/notes" && method === "POST") {
      timelineNoteFailurePending = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary activity note failure" }) });
      return;
    }
    let body = [];
    if (path === "/time-entries") body = { sessions: sessionSeeds, page: 0, totalPages: 1, totalSessions: sessionSeeds.length };
    else if (path === "/auth/login" && method === "POST") body = { token: "signed-in-nav-test-token" };
    else if (path.startsWith("/logs/") && method === "DELETE") {
      const index = logs.findIndex((log) => `/logs/${log.id}` === path);
      if (index >= 0) logs.splice(index, 1);
      body = {};
    }
    else if (path.startsWith("/logs/") && method === "PUT") {
      const index = logs.findIndex((log) => `/logs/${log.id}` === path);
      if (index >= 0) logs[index] = { ...logs[index], ...route.request().postDataJSON(), updatedAt: new Date().toISOString(), version: (logs[index].version || 0) + 1 };
      body = logs[index] || null;
    }
    else if (path === "/logs/log-deep-link") body = { id: "log-deep-link", body: logBody, occurredAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, labelIds: [] };
    else if (path === "/logs" && method === "POST") {
      const payload = route.request().postDataJSON();
      const created = { id: `phone-log-${logs.length + 1}`, ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, labelIds: [] };
      logs.push(created);
      body = created;
    }
    else if (path === "/logs") body = logs;
    else if (path === "/time-entries/s1") body = { id: "s1", pathId: null, labelIds: [], startedAt: "2026-10-01T09:00:00Z", endedAt: "2026-10-01T10:00:00Z", durationSeconds: 3600, description: "Browser direct session", source: "MANUAL" };
    else if (path === "/paths" && method === "POST") {
      body = { ...route.request().postDataJSON(), id: "path-1", status: "ACTIVE", pinned: false };
      paths.push(body);
    }
    else if (path.startsWith("/paths/") && path.endsWith("/pin") && method === "POST") {
      const id = path.split("/")[2];
      const index = paths.findIndex((item) => item.id === id);
      if (index >= 0) paths[index].pinned = route.request().postDataJSON().pinned;
      body = paths[index];
    }
    else if (path.startsWith("/paths/") && path.endsWith("/merge") && method === "POST") {
      pathMergeWrites.push({ sourceId: path.split("/")[2], ...route.request().postDataJSON() });
      const sourceId = path.split("/")[2];
      const sourceIndex = paths.findIndex((item) => item.id === sourceId);
      if (sourceIndex >= 0) paths.splice(sourceIndex, 1);
      body = {};
    }
    else if (path.startsWith("/paths/") && path.endsWith("/restore") && method === "POST") {
      const id = path.split("/")[2];
      const restored = removedPaths.get(id);
      if (restored && !paths.some((item) => item.id === id)) paths.push(restored);
      removedPaths.delete(id);
      body = restored || {};
    }
    else if (path.startsWith("/paths/") && method === "DELETE") {
      const id = path.split("/")[2];
      const index = paths.findIndex((item) => item.id === id);
      if (index >= 0) removedPaths.set(id, paths.splice(index, 1)[0]);
      body = {};
    }
    else if (path === "/paths/order" && method === "PUT") {
      const { pathIds } = route.request().postDataJSON();
      pathOrderWrites.push(pathIds);
      const byId = new Map(paths.map((item) => [item.id, item]));
      paths.splice(0, paths.length, ...pathIds.map((id) => byId.get(id)).filter(Boolean));
      body = paths;
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
      body = { path: paths.find((item) => item.id === pathId), trackedSeconds: 0, recentActivity: pathActivity };
    }
    else if (path.startsWith("/boards/") && path.endsWith("/visibility") && method === "POST") {
      const boardId = path.split("/")[2];
      const owner = paths.find((item) => item.boardId === boardId);
      if (owner) owner.boardHidden = route.request().postDataJSON().hidden;
      body = { id: boardId, name: owner?.name || "Product", pathId: owner?.id || null, archived: false, hidden: owner?.boardHidden || false };
    }
    else if (path === "/boards") {
      if (url.searchParams.get("archived") === "true") body = [];
      else if (boardList) body = boardList;
      else {
        const pathBoards = paths
          .filter((item) => item.boardId && !item.boardHidden)
          .map((item) => ({ id: item.boardId, name: item.name, pathId: item.id, archived: false, hidden: false }));
        body = pathBoards.length ? pathBoards : [{ id: "board-1", name: "Product", archived: false }];
      }
    }
    else if (path === "/boards/board-1/statuses") body = statuses;
    else if (path === "/boards/board-1/cards/page") body = { items: url.searchParams.get("statusId") === "status-0" ? boardCards.map((item) => ({ ...item, title: boardCardTitle })) : [], nextCursor: null };
    else if (path === "/boards/board-1/cards") body = url.searchParams.get("archived") === "true" ? [] : boardCards.map((item) => ({ ...item, title: boardCardTitle }));
    else if (path === "/boards/board-1/gantt") body = boardCards.map((item) => ({ ...item, title: boardCardTitle }));
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
    else if (path.startsWith("/labels/") && method === "PUT") {
      const id = path.split("/")[2];
      const index = calendarLabels.findIndex((label) => label.id === id);
      if (index >= 0) calendarLabels[index] = { ...calendarLabels[index], ...route.request().postDataJSON() };
      body = calendarLabels[index] || null;
    }
    else if (path === "/labels/label-deep-link/history") body = { labelId: "label-deep-link", name: "Deep link label", color: "#3B82F6", firstUsedAt: null, lastUsedAt: null, totalUses: 0, trackedSeconds: 0, uses: { sessions: 0, logs: 0, notes: 0, calendarDays: 0, cards: 0 }, timeline: [], hours: [], related: [] };
    else if (path === "/labels/label-deep-link/history/records") body = { items: [], hasMore: false };
    else if (path === "/labels") body = calendarLabels;
    else if (path === "/activities") body = timelineSeeds;
    else if (path === "/notes" && method === "POST") {
      const payload = route.request().postDataJSON();
      const created = { id: `activity-note-${notes.length + 1}`, ...payload, contentText: payload.content, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, tags: [], pinned: false };
      notes.push(created);
      body = created;
    }
    else if (path === "/notes/order" && method === "PUT") {
      const { noteIds } = route.request().postDataJSON();
      notes = noteIds.map((id) => notes.find((item) => item.id === id)).filter(Boolean);
      body = notes;
    }
    else if (path.startsWith("/notes/") && method === "PUT") {
      const id = path.split("/").at(-1);
      const index = notes.findIndex((note) => note.id === id);
      if (index >= 0) notes[index] = { ...notes[index], ...route.request().postDataJSON(), updatedAt: new Date().toISOString(), version: notes[index].version + 1 };
      body = notes[index] || null;
    }
    else if (path.startsWith("/notes/") && method === "DELETE") {
      const id = path.split("/").at(-1);
      const note = notes.find((item) => item.id === id);
      if (note) {
        note.archived = true;
        note.deletedAt = new Date().toISOString();
      }
      body = {};
    }
    else if (path === "/notes") {
      const archived = url.searchParams.get("archived") === "true";
      const query = (url.searchParams.get("q") || "").trim().toLocaleLowerCase();
      const selectedNotes = notes.filter((note) => {
        const matchesArchive = Boolean(note.archived) === archived;
        const searchable = `${note.title || ""} ${note.contentText || ""} ${(note.tags || []).join(" ")}`.toLocaleLowerCase();
        return matchesArchive && (!query || searchable.includes(query));
      });
      body = { items: selectedNotes, page: 0, size: 20, totalItems: selectedNotes.length, totalPages: selectedNotes.length ? 1 : 0 };
    }
    else if (path === "/notes/n1") body = notes.find((note) => note.id === "n1") || { id: "n1", title: "Browser deep link", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Loaded directly" }] }] }), contentText: "Loaded directly", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", version: 1, tags: [], pinned: false };
    else if (path === "/notes/search-note") body = { id: "search-note", title: "Reports research note", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Opened from global search" }] }] }), contentText: "Opened from global search", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", version: 1, tags: [], pinned: false };
    else if (path.startsWith("/notes/")) body = notes.find((note) => `/notes/${note.id}` === path) || null;
    else if (path === "/auth/me") body = { email: "nav-test@example.test", hasPassword: true, hasGoogle: false };
    else if (path === "/imports/knowledge-base/batches") body = importBatches;
    else if (path === "/imports/clockify/batches") body = [];
    else if (path === "/imports/knowledge-base" && method === "POST") {
      const batch = { id: "browser-import-batch", source: "KNOWLEDGE_BASE", imported: 2, skipped: 1, createdPaths: 1, createdAt: "2026-10-10T10:00:00Z", undoneAt: null };
      importBatches.unshift(batch);
      body = { batchId: batch.id, imported: batch.imported, skipped: batch.skipped, createdPaths: batch.createdPaths };
    }
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
        : query?.toLocaleLowerCase() === "reports" ? reportsResults : [];
      body = { groups, fuzzy: false, incomplete: false };
    }
    else if (path.startsWith("/reports")) {
      reportQueries.push(url.searchParams.toString());
      const selectedPath = paths.find((item) => url.searchParams.getAll("pathId").includes(item.id));
      const chartPath = selectedPath
        ? { id: selectedPath.id, label: selectedPath.name, seconds: 3600, color: "#3b82f6" }
        : { id: "theme-path", label: "Theme path", seconds: 3600, color: "#3b82f6" };
      const selectedLabel = calendarLabels.find((item) => url.searchParams.getAll("labelId").includes(item.id));
      const chartDay = { date: today, totalSeconds: 3600, paths: [chartPath] };
      body = { period: "WEEK", from: url.searchParams.get("startDate"), to: url.searchParams.get("endDate"), totalSeconds: themeSurfaces ? 3600 : 0, days: themeSurfaces ? [chartDay] : [], paths: themeSurfaces ? [chartPath] : [], sessionLabels: themeSurfaces && selectedLabel ? [{ id: selectedLabel.id, label: selectedLabel.name, seconds: 3600 }] : [], calendarLabels: [] };
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
    completedRequests.push(path);
  });
  const page = await context.newPage();
  if (clock) await page.clock.install();
  await page.goto(server.resolvedUrls.local[0]);
  if (authenticated) await page.locator(".dashboard-shell > header nav").waitFor();
  else await page.locator(".auth").waitFor();
  return { page, requests, completedRequests, reportQueries, calendarLabels, paths, pathOrderWrites, pathMergeWrites, setBrowserZoom: browserZoom ? (factor) => setBrowserZoom(page, factor) : null };
}

// Chrome's own zoom controller (the one behind Ctrl+Plus and the zoom menu) is
// only scriptable through chrome.tabs, so load a one-permission probe extension.
async function zoomableContext(options) {
  const root = await mkdtemp(join(tmpdir(), "knowledge-base-zoom-"));
  const extension = join(root, "extension");
  await mkdir(extension);
  await writeFile(join(extension, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "Zoom probe", version: "1.0", background: { service_worker: "worker.js" }, permissions: ["tabs"] }));
  await writeFile(join(extension, "worker.js"), "// Zoom is driven from the test through chrome.tabs.\n");
  const context = await chromium.launchPersistentContext(join(root, "profile"), {
    ...options,
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  for (const page of context.pages()) await page.close();
  return { context, root };
}

async function setBrowserZoom(page, factor) {
  const context = page.context();
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
  const zoom = await worker.evaluate(async ({ url, zoomFactor }) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
    await chrome.tabs.setZoom(tab.id, zoomFactor);
    return chrome.tabs.getZoom(tab.id);
  }, { url: page.url(), zoomFactor: factor });
  await page.waitForFunction((expected) => Math.abs(devicePixelRatio - expected) < 0.01, factor);
  return zoom;
}

async function until(condition) {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(condition(), "Timed out waiting for the mocked request");
}

async function waitForNoteTitle(page, expected) {
  await page.waitForFunction((value) => document.querySelector('[aria-label="Note title"]')?.value === value, expected);
}

function expectedReportDateRange(startDate, endDate) {
  const format = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  const parse = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  return `${format.format(parse(startDate))} – ${format.format(parse(endDate))}`;
}

async function visit(page, path) {
  await page.goto(new URL(path, page.url()).href);
  await page.locator(".dashboard-shell > main").waitFor();
  await page.waitForTimeout(150);
}

async function openGantt(page) {
  const direct = page.getByRole("button", { name: "Gantt", exact: true });
  if (await direct.isVisible().catch(() => false)) await activate(direct);
  else {
    await activate(page.locator("button.board-tab-more"));
    await activate(page.locator('.board-more-menu [role^="menuitem"]', { hasText: /^Gantt/ }));
  }
  await page.locator(".board-page-gantt").waitFor();
  await page.waitForTimeout(150);
}

const header = (page) => page.locator(".dashboard-shell > header").evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, width: rect.width, marginBottom: getComputedStyle(element).marginBottom };
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
  await activate(page.getByRole("button", { name: "Sign in" }));
  await page.locator(".reports-page").waitFor();

  assert.equal(new URL(page.url()).pathname, "/reports");
  assert.equal(new URL(page.url()).search, query);
  assert.ok(requests.includes("/auth/login"));
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

it("returns to sign-in after a saved session is rejected and permits authentication again", async (t) => {
  const { page } = await fixture(t, 1440, { rejectReportsAuth: true });
  await page.goto(`${server.resolvedUrls.local[0]}reports`);
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("know_token")), null);
  assert.equal(await page.locator(".reports-page").count(), 0);

  await page.getByRole("textbox", { name: "Email" }).fill("nav-test@example.test");
  await page.getByRole("textbox", { name: "Password" }).fill("nav-test-password");
  await activate(page.getByRole("button", { name: "Sign in" }));
  await page.waitForFunction(() => localStorage.getItem("know_token") === "signed-in-nav-test-token");
  await page.locator(".reports-page").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("know_token")), "signed-in-nav-test-token");
});

it("preserves browser-native new-tab behavior for primary navigation links", async (t) => {
  const { page } = await fixture(t, 1440);
  const boardLink = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Board", exact: true });
  assert.equal(await boardLink.evaluate((element) => element.tagName), "A");
  assert.equal(await boardLink.getAttribute("href"), "/board");

  const opened = page.context().waitForEvent("page");
  await boardLink.click({ modifiers: ["Control"] });
  const newTab = await opened;
  await newTab.locator(".board-page").waitFor();
  assert.equal(new URL(newTab.url()).pathname, "/board");
  assert.equal(new URL(page.url()).pathname, "/");
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
  await calendarLink.focus();
  const newTab = page.context().waitForEvent("page");
  await page.keyboard.press("Control+Enter");
  const opened = await newTab;
  await opened.locator(".calendar-page").waitFor();
  assert.equal(new URL(opened.url()).pathname, "/calendar");
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
  await activate(note, { modifiers: ["Control"] });
  const linkTab = await modifiedClickTab;
  await linkTab.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(new URL(linkTab.url()).pathname, "/notes/search-note");
  assert.equal(await dialog.isVisible(), true);

  await note.evaluate((element) => {
    element.addEventListener("contextmenu", (event) => {
      window.__navContextMenuAllowed = !event.defaultPrevented;
    }, { once: true });
  });
  await activate(note, { button: "right" });
  assert.equal(await page.evaluate(() => window.__navContextMenuAllowed), true);
  assert.equal(new URL(page.url()).pathname, "/");
});

it("navigates home from the logo without a page reload and reuses cached sessions", async (t) => {
  const { page, requests, completedRequests } = await fixture(t, 1440);
  const homeData = ["/time-entries", "/paths", "/labels"];
  await until(() => homeData.every((path) => completedRequests.includes(path)));
  await activate(page.getByRole("link", { name: "Logs" }));
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.evaluate(() => { window.__noReload = true; });
  const before = requests.filter((path) => homeData.includes(path));
  const brand = page.getByRole("link", { name: "Knowledge Base" });
  assert.equal(await brand.getAttribute("href"), "/");
  await activate(brand);
  await page.waitForFunction(() => location.pathname === "/");
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__noReload), true, "Logo click must use client-side routing");
  assert.deepEqual(
    requests.filter((path) => homeData.includes(path)),
    before,
    "Returning home must reuse cached sessions, paths, and labels",
  );
});

const navSuiteConcurrency = Number.parseInt(process.env.NAV_CONCURRENCY || "7", 10);
describe("nav shell browser acceptance", { concurrency: navSuiteConcurrency }, () => {
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

it("uses at least 16px text controls on phone-width routes", async (t) => {
  const { page } = await fixture(t, 390);
  const editableControl = 'input:not([type="checkbox"]):not([type="radio"]), select, textarea, [contenteditable="true"]';
  const visibleEditableControl = 'input:not([type="checkbox"]):not([type="radio"]):visible, select:visible, textarea:visible, [contenteditable="true"]:visible';
  for (const path of ["/", "/logs", "/notes/n1", "/calendar", "/settings"]) {
    await visit(page, path);
    await page.locator(visibleEditableControl).first().waitFor();
    if (path === "/settings") {
      await page.getByRole("heading", { name: "Sign-in methods" }).waitFor();
      await page.getByRole("textbox", { name: "Current password" }).waitFor();
    }
    const controls = await page.evaluate((selector) => [...document.querySelectorAll(selector)]
      .filter((element) => element.getClientRects().length > 0).map((element) => ({
      name: element.getAttribute("aria-label") || element.getAttribute("name") || element.tagName,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    })), editableControl);
    assert.ok(controls.length > 0, `${path} should expose a visible editable control`);
    assert.ok(controls.every(({ fontSize }) => fontSize >= 16), `${path}: ${JSON.stringify(controls)}`);
  }
});

it("does not disable browser zoom in the viewport configuration", async (t) => {
  const { page } = await fixture(t, 390);
  await page.goto(server.resolvedUrls.local[0]);
  const content = await page.locator('meta[name="viewport"]').getAttribute("content");
  assert.ok(content);
  assert.doesNotMatch(content, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(content, /maximum-scale\s*=\s*1(?:\.0+)?(?:\s|,|$)/i);
});

// Every supported route state from 01-route-matrix.md; /development is excluded there.
const zoomRoutes = [
  ["/", ".session-list"],
  ["/sessions/s1", '[role="dialog"]'],
  ["/board", ".board-page"],
  ["/board/archive", ".archive-page"],
  ["/logs", ".logs-page"],
  ["/logs/log-deep-link", '[role="dialog"]'],
  ["/notes", ".notes-page"],
  ["/notes/n1", ".notes-page"],
  ["/timeline", 'h1:text-is("Timeline")'],
  ["/calendar", ".calendar-page"],
  ["/reports", ".reports-page"],
  ["/paths", ".paths-page"],
  ["/paths/path-deep-link", ".path-history-dialog"],
  ["/labels", ".labels-view"],
  ["/labels/label-deep-link", '[role="dialog"]'],
  ["/imports", 'h1:text-is("Imports")'],
  ["/settings", ".settings-view"],
  ["/no-such-page", "main"],
];

const zoomedLayout = (page) => page.evaluate(() => {
  const viewport = document.documentElement.clientWidth;
  const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  const name = (element) => element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " ") || element.tagName;
  const actions = [...document.querySelectorAll("button, a[href], input, select, textarea, [role='button']")].filter(visible);
  return {
    viewport,
    pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    // Actions in a horizontal scroller (such as the note formatting row) count
    // only when scrolling brings them fully into the viewport.
    outside: actions.filter((element) => {
      const outsideViewport = () => {
        const { left, right, width } = element.getBoundingClientRect();
        return width > 0 && (left < -1 || right > viewport + 1);
      };
      if (!outsideViewport()) return false;
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      return outsideViewport() || document.documentElement.scrollWidth > viewport;
    }).map(name),
    hiddenNavigation: [...document.querySelectorAll('nav[aria-label="Main navigation"] a[href]')].filter((link) => !visible(link)).map(name),
    mainHeight: document.querySelector("#main-content")?.getBoundingClientRect().height ?? 0,
  };
});

it("stays zoomable with Chrome's browser zoom controls at phone width", async (t) => {
  const { page, setBrowserZoom } = await fixture(t, 390, { browserZoom: true });
  assert.equal(await page.evaluate(() => [innerWidth, devicePixelRatio].join("x")), "390x1");

  assert.equal(Math.round(await setBrowserZoom(2) * 100), 200);
  assert.equal(await page.evaluate(() => [innerWidth, devicePixelRatio].join("x")), "195x2", "the page reflows to the zoomed CSS width");

  // The app must not reset or fight the browser zoom across navigation or reload.
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Logs" }).tap();
  await page.waitForURL(/\/logs$/);
  await page.getByRole("heading", { name: "Logs", exact: true }).waitFor();
  await page.reload();
  await page.locator(".logs-page").waitFor();
  assert.equal(await page.evaluate(() => devicePixelRatio), 2, "browser zoom survives navigation and reload");

  assert.equal(Math.round(await setBrowserZoom(1) * 100), 100);
  assert.equal(await page.evaluate(() => innerWidth), 390, "zooming back out restores the phone layout");
});

for (const zoom of [2, 4]) it(`reflows every supported route at ${zoom * 100}% Chrome browser zoom without hiding actions`, async (t) => {
  const { page, setBrowserZoom } = await fixture(t, 1280, {
    browserZoom: true,
    pathSeeds: [{ id: "path-deep-link", name: "Writing", status: "ACTIVE" }],
  });
  await setBrowserZoom(zoom);
  assert.equal(await page.evaluate(() => innerWidth), 1280 / zoom);
  const problems = [];
  for (const [path, ready] of zoomRoutes) {
    await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
    await page.locator(ready).first().waitFor({ state: "attached" });
    await page.waitForTimeout(150);
    const layout = await zoomedLayout(page);
    if (layout.viewport !== 1280 / zoom) problems.push(`${path}: viewport ${layout.viewport}px`);
    if (layout.pageWidth > layout.viewport) problems.push(`${path}: page overflows to ${layout.pageWidth}px`);
    if (layout.outside.length) problems.push(`${path}: actions outside the viewport: ${layout.outside.join(", ")}`);
    if (layout.hiddenNavigation.length) problems.push(`${path}: hidden navigation: ${layout.hiddenNavigation.join(", ")}`);
    // A collapsed main region hides the workspace behind the shell chrome.
    if (layout.mainHeight < 44) problems.push(`${path}: main content collapses to ${layout.mainHeight}px`);
  }
  assert.deepEqual(problems, [], `Reflow problems at ${zoom * 100}% browser zoom`);
});

it("reflows every supported route at 320px and 390px phone widths without hiding actions", async (t) => {
  const { page } = await fixture(t, 390, { pathSeeds: [{ id: "path-deep-link", name: "Writing", status: "ACTIVE" }] });
  const problems = [];
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [path, ready] of zoomRoutes) {
      await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
      await page.locator(ready).first().waitFor({ state: "attached" });
      await page.waitForTimeout(150);
      const layout = await zoomedLayout(page);
      if (layout.pageWidth > layout.viewport) problems.push(`${width}px ${path}: page overflows to ${layout.pageWidth}px`);
      if (layout.outside.length) problems.push(`${width}px ${path}: actions outside the viewport: ${layout.outside.join(", ")}`);
      if (layout.hiddenNavigation.length) problems.push(`${width}px ${path}: hidden navigation: ${layout.hiddenNavigation.join(", ")}`);
      if (layout.mainHeight < 44) problems.push(`${width}px ${path}: main content collapses to ${layout.mainHeight}px`);
    }
  }
  assert.deepEqual(problems, [], "Phone-width reflow problems");
});

const focusWorkspaces = ["/", "/board", "/logs", "/notes", "/calendar", "/reports", "/paths", "/labels", "/settings", "/timeline", "/imports"];
for (const width of [390, 1440]) it(`keeps keyboard focus visible and unobscured on every workspace in both Tab directions at ${width}px`, async (t) => {
  // Populated lists make phone pages scroll, so Shift+Tab from the end of the
  // page starts in a scrolled state beneath the sticky and fixed shell UI.
  const { page } = await fixture(t, width, overlayFixture);
  const problems = [];
  for (const route of focusWorkspaces) {
    for (const key of ["Tab", "Shift+Tab"]) {
      await visit(page, route);
      problems.push(...await auditFocusCycle(page, `${route} at ${width}px`, { key }));
    }
  }
  assert.deepEqual(problems, [], `Focus problems at ${width}px`);
});

// Every dialog, menu, and drawer pattern outside the Board workspace
// (board.acceptance.test.mjs covers the Board overlays). Each entry opens one
// overlay state and names the action that dismisses it.
const longText = "Long overlay content keeps scrolling inside the dialog. ".repeat(40).trim();
const overlayPaths = [
  { id: "merge-source", name: "Algorithms", description: longText, status: "ACTIVE", pinned: false },
  { id: "merge-target", name: "Writing", description: "Drafting", status: "ACTIVE", pinned: false },
];
const overlayLabel = { id: "overlay-label", name: "Overlay label", color: "#3B82F6", scopes: ["NOTE", "LOG", "CALENDAR", "SESSION"] };
const overlaySession = { id: "s1", pathId: null, labelIds: [], startedAt: "2026-10-01T09:00:00Z", endedAt: "2026-10-01T10:00:00Z", durationSeconds: 3600, description: longText, source: "MANUAL", running: false };
const overlayFixture = {
  logBody: longText,
  logSeeds: [{ id: "overlay-log", body: longText, occurredAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, labelIds: [] }],
  pathSeeds: overlayPaths,
  pathActivity: [{ id: "activity-1", timeEntryId: "s1", type: "SESSION", title: "Tracked session", detail: longText, occurredAt: "2026-10-01T10:00:00Z" }],
  calendarLabels: [overlayLabel],
  sessionSeeds: [overlaySession],
  noteSeeds: [{ id: "conflict-note", title: "Conflict note", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }] }), contentText: "Original", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, tags: [], pinned: false }],
  noteConflictOnce: { title: "Saved elsewhere", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: longText }] }] }), contentText: longText },
};
const press = (locator, touch) => (touch ? locator.tap() : activate(locator));
const dialogNamed = (page, name) => page.getByRole("dialog", { name });
const overlays = [
  { name: "Global search dialog", path: "/", open: async (page) => {
    await page.keyboard.press("Control+k");
    const overlay = dialogNamed(page, "Search everything");
    await overlay.getByRole("combobox").fill("Reports");
    await page.getByRole("option", { name: "Reports, page" }).waitFor();
    return { overlay, close: overlay.getByRole("button", { name: "Close search" }) };
  } },
  { name: "Session detail dialog", path: "/sessions/s1", open: async (page) => {
    const overlay = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Close session" }) });
    return { overlay, close: overlay.getByRole("button", { name: "Close session" }) };
  } },
  { name: "Session removal confirmation", path: "/sessions/s1", open: async (page, touch) => {
    await press(page.getByRole("button", { name: "Remove…", exact: true }), touch);
    const overlay = page.getByRole("alertdialog");
    return { overlay, close: overlay.getByRole("button", { name: "Keep session" }) };
  } },
  { name: "Session list removal prompt", path: "/", open: async (page, touch) => {
    await press(page.locator(".session-card-actions").getByRole("button", { name: "Remove", exact: true }), touch);
    const overlay = dialogNamed(page, "Remove this session? This cannot be undone.");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
  { name: "Log detail dialog", path: "/logs/log-deep-link", open: async (page) => {
    const overlay = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Close log" }) });
    return { overlay, close: overlay.getByRole("button", { name: "Close log" }) };
  } },
  { name: "Log removal confirmation", path: "/logs/log-deep-link", open: async (page, touch) => {
    await press(page.getByRole("button", { name: "Remove…", exact: true }), touch);
    const overlay = page.getByRole("alertdialog");
    return { overlay, close: overlay.getByRole("button", { name: "Keep log" }) };
  } },
  { name: "Log list removal prompt", path: "/logs", open: async (page, touch) => {
    await press(page.getByRole("button", { name: /^Remove log from / }).first(), touch);
    const overlay = dialogNamed(page, "Remove this log? This cannot be undone.");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
  { name: "Log label picker menu", path: "/logs", modal: false, keyboard: async (page) => {
    await page.getByRole("button", { name: /^Choose labels for log from / }).first().focus();
    await page.keyboard.press("Enter");
    return page.locator(".label-picker-menu");
  }, open: async (page, touch) => {
    await press(page.getByRole("button", { name: /^Choose labels for log from / }).first(), touch);
    const overlay = page.locator(".label-picker-menu");
    return { overlay, close: "Escape" };
  } },
  { name: "Path create dialog", path: "/paths", open: async (page, touch) => {
    await press(page.locator(".paths-page button[aria-label='Add path']"), touch);
    const overlay = dialogNamed(page, "Add a path");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
  { name: "Path history dialog", path: "/paths/merge-source", open: async (page) => {
    const overlay = page.locator(".path-history-dialog");
    await overlay.getByText("Tracked session").waitFor();
    return { overlay, close: overlay.getByRole("button", { name: "Close", exact: true }) };
  } },
  { name: "Path session edit dialog", path: "/paths/merge-source", open: async (page, touch) => {
    await press(page.getByRole("button", { name: "Edit session" }), touch);
    const overlay = page.locator(".session-edit-dialog");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
  { name: "Path merge dialog", path: "/paths", open: async (page, touch) => {
    await press(page.locator(".path", { hasText: "Algorithms" }).getByRole("button", { name: "Edit", exact: true }), touch);
    await press(page.locator("form.path-edit").getByRole("button", { name: "Merge", exact: true }), touch);
    const overlay = dialogNamed(page, "Merge “Algorithms” into…");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
  { name: "Path removal prompt", path: "/paths", open: async (page, touch) => {
    await press(page.locator(".path", { hasText: "Writing" }).getByRole("button", { name: "Remove", exact: true }), touch);
    const overlay = dialogNamed(page, "Remove Writing? You can undo this for a few seconds.");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
  { name: "Label create dialog", path: "/labels", open: async (page, touch) => {
    await press(page.getByRole("button", { name: "Add label" }), touch);
    const overlay = dialogNamed(page, "Add a label");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
  { name: "Label edit dialog", path: "/labels", open: async (page, touch) => {
    await press(page.getByRole("button", { name: "Edit Overlay label" }), touch);
    const overlay = dialogNamed(page, "Edit Overlay label");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
  { name: "Label history dialog", path: "/labels", open: async (page, touch) => {
    await press(page.getByRole("button", { name: "Show history of Overlay label" }), touch);
    const overlay = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Close history" }) });
    return { overlay, close: overlay.getByRole("button", { name: "Close history" }) };
  } },
  { name: "Label removal prompt", path: "/labels", open: async (page, touch) => {
    await press(page.getByRole("button", { name: "Remove Overlay label" }), touch);
    const overlay = dialogNamed(page, "Remove “Overlay label”?");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
  { name: "Note conflict dialog", path: "/notes/conflict-note", open: async (page) => {
    const editor = page.getByRole("textbox", { name: "Note content" });
    await activate(editor);
    await page.keyboard.type(" changed here");
    const overlay = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Keep my draft" }) });
    await overlay.waitFor({ timeout: 10000 });
    return { overlay, close: overlay.getByRole("button", { name: "Keep my draft" }) };
  } },
  { name: "Note text style menu", path: "/notes/conflict-note", modal: false, keyboardClose: async (page) => page.keyboard.press("Escape"), keyboard: async (page) => {
    await page.getByRole("button", { name: /^Text style:/ }).focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Text style" });
    await menu.waitFor();
    // APG menu pattern: ArrowDown moves focus from the button into the menu.
    await page.keyboard.press("ArrowDown");
    return menu;
  }, open: async (page, touch) => {
    await press(page.getByRole("button", { name: /^Text style:/ }), touch);
    const overlay = page.getByRole("menu", { name: "Text style" });
    return { overlay, close: "Escape" };
  } },
  { name: "Floating tracker panel", path: "/logs", modal: false, keyboard: async (page) => {
    await page.getByRole("button", { name: "Expand tracker" }).focus();
    await page.keyboard.press("Enter");
    return page.locator("#floating-tracker-panel");
  }, keyboardClose: (page) => activate(page.getByRole("button", { name: "Collapse tracker" })), open: async (page, touch) => {
    await press(page.getByRole("button", { name: "Expand tracker" }), touch);
    const overlay = page.locator("#floating-tracker-panel");
    return { overlay, close: page.getByRole("button", { name: "Collapse tracker" }) };
  } },
  { name: "Floating tracker start time prompt", path: "/logs", open: async (page, touch) => {
    await press(page.getByRole("button", { name: "Start timer" }), touch);
    await press(page.getByRole("button", { name: /^Edit timer start time/ }), touch);
    const overlay = dialogNamed(page, "Started at");
    return { overlay, close: overlay.getByRole("button", { name: "Cancel", exact: true }) };
  } },
];

for (const { name, path, open, keyboard, keyboardClose, modal = true } of overlays) {
  for (const [width, height] of [[390, 320], [1440, 900]]) {
    it(`keeps the ${name} focus visible, scroll contained, and closable at ${width}×${height}`, async (t) => {
      const touch = width <= 390;
      const { page } = await fixture(t, width, overlayFixture);
      await page.setViewportSize({ width, height });
      await visit(page, path);
      const label = `${name} at ${width}×${height}`;
      const problems = [];
      const markScope = (overlay) => overlay.evaluate((element) => {
        document.querySelectorAll("[data-audit-scope]").forEach((node) => delete node.dataset.auditScope);
        element.dataset.auditScope = "true";
      });
      const auditFocus = async (overlay) => {
        await markScope(overlay);
        let focusLeftOverlay = false;
        problems.push(...await auditFocusCycle(page, label, {
          scope: '[data-audit-scope="true"]',
          stopOutside: !modal,
          onFocusState: async (focus) => {
            if (!focus.inScope) focusLeftOverlay = true;
            else if (!modal && !await overlay.isVisible()) {
              // Give the browser's focus transfer and the menu's close
              // transition time to agree before deciding it hid focused UI.
              const outcome = await page.waitForFunction((selector) => {
                const scope = document.querySelector(selector);
                if (!scope?.contains(document.activeElement)) return "outside";
                const style = getComputedStyle(scope);
                return style.visibility !== "hidden" && scope.getBoundingClientRect().width > 0
                  ? "visible"
                  : false;
              }, '[data-audit-scope="true"]', { timeout: 1000 })
                .then((handle) => handle.jsonValue())
                .catch(() => "stuck");
              if (outcome === "outside") focusLeftOverlay = true;
              else if (outcome === "stuck")
                problems.push(`${label}: the overlay closed while keyboard focus remained inside it`);
            }
          },
        }));
        // A non-modal menu may close when Tab moves focus out of it.
        if (!modal && !focusLeftOverlay && !await overlay.isVisible())
          problems.push(`${label}: the overlay closed while keyboard focus remained inside it`);
      };
      // Non-modal menus and panels are opened from the keyboard for the focus
      // audit, then reopened by touch or pointer for containment and closing.
      if (keyboard) {
        const overlay = await keyboard(page);
        await overlay.waitFor();
        // Let menu enter transitions finish; they disable hit-testing.
        await page.waitForTimeout(300);
        await auditFocus(overlay);
        if (await overlay.isVisible()) {
          if (keyboardClose) await keyboardClose(page);
          else {
            // The cycle may end with focus back on the page; Escape belongs to the overlay.
            await overlay.locator("input, button, [tabindex]").first().focus();
            await page.keyboard.press("Escape");
          }
          await overlay.waitFor({ state: "hidden", timeout: 3000 }).catch(() => problems.push(`${label}: the overlay did not close from the keyboard`));
        }
      }
      const { overlay, close } = await open(page, touch);
      await overlay.waitFor();
      await page.waitForTimeout(300);
      if (!keyboard) await auditFocus(overlay);
      await markScope(overlay);
      problems.push(...await auditContainment(page, overlay, label));
      if (close === "Escape") {
        await page.keyboard.press("Escape");
        await overlay.waitFor({ state: "hidden", timeout: 3000 }).catch(() => problems.push(`${label}: Escape did not close the overlay`));
      } else {
        problems.push(...await auditCloseAction(page, overlay, close, label, { touch }));
      }
      assert.deepEqual(problems, [], `${label} problems`);
    });
  }
}

it("keeps core mobile routes readable without horizontal page overflow at enlarged text", async (t) => {
  const { page } = await fixture(t, 390);
  for (const path of ["/logs", "/notes", "/calendar", "/settings", "/imports"]) {
    await visit(page, path);
    await page.locator(".dashboard-shell > main h1").waitFor();
    await page.addStyleTag({
      content: "h1, h2, h3, p, label, button, a, input, select, textarea { font-size: max(24px, 150%) !important; }",
    });
    const result = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
      headingSize: Number.parseFloat(getComputedStyle(document.querySelector("h1")).fontSize),
    }));
    assert.ok(result.headingSize >= 24, `${path}: expected enlarged heading text, got ${result.headingSize}px`);
    assert.ok(result.page <= result.viewport, `${path}: enlarged text caused horizontal page overflow (${result.page}px > ${result.viewport}px)`);
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
  const { page, requests } = await fixture(t, 1440);
  await page.getByRole("textbox", { name: "Timer description" }).fill("Persist across views");
  await activate(page.getByRole("button", { name: "Start timer" }));
  await page.getByRole("button", { name: "Stop timer" }).waitFor();

  await visit(page, "/board");
  await page.locator(".board-page").waitFor();
  const floatingTracker = page.locator(".floating-tracker-host:not(.inline)");
  await floatingTracker.waitFor();
  assert.equal(await floatingTracker.isVisible(), true, "a running session is shown by the floating tracker outside Sessions");
  await floatingTracker.getByRole("button", { name: "Stop timer" }).waitFor();
  await page.reload();
  await page.locator(".board-page").waitFor();
  await floatingTracker.waitFor();
  await floatingTracker.getByRole("button", { name: "Stop timer" }).waitFor();
  assert.ok(requests.filter((path) => path === "/timers/current").length >= 3, "route and reload re-read server-owned timer state");
  assert.equal(new URL(page.url()).pathname, "/board");
});

it("keeps a paused session understandable after route navigation and reload", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.getByRole("textbox", { name: "Timer description" }).fill("Paused browser session");
  await activate(page.getByRole("button", { name: "Start timer" }));
  await activate(page.getByRole("button", { name: "Pause session" }));
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
  assert.equal(await skipLink.getAttribute("href"), "#main-content");
  await skipLink.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.id === "main-content");
});

it("shows a visible keyboard focus ring that is not covered by the shell", async (t) => {
  const { page } = await fixture(t, 390);
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      name: element.getAttribute("aria-label") || element.textContent?.trim(),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight,
      covered: center !== element && !element.contains(center),
    };
  });
  assert.ok(focus, "Tab should move focus to a visible control");
  assert.equal(focus.outlineStyle, "solid");
  assert.equal(focus.outlineWidth, "2px");
  assert.equal(focus.visible, true, JSON.stringify(focus));
  assert.equal(focus.covered, false, JSON.stringify(focus));
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

it("reaches milestone-four destinations from mobile navigation", async (t) => {
  const { page } = await fixture(t, 390);
  const destinations = [
    ["Board", "/board", ".board-page"],
    ["Logs", "/logs", ".logs-page"],
    ["Notes", "/notes", ".notes-page"],
    ["Calendar", "/calendar", ".calendar-page"],
    ["Reports", "/reports", ".reports-page"],
    ["Paths", "/paths", ".paths-page"],
    ["Labels", "/labels", ".labels-view"],
  ];
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const [name, path, selector] of destinations) {
    await activate(nav.getByRole("link", { name, exact: true }));
    await page.waitForFunction((expectedPath) => location.pathname === expectedPath, path);
    await page.locator(selector).waitFor();
  }

  await activate(page.getByRole("link", { name: "Settings", exact: true }));
  await page.waitForFunction(() => location.pathname === "/settings");
  await page.locator(".settings-view").waitFor();
  await activate(page.getByRole("tab", { name: "Import", exact: true }));
  await page.getByRole("tabpanel", { name: "Import" }).waitFor();
  await page.getByRole("textbox", { name: "Knowledge Base CSV" }).waitFor();
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

it("shows a safe not-found page for unknown URLs", async (t) => {
  const { page } = await fixture(t, 1440);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${server.resolvedUrls.local[0]}unknown-ototest-route`);

    await page.getByRole("heading", { name: "Page not found" }).waitFor();
    assert.equal(await page.locator(".session-list, .notes-page, .logs-page").count(), 0);
    assert.equal(await page.title(), "Knowledge Base · Page not found");
    const sessionsLink = page.getByRole("link", { name: "Go to Sessions" });
    const bounds = await sessionsLink.boundingBox();
    assert.ok(bounds && bounds.height >= 44, `Sessions recovery link is at least 44px tall at ${width}px`);
    await activate(sessionsLink);
    await page.locator(".session-list").waitFor();
    assert.equal(new URL(page.url()).pathname, "/");
  }
});

it("rejects external and protocol-relative post-login redirects", async (t) => {
  for (const redirect of ["https://outside.example/path", "//outside.example/path"]) {
    const { page } = await fixture(t, 1440, { authenticated: false });
    await page.goto(`${server.resolvedUrls.local[0]}reports?redirect=${encodeURIComponent(redirect)}`);
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    await page.getByRole("textbox", { name: "Email" }).fill("nav-test@example.test");
    await page.getByRole("textbox", { name: "Password" }).fill("nav-test-password");
    await activate(page.getByRole("button", { name: "Sign in" }));
    await page.waitForFunction(() => location.pathname === "/");
    assert.equal(new URL(page.url()).origin, new URL(server.resolvedUrls.local[0]).origin);
    assert.equal(new URL(page.url()).pathname, "/");
  }
});

it("clears authentication on sign-out and keeps protected routes gated on Back and reload", async (t) => {
  const { page } = await fixture(t, 1440);
  await visit(page, "/reports");
  await page.locator(".reports-page").waitFor();
  await activate(page.getByRole("button", { name: "Sign out" }));
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

it("opens each primary navigation route and updates the active link and title", async (t) => {
  const { page } = await fixture(t, 1440);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const destinations = [
    ["Board", "/board", ".board-page", "Board", "Boards"],
    ["Logs", "/logs", ".logs-page", "Logs", "Logs"],
    ["Notes", "/notes", ".notes-page", "Notes", "Notes"],
    ["Calendar", "/calendar", ".calendar-page", "Calendar", "Calendar"],
    ["Reports", "/reports", ".reports-page", "Reports", "Reports"],
    ["Paths", "/paths", ".paths-page", "Paths", "Your paths"],
    ["Labels", "/labels", ".labels-view", "Labels", "Labels"],
  ];

  for (const [label, path, selector, title, heading] of destinations) {
    const link = nav.getByRole("link", { name: label, exact: true });
    assert.equal(await link.evaluate((element) => element.tagName), "A");
    assert.equal(await link.getAttribute("href"), path);
    await activate(link);
    await page.waitForFunction((expected) => location.pathname === expected, path);
    await page.locator(selector).waitFor();
    const activeLink = nav.getByRole("link", { name: label, exact: true });
    assert.equal(await activeLink.getAttribute("aria-current"), "page");
    await page.waitForFunction((expected) => document.title === expected, `Knowledge Base · ${title}`);
    await page.getByRole("main").getByRole("heading", { name: heading, level: 1, exact: true }).waitFor();
  }

  await activate(nav.getByRole("link", { name: "Board", exact: true }));
  await page.waitForFunction(() => location.pathname === "/board");
  await activate(nav.getByRole("link", { name: "Logs", exact: true }));
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/board");
  await page.waitForFunction(() => document.title === "Knowledge Base · Board");
  await page.goForward();
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.waitForFunction(() => document.title === "Knowledge Base · Logs");
});

it("restores the Log search query from a direct URL after reload", async (t) => {
  const { page } = await fixture(t, 1280, {
    logSeeds: [
      { id: "log-match", body: "A distinctive browser query", occurredAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, labelIds: [] },
      { id: "log-other", body: "A different entry", occurredAt: "2026-10-02T10:00:00Z", createdAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", version: 1, labelIds: [] },
    ],
  });
  await page.goto(`${server.resolvedUrls.local[0]}logs?q=distinctive`);
  await page.locator(".log-entry", { hasText: "A distinctive browser query" }).waitFor();
  assert.equal(await page.locator(".log-entry").count(), 1, "The direct-link query filters the loaded list");
  await page.keyboard.press("/");
  assert.equal(await page.getByRole("searchbox", { name: "Search all logs" }).inputValue(), "distinctive");
  await page.reload();
  await page.locator(".log-entry", { hasText: "A distinctive browser query" }).waitFor();
  assert.equal(await page.locator(".log-entry").count(), 1, "Reload preserves the filtered result from the URL");
});

it("creates a Log with phone-width controls and keeps Save reachable after viewport resize", async (t) => {
  const { page } = await fixture(t, 390);
  await page.goto(`${server.resolvedUrls.local[0]}logs`);

  const body = page.getByRole("textbox", { name: "Log text" });
  const timestamp = page.getByRole("textbox", { name: "Log timestamp" });
  await body.fill("A log created from the phone layout");
  await page.setViewportSize({ width: 390, height: 420 });
  await timestamp.focus();
  await timestamp.fill("2026-10-01T09:30");

  const save = page.getByRole("button", { name: "Save", exact: true });
  await save.scrollIntoViewIfNeeded();
  const saveVisible = await save.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  });
  assert.equal(saveVisible, true, "Save remains reachable after the phone viewport shrinks around the active timestamp field");
  assert.equal(await body.inputValue(), "A log created from the phone layout", "Viewport resizing preserves the draft text");
  const createRequest = page.waitForRequest((request) => {
    if (request.method() !== "POST" || !new URL(request.url()).pathname.endsWith("/logs")) return false;
    const payload = request.postDataJSON();
    return payload.body === "A log created from the phone layout" && payload.occurredAt === "2026-10-01T09:30:00.000Z";
  });
  await activate(save);
  await createRequest;
  await page.locator(".log-entry", { hasText: "A log created from the phone layout" }).waitFor();

  const targetSizes = await Promise.all([body, timestamp, save].map((locator) =>
    locator.evaluate((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }),
  ));
  for (const size of targetSizes) {
    assert.ok(size.width >= 44 && size.height >= 44, `Expected a 44px phone touch target, got ${size.width}×${size.height}px`);
  }
});

it("edits a Log in the browser and reloads the saved text", async (t) => {
  const { page } = await fixture(t, 1280, {
    logSeeds: [{ id: "edit-log", body: "Original browser log text", occurredAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, labelIds: [] }],
  });
  await page.goto(`${server.resolvedUrls.local[0]}logs`);
  const entry = page.locator("#log-edit-log");
  await entry.getByText("Original browser log text", { exact: true }).waitFor();
  await activate(entry.getByRole("button", { name: /^Edit log from / }));
  const editor = entry.getByRole("textbox", { name: /^Edit log text from / });
  await editor.fill("Saved browser log edit");
  await activate(entry.getByRole("button", { name: "Save", exact: true }));
  await page.locator(".log-entry", { hasText: "Saved browser log edit" }).waitFor();

  await page.reload();
  await page.locator(".log-entry", { hasText: "Saved browser log edit" }).waitFor();
  assert.equal(await page.locator(".log-entry", { hasText: "Original browser log text" }).count(), 0);
});

it("keeps a phone Log edit and timestamp after a failed save, then retries by touch", async (t) => {
  const { page, requests } = await fixture(t, 390, {
    failLogUpdateOnce: true,
    logSeeds: [{ id: "phone-edit-log", body: "Original phone Log", occurredAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, labelIds: [] }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${server.resolvedUrls.local[0]}logs`);
  const entry = page.locator("#log-phone-edit-log");
  await entry.getByText("Original phone Log", { exact: true }).waitFor();
  await entry.getByRole("button", { name: /^Edit log from / }).tap();
  const editor = entry.getByRole("textbox", { name: /^Edit log text from / });
  const timestamp = entry.getByLabel("Edit log timestamp", { exact: true });
  await editor.fill("Phone Log draft survives the rejected save");
  await timestamp.fill("2026-10-02T11:30");
  await editor.focus();
  await page.setViewportSize({ width: 390, height: 320 });

  const save = entry.getByRole("button", { name: "Save", exact: true });
  await save.scrollIntoViewIfNeeded();
  assert.equal(await save.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }), true, "Save remains reachable above the keyboard-like viewport");
  await save.tap();
  await page.getByRole("alert").filter({ hasText: "Unable to save this log. Your text is still here; try again." }).waitFor();
  assert.equal(await editor.inputValue(), "Phone Log draft survives the rejected save");
  assert.equal(await timestamp.inputValue(), "2026-10-02T11:30");
  assert.equal(requests.filter((path) => path === "/logs/phone-edit-log").length, 1);

  await save.tap();
  await page.getByText("Phone Log draft survives the rejected save", { exact: true }).waitFor();
  assert.equal(requests.filter((path) => path === "/logs/phone-edit-log").length, 2);
});

it("confirms Log removal, preserves it on cancel or failure, then retries successfully", async (t) => {
  const { page, requests } = await fixture(t, 1280, {
    failLogDeleteOnce: true,
    logSeeds: [
      { id: "remove-log", body: "Keep or remove this browser log", occurredAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, labelIds: [] },
      { id: "other-log", body: "Untouched browser log", occurredAt: "2026-10-02T10:00:00Z", createdAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", version: 1, labelIds: [] },
    ],
  });
  await visit(page, "/logs");
  const entry = page.locator(".log-entry", { hasText: "Keep or remove this browser log" });
  const remove = entry.getByRole("button", { name: /^Remove log from / });
  await activate(remove);
  const dialog = page.getByRole("dialog", { name: "Remove this log? This cannot be undone." });
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute("aria-modal"), "true");
  await page.keyboard.press("Escape");
  await entry.waitFor();
  assert.equal(requests.includes("/logs/remove-log"), false, "Escape cancels without sending a delete request");

  await activate(remove);
  await dialog.waitFor();
  await activate(dialog.getByRole("button", { name: "Cancel" }));
  await entry.waitFor();
  assert.equal(await remove.evaluate((button) => button === document.activeElement), true, "Cancel returns focus to the Remove log control");
  assert.equal(requests.includes("/logs/remove-log"), false, "Cancel sends no delete request");

  await activate(remove);
  await activate(page.getByRole("dialog", { name: "Remove this log? This cannot be undone." }).getByRole("button", { name: "Confirm" }));
  await page.getByRole("alert").filter({ hasText: "Unable to remove this log. Please try again." }).waitFor();
  await entry.waitFor();
  assert.equal(requests.filter((path) => path === "/logs/remove-log").length, 1, "The failed attempt leaves the record in the list");

  await activate(remove);
  await activate(page.getByRole("dialog", { name: "Remove this log? This cannot be undone." }).getByRole("button", { name: "Confirm" }));
  await entry.waitFor({ state: "detached" });
  await page.locator(".log-entry", { hasText: "Untouched browser log" }).waitFor();
  assert.equal(requests.filter((path) => path === "/logs/remove-log").length, 2);
});

it("downloads the Knowledge Base export from Settings in the browser", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await visit(page, "/settings");
  await activate(page.getByRole("tab", { name: "Export" }));
  const download = page.waitForEvent("download");
  await activate(page.getByRole("button", { name: "Download Knowledge Base CSV" }));
  const file = await download;
  assert.equal(file.suggestedFilename(), "knowledge-base-export.csv");
  await page.getByRole("status").filter({ hasText: "Your Knowledge Base export is ready." }).waitFor();
  assert.ok(requests.includes("/imports/knowledge-base/export"));
});

it("downloads a Knowledge Base export from Settings at phone width", async (t) => {
  const { page, requests } = await fixture(t, 390);
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/settings");
  await page.getByRole("tab", { name: "Export" }).tap();
  const action = page.getByRole("button", { name: "Download Knowledge Base CSV" });
  const bounds = await action.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.height >= 44, JSON.stringify(bounds));
  const download = page.waitForEvent("download");
  await action.tap();
  const file = await download;
  assert.equal(file.suggestedFilename(), "knowledge-base-export.csv");
  await page.getByRole("status").filter({ hasText: "Your Knowledge Base export is ready." }).waitFor();
  assert.ok(requests.includes("/imports/knowledge-base/export"));
});

it("opens the Imports route directly and switches import sources", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}imports`);
  await page.locator("#imports-panel-knowledge-base").waitFor();
  assert.match(await page.title(), /Knowledge Base.*Import/);
  assert.equal(await page.getByRole("tab", { name: "Knowledge Base" }).getAttribute("aria-selected"), "true");

  await activate(page.getByRole("tab", { name: "Clockify" }));
  await page.locator("#imports-panel-clockify").waitFor();
  assert.equal(await page.getByRole("tab", { name: "Clockify" }).getAttribute("aria-selected"), "true");
  await until(() => requests.includes("/imports/knowledge-base/batches") && requests.includes("/imports/clockify/batches"));
  assert.ok(requests.includes("/imports/knowledge-base/batches"));
  assert.ok(requests.includes("/imports/clockify/batches"));
});

it("submits a Knowledge Base import and reloads its batch result", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}imports`);
  await page.locator("#imports-panel-knowledge-base").waitFor();
  await page.getByRole("textbox", { name: "Knowledge Base CSV" }).fill("type,id\\nPATH,p1");
  await activate(page.getByRole("button", { name: "Import Knowledge Base data" }));
  await page.getByRole("status").filter({ hasText: "Imported 2 records, skipped 1 duplicates, and created 1 paths." }).waitFor();
  await page.getByText(/2 imported · 1 skipped · 1 paths/).waitFor();
  assert.ok(requests.includes("/imports/knowledge-base"));

  await page.reload();
  await page.locator("#imports-panel-knowledge-base").waitFor();
  await page.getByText(/2 imported · 1 skipped · 1 paths/).waitFor();
});

it("keeps Knowledge Base import data available after a failed request and retries it", async (t) => {
  const { page, requests } = await fixture(t, 1440, { failImportOnce: true });
  await page.goto(`${server.resolvedUrls.local[0]}imports`);
  await page.locator("#imports-panel-knowledge-base").waitFor();
  const csv = page.getByRole("textbox", { name: "Knowledge Base CSV" });
  await csv.fill("type,id\\nPATH,retry-path");
  await activate(page.getByRole("button", { name: "Import Knowledge Base data" }));
  await page.getByRole("alert").filter({ hasText: "Could not import Knowledge Base data." }).waitFor();
  assert.equal(await csv.inputValue(), "type,id\\nPATH,retry-path", "A rejected request keeps the entered CSV");
  assert.equal(await page.getByText(/2 imported · 1 skipped · 1 paths/).count(), 0, "A failed request creates no visible batch");

  await activate(page.getByRole("button", { name: "Import Knowledge Base data" }));
  await page.getByRole("status").filter({ hasText: "Imported 2 records, skipped 1 duplicates, and created 1 paths." }).waitFor();
  await page.getByText(/2 imported · 1 skipped · 1 paths/).waitFor();
  assert.equal(requests.filter((path) => path === "/imports/knowledge-base").length, 2);
});

it("keeps Import and Settings recovery controls reachable in a keyboard-like phone viewport", async (t) => {
  const { page, requests } = await fixture(t, 390, { failImportOnce: true });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${server.resolvedUrls.local[0]}imports`);
  const csv = page.getByRole("textbox", { name: "Knowledge Base CSV" });
  await csv.fill("type,id\\nPATH,mobile-retry-path");
  await csv.focus();
  await page.setViewportSize({ width: 390, height: 320 });
  assert.equal(await csv.evaluate((element) => element === document.activeElement), true);
  assert.equal(await csv.inputValue(), "type,id\\nPATH,mobile-retry-path");
  const importButton = page.getByRole("button", { name: "Import Knowledge Base data" });
  await importButton.scrollIntoViewIfNeeded();
  assert.equal(await importButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }), true, "the Import action can be brought into view above the keyboard-like viewport");
  await importButton.tap();
  await page.getByRole("alert").filter({ hasText: "Could not import Knowledge Base data." }).waitFor();
  assert.equal(await csv.inputValue(), "type,id\\nPATH,mobile-retry-path", "a failed import retains the CSV draft");
  await importButton.tap();
  await page.getByRole("status").filter({ hasText: "Imported 2 records, skipped 1 duplicates, and created 1 paths." }).waitFor();
  assert.equal(requests.filter((path) => path === "/imports/knowledge-base").length, 2);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${server.resolvedUrls.local[0]}settings`);
  await page.getByRole("textbox", { name: "Current password" }).waitFor();
  const currentPassword = page.getByRole("textbox", { name: "Current password" });
  const newPassword = page.getByRole("textbox", { name: "New password", exact: true });
  const confirmPassword = page.getByRole("textbox", { name: "Confirm new password" });
  await currentPassword.fill("current-mobile-password");
  await newPassword.fill("new-mobile-password");
  await confirmPassword.fill("different-mobile-password");
  await confirmPassword.focus();
  await page.setViewportSize({ width: 390, height: 320 });
  assert.equal(await confirmPassword.evaluate((element) => element === document.activeElement), true);
  assert.equal(await currentPassword.inputValue(), "current-mobile-password");
  assert.equal(await newPassword.inputValue(), "new-mobile-password");
  assert.equal(await confirmPassword.inputValue(), "different-mobile-password");
  const changePassword = page.getByRole("button", { name: "Change password" });
  await changePassword.scrollIntoViewIfNeeded();
  assert.equal(await changePassword.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }), true, "the password recovery action can be brought into view above the keyboard-like viewport");
  await changePassword.tap();
  await page.getByRole("alert").filter({ hasText: "Passwords do not match." }).waitFor();
  assert.equal(await newPassword.inputValue(), "new-mobile-password");
  assert.equal(await confirmPassword.inputValue(), "different-mobile-password");
});

it("shows the floating tracker on eligible routes but not Sessions or focused phone inputs", async (t) => {
  const { page } = await fixture(t, 390);
  const floatingTracker = page.locator(".floating-tracker-host:not(.inline)");
  await page.getByRole("textbox", { name: "Timer description" }).fill("Visible floating session");
  await activate(page.getByRole("button", { name: "Start timer" }));
  await page.getByRole("button", { name: "Stop timer" }).waitFor();
  const eligibleRoutes = [...pages.filter((path) => path !== "/"), "/timeline", "/imports", "/board/archive"];
  for (const path of eligibleRoutes) {
    await page.goto(new URL(path, server.resolvedUrls.local[0]).href);
    await floatingTracker.waitFor();
    await floatingTracker.getByRole("button", { name: "Stop timer" }).waitFor();
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
  await activate(page.getByRole("button", { name: "Add path" }));
  await page.getByRole("textbox", { name: "New path name" }).fill("Reading");
  await activate(page.locator("form.path-create-form button[type=submit]"));
  await page.locator(".path-title", { hasText: "Reading" }).waitFor();
  assert.ok(requests.includes("/paths"));

  await page.reload();
  await page.locator(".path-title", { hasText: "Reading" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/paths");
});

it("creates and reloads a Path using only the keyboard", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await visit(page, "/");
  const pathsLink = page.getByRole("link", { name: "Paths", exact: true });
  let pathsReachedByTab = false;
  for (let tab = 0; tab < 30; tab += 1) {
    await page.keyboard.press("Tab");
    if (await pathsLink.evaluate((element) => element === document.activeElement)) {
      pathsReachedByTab = true;
      break;
    }
  }
  assert.equal(pathsReachedByTab, true, "Tab reaches the Paths navigation link");
  await page.keyboard.press("Enter");
  await page.locator(".paths-page").waitFor();
  const trigger = page.getByRole("button", { name: "Add path" });
  let addPathReachedByTab = false;
  for (let tab = 0; tab < 30; tab += 1) {
    await page.keyboard.press("Tab");
    if (await trigger.evaluate((element) => element === document.activeElement)) {
      addPathReachedByTab = true;
      break;
    }
  }
  assert.equal(addPathReachedByTab, true, "Tab reaches the Add path button");
  await page.keyboard.press("Enter");

  const name = page.getByRole("textbox", { name: "New path name" });
  await name.waitFor();
  await page.waitForFunction(() => document.activeElement === document.querySelector('input[aria-label="New path name"]'));
  const nameFocus = await name.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight,
      covered: center !== element && !element.contains(center),
    };
  });
  assert.equal(nameFocus.outlineStyle, "solid", "keyboard-focused Path name input shows a visible focus ring");
  assert.equal(nameFocus.outlineWidth, "2px");
  assert.equal(nameFocus.visible, true, JSON.stringify(nameFocus));
  assert.equal(nameFocus.covered, false, JSON.stringify(nameFocus));
  await page.keyboard.insertText("Keyboard path");
  await page.keyboard.press("Enter");
  await page.locator(".path-title", { hasText: "Keyboard path" }).waitFor();
  assert.ok(requests.includes("/paths"), "Enter submits the focused Path form");
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true, "focus returns to Add path after creation");

  await page.reload();
  await page.locator(".path-title", { hasText: "Keyboard path" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/paths");
});

it("pins a Path and keeps the saved state after browser reload", async (t) => {
  const { page, requests } = await fixture(t, 1440, {
    pathSeeds: [{ id: "path-reading", name: "Reading", status: "ACTIVE", pinned: false }],
  });
  await visit(page, "/paths");
  const pin = page.getByRole("button", { name: "Pin Reading" });
  await pin.waitFor();
  await activate(pin);
  const unpin = page.getByRole("button", { name: "Unpin Reading" });
  await unpin.waitFor();
  assert.equal(await unpin.getAttribute("aria-pressed"), "true");
  assert.ok(requests.includes("/paths/path-reading/pin"));

  await page.reload();
  const reloaded = page.getByRole("button", { name: "Unpin Reading" });
  await reloaded.waitFor();
  assert.equal(await reloaded.getAttribute("aria-pressed"), "true");
});

it("updates the board tab name when its Path is renamed", async (t) => {
  const { page } = await fixture(t, 1440, {
    pathSeeds: [{ id: "path-reading", name: "Reading", status: "ACTIVE", boardId: "board-reading", boardHidden: false }],
  });
  const appUrl = server.resolvedUrls.local[0];
  await page.goto(`${appUrl}paths`);
  await page.locator(".paths-page").waitFor();
  const pathCard = page.locator("article.path").filter({ hasText: "Reading" });
  await activate(pathCard.getByRole("button", { name: "Edit" }));
  await page.getByRole("textbox", { name: "Edit path name" }).fill("Writing");
  await activate(page.getByRole("button", { name: "Save path" }));
  await page.getByRole("heading", { name: "Writing", level: 2 }).waitFor();

  await page.goto(`${appUrl}board`);
  await page.locator(".board-page").waitFor();
  await page.getByRole("button", { name: "Writing", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Reading", exact: true }).count(), 0);
});

it("reorders Paths by keyboard with the accessible Move up action", async (t) => {
  const pathSeeds = [
    { id: "path-a", name: "Algorithms", status: "ACTIVE" },
    { id: "path-b", name: "Writing", status: "ACTIVE" },
  ];
  const { page, pathOrderWrites } = await fixture(t, 1440, { pathSeeds });
  await visit(page, "/paths");
  const up = page.getByRole("button", { name: "Move Writing up" });
  await up.waitFor();
  assert.equal(await page.getByRole("button", { name: "Move Algorithms up" }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Move Writing down" }).isDisabled(), true);
  let moveUpReachedByTab = false;
  for (let tab = 0; tab < 30; tab += 1) {
    await page.keyboard.press("Tab");
    if (await up.evaluate((element) => element === document.activeElement)) {
      moveUpReachedByTab = true;
      break;
    }
  }
  assert.equal(moveUpReachedByTab, true, "Tab reaches the accessible Move up action");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll(".path-title")].map((node) => node.textContent?.trim()).join(",") === "Writing,Algorithms");
  const down = page.getByRole("button", { name: "Move Writing down" });
  assert.equal(await down.isDisabled(), false);
  let moveDownReachedByTab = false;
  for (let tab = 0; tab < 30; tab += 1) {
    await page.keyboard.press("Tab");
    if (await down.evaluate((element) => element === document.activeElement)) {
      moveDownReachedByTab = true;
      break;
    }
  }
  assert.equal(moveDownReachedByTab, true, "Tab reaches the accessible Move down action");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll(".path-title")].map((node) => node.textContent?.trim()).join(",") === "Algorithms,Writing");
  assert.deepEqual(pathOrderWrites, [["path-b", "path-a"], ["path-a", "path-b"]]);
});

it("reorders Paths by touch with a 44px Move up target", async (t) => {
  const pathSeeds = [
    { id: "path-a", name: "Algorithms", status: "ACTIVE" },
    { id: "path-b", name: "Writing", status: "ACTIVE" },
  ];
  const { page, pathOrderWrites } = await fixture(t, 390, { pathSeeds });
  await visit(page, "/paths");
  const up = page.getByRole("button", { name: "Move Writing up" });
  await up.waitFor();
  const target = await up.boundingBox();
  assert.ok(target && target.width >= 44 && target.height >= 44, JSON.stringify(target));
  await up.tap();
  await page.waitForFunction(() => [...document.querySelectorAll(".path-title")].map((node) => node.textContent?.trim()).join(",") === "Writing,Algorithms");
  assert.deepEqual(pathOrderWrites, [["path-b", "path-a"]]);
});

it("creates a Path by touch at phone width and keeps the dialog usable after viewport shrink", async (t) => {
  const { page } = await fixture(t, 390);
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/paths");
  const trigger = page.locator(".paths-page button[aria-label='Add path']");
  await trigger.tap();
  let dialog = page.getByRole("dialog", { name: "Add a path" });
  await dialog.waitFor();
  await dialog.getByRole("textbox", { name: "New path name" }).fill("Canceled phone Path");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).tap();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await page.getByText("Canceled phone Path", { exact: true }).count(), 0);

  await trigger.tap();
  dialog = page.getByRole("dialog", { name: "Add a path" });
  const name = dialog.getByRole("textbox", { name: "New path name" });
  const description = dialog.getByRole("textbox", { name: "Path description" });
  await name.fill("Saved phone Path");
  await description.fill("Created using the phone layout.");
  await description.focus();
  await page.setViewportSize({ width: 390, height: 320 });
  assert.equal(await description.evaluate((element) => element === document.activeElement), true);
  assert.equal(await name.inputValue(), "Saved phone Path");
  assert.equal(await description.inputValue(), "Created using the phone layout.");
  const dialogBounds = await dialog.boundingBox();
  assert.ok(dialogBounds && dialogBounds.y >= 0 && dialogBounds.y + dialogBounds.height <= 320, JSON.stringify(dialogBounds));
  const add = dialog.getByRole("button", { name: "Add path", exact: true });
  await add.scrollIntoViewIfNeeded();
  assert.equal(await add.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }), true, "the Path save action can be reached above the keyboard-like viewport");
  await add.tap();
  await page.getByRole("heading", { name: "Saved phone Path" }).waitFor();
});

it("edits a Path by touch at phone width and keeps save reachable after viewport shrink", async (t) => {
  const { page } = await fixture(t, 390, {
    pathSeeds: [{ id: "phone-edit-path", name: "Original phone Path", description: "Original description", color: "#3b82f6", status: "ACTIVE", pinned: false }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/paths");
  const pathCard = page.locator("article.path").first();
  await pathCard.getByRole("button", { name: "Edit", exact: true }).tap();
  const name = pathCard.getByRole("textbox", { name: "Edit path name" });
  const description = pathCard.getByRole("textbox", { name: "Edit path description" });
  await name.fill("Edited phone Path");
  await description.fill("Updated description on a phone.");
  await description.focus();
  await page.setViewportSize({ width: 390, height: 320 });
  assert.equal(await name.inputValue(), "Edited phone Path");
  assert.equal(await description.inputValue(), "Updated description on a phone.");
  const save = pathCard.getByRole("button", { name: "Save path", exact: true });
  await save.scrollIntoViewIfNeeded();
  assert.equal(await save.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }), true, "Save path remains reachable after the viewport shrinks");
  await save.tap();
  await pathCard.getByText("Edited phone Path", { exact: true }).waitFor();
  assert.equal(await pathCard.getByText("Updated description on a phone.", { exact: true }).count(), 1);
  await pathCard.getByRole("button", { name: "Edit", exact: true }).tap();
  const editForm = pathCard.locator(".path-edit");
  await editForm.waitFor();
  await editForm.getByRole("button", { name: "Cancel", exact: true }).tap();
  await editForm.waitFor({ state: "detached" });
  await pathCard.getByText("Edited phone Path", { exact: true }).waitFor();
});

it("reorders Paths with browser drag and persists the ordered IDs", async (t) => {
  const pathSeeds = [
    { id: "path-a", name: "Algorithms", status: "ACTIVE" },
    { id: "path-b", name: "Writing", status: "ACTIVE" },
  ];
  const { page, pathOrderWrites } = await fixture(t, 1440, { pathSeeds });
  await page.goto(`${server.resolvedUrls.local[0]}paths`);
  const source = page.locator("article.path").filter({ hasText: "Algorithms" });
  const target = page.locator("article.path").filter({ hasText: "Writing" });
  await source.waitFor();
  await source.dragTo(target);
  await page.waitForFunction(() => [...document.querySelectorAll(".path-title")].map((node) => node.textContent?.trim()).join(",") === "Writing,Algorithms");
  assert.deepEqual(pathOrderWrites, [["path-b", "path-a"]]);
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll(".path-title")].map((node) => node.textContent?.trim()).join(",") === "Writing,Algorithms");
});

it("creates a Label with touch at phone width and keeps its dialog controls usable", async (t) => {
  const { page, calendarLabels } = await fixture(t, 390);
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/labels");
  await page.getByRole("button", { name: "Add label" }).tap();
  let dialog = page.getByRole("dialog", { name: "Add a label" });
  await dialog.waitFor();
  const name = dialog.getByRole("textbox", { name: "Name" });
  await dialog.getByRole("button", { name: "Add label", exact: true }).tap();
  assert.equal(await name.evaluate((input) => input.validity.valueMissing), true);
  assert.equal(await name.evaluate((input) => input === document.activeElement), true);
  assert.equal(calendarLabels.length, 0, "an empty label is rejected before a record is created");

  await name.fill("Phone touch label");
  const blue = dialog.getByRole("button", { name: "Choose label color: Blue (#3B82F6)" });
  await blue.tap();
  assert.equal(await blue.getAttribute("aria-pressed"), "true");
  await dialog.getByLabel("Calendar").tap();
  await dialog.getByRole("button", { name: "Add label", exact: true }).tap();
  await page.getByText("Phone touch label", { exact: true }).waitFor();
  assert.equal(calendarLabels.length, 1);
  assert.equal(calendarLabels[0].color, "#3B82F6");

  await page.getByRole("button", { name: "Add label" }).tap();
  dialog = page.getByRole("dialog", { name: "Add a label" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Canceled phone label");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).tap();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await page.getByText("Canceled phone label", { exact: true }).count(), 0);
});

it("edits a Label with touch at phone width and keeps scope and save controls reachable", async (t) => {
  const { page, calendarLabels } = await fixture(t, 390, {
    calendarLabels: [{ id: "phone-edit-label", name: "Original phone label", color: "#3B82F6", scopes: ["NOTE"] }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/labels");
  await page.getByRole("button", { name: "Edit Original phone label" }).tap();
  let dialog = page.getByRole("dialog", { name: "Edit Original phone label" });
  await dialog.waitFor();
  const name = dialog.getByRole("textbox", { name: "Name" });
  await name.fill("Canceled phone label edit");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).tap();
  await dialog.waitFor({ state: "detached" });
  await page.getByText("Original phone label", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Edit Original phone label" }).tap();
  dialog = page.getByRole("dialog", { name: "Edit Original phone label" });
  await name.fill("Edited phone label");
  const green = dialog.getByRole("button", { name: "Set edit label color: Green (#22C55E)" });
  await green.tap();
  assert.equal(await green.getAttribute("aria-pressed"), "true");
  await dialog.getByLabel("Calendar").tap();
  await name.focus();
  await page.setViewportSize({ width: 390, height: 320 });
  assert.equal(await name.evaluate((input) => input === document.activeElement), true);
  assert.equal(await name.inputValue(), "Edited phone label");
  const bounds = await dialog.boundingBox();
  assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 320, JSON.stringify(bounds));
  const save = dialog.getByRole("button", { name: "Save changes", exact: true });
  await save.scrollIntoViewIfNeeded();
  assert.equal(await save.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }), true, "Save changes remains reachable above the keyboard-like viewport");
  await save.tap();
  await page.getByText("Edited phone label", { exact: true }).waitFor();
  assert.equal(calendarLabels[0].color, "#22C55E");
  assert.equal(calendarLabels[0].name, "Edited phone label");
  assert.ok(calendarLabels[0].scopes.includes("CALENDAR"));
});

it("keeps Label history records and their links readable at phone width", async (t) => {
  const label = { id: "phone-history-label", name: "Long phone history label", color: "#3B82F6", scopes: ["NOTE"] };
  const { page } = await fixture(t, 390, { calendarLabels: [label] });
  await page.route("**/api/v1/labels/phone-history-label/history**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const result = pathname.endsWith("/records")
      ? {
          items: [{
            id: "phone-history-note",
            date: "2026-10-01T10:00:00Z",
            title: `LongUnbrokenPhoneHistoryRecord${"X".repeat(80)} and a wrapped title`,
            preview: "A related Note stays readable in the history panel.",
          }],
          hasMore: false,
        }
      : {
          labelId: label.id,
          name: label.name,
          color: label.color,
          firstUsedAt: "2026-10-01T10:00:00Z",
          lastUsedAt: "2026-10-01T10:00:00Z",
          totalUses: 1,
          trackedSeconds: 3600,
          uses: { sessions: 0, logs: 0, notes: 1, calendarDays: 0, cards: 0 },
          timeline: [{ month: "2026-10", uses: 1, trackedSeconds: 3600 }],
          hours: [],
          related: [],
        };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/labels");
  await page.getByRole("button", { name: `Show history of ${label.name}` }).tap();
  const dialog = page.locator(".label-history-dialog");
  await dialog.waitFor();
  const recordLink = dialog.getByRole("link", { name: /LongUnbrokenPhoneHistoryRecord/ });
  await recordLink.waitFor();
  const bounds = await recordLink.boundingBox();
  const dialogBounds = await dialog.boundingBox();
  assert.ok(bounds && dialogBounds && bounds.x >= dialogBounds.x && bounds.x + bounds.width <= dialogBounds.x + dialogBounds.width, JSON.stringify({ bounds, dialogBounds }));
  assert.equal(await recordLink.getAttribute("href"), "/notes/phone-history-note");
  assert.ok(await dialog.getByText("A related Note stays readable in the history panel.", { exact: true }).isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});

it("moves focus into and returns focus from the Path create dialog", async (t) => {
  const { page } = await fixture(t, 1440);
  await visit(page, "/paths");
  const trigger = page.getByRole("button", { name: "Add path" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator(".path-create-dialog");
  await dialog.waitFor();
  const name = dialog.getByRole("textbox", { name: "New path name" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "New path name");
  assert.equal(await name.evaluate((element) => element === document.activeElement), true);

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
});

it("keeps Path dialog content scrollable without scrolling the background", async (t) => {
  const { page } = await fixture(t, 1280);
  await visit(page, "/paths");
  await page.addStyleTag({ content: ".dashboard-shell > main { min-height: 1600px; } .path-create-dialog { max-height: 180px !important; }" });
  await page.evaluate(() => window.scrollTo(0, 300));
  const { scrollY: beforeDialog } = await page.evaluate(() => ({ scrollY: window.scrollY }));
  assert.ok(beforeDialog > 0, "the underlying page is scrollable before the dialog opens");

  const trigger = page.getByRole("button", { name: "Add path" });
  await trigger.evaluate((element) => element.click());
  const dialog = page.getByRole("dialog", { name: "Add a path" });
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => {
    const element = document.querySelector(".path-create-dialog");
    return element !== null && element.scrollTop > 0;
  });
  assert.equal(await page.evaluate(() => window.scrollY), beforeDialog);

  await page.mouse.wheel(0, 2000);
  await page.waitForFunction(() => {
    const element = document.querySelector(".path-create-dialog");
    return element !== null && element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
  });
  assert.equal(await page.evaluate(() => window.scrollY), beforeDialog);
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
  await visit(page, "/paths");
  await activate(page.getByRole("button", { name: "Edit", exact: true }));
  const editColorButton = page.getByRole("button", { name: "Choose edit path color" });
  await activate(editColorButton);
  const blue = page.getByRole("button", { name: "Set edit path color: Blue (#3B82F6)" });
  await blue.focus();
  await page.keyboard.press("Enter");
  assert.equal(await editColorButton.evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(59, 130, 246)");
  await activate(page.locator("form.path-edit button.primary"));
  await page.locator(".path-title", { hasText: "Keyboard path" }).waitFor();
  assert.equal(paths[0]?.color, "#3B82F6");

  await page.reload();

  await page.locator(".path-title", { hasText: "Keyboard path" }).waitFor();
  assert.equal(
    await page.locator(".path .dot").evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(59, 130, 246)",
  );
});

it("merges Paths into the selected target after destructive confirmation", async (t) => {
  const { page, paths, pathMergeWrites, completedRequests } = await fixture(t, 1440, {
    pathSeeds: [
      { id: "merge-source", name: "Algorithms", description: "Problem solving", status: "ACTIVE", pinned: false },
      { id: "merge-target", name: "Writing", description: "Drafting", status: "ACTIVE", pinned: false },
    ],
  });
  await page.goto(`${server.resolvedUrls.local[0]}paths`);
  await page.locator(".paths-page").waitFor();
  await activate(page.getByRole("button", { name: "Edit", exact: true }).first());
  const mergeTrigger = page.locator("form.path-edit").getByRole("button", { name: "Merge", exact: true });
  await activate(mergeTrigger);

  const chooser = page.getByRole("dialog", { name: "Merge “Algorithms” into…" });
  await chooser.waitFor();
  await page.keyboard.press("Escape");
  await chooser.waitFor({ state: "detached" });
  assert.equal(await mergeTrigger.evaluate((button) => button === document.activeElement), true, "Escape returns focus to the Merge control");
  await activate(mergeTrigger);
  await chooser.waitFor();
  const search = chooser.getByRole("searchbox", { name: "Find a target path" });
  await search.fill("Drafting");
  const target = chooser.getByRole("radio", { name: /Writing/ });
  await target.check();
  await activate(chooser.getByRole("button", { name: "OK" }));

  const confirmation = page.getByRole("dialog", { name: "Merge Algorithms into Writing? All sessions will move and Algorithms will be removed." });
  await confirmation.waitFor();
  assert.equal(await confirmation.getAttribute("aria-modal"), "true");
  const pathReadsBeforeMerge = completedRequests.filter((path) => path === "/paths").length;
  await activate(confirmation.getByRole("button", { name: "Confirm" }));

  await until(() => pathMergeWrites.length === 1);
  await until(() => completedRequests.filter((path) => path === "/paths").length > pathReadsBeforeMerge);
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll(".path-title")].map((element) => element.textContent?.trim());
    return titles.length === 1 && titles[0] === "Writing";
  });
  assert.equal(await page.locator(".path-title", { hasText: "Algorithms" }).count(), 0);
  assert.deepEqual(pathMergeWrites, [{ sourceId: "merge-source", targetPathId: "merge-target" }]);
  assert.deepEqual(paths.map(({ id }) => id), ["merge-target"]);
});

it("shows the source, target, and irreversible merge result before phone confirmation", async (t) => {
  const { page, paths, pathMergeWrites, completedRequests } = await fixture(t, 390, {
    pathSeeds: [
      { id: "phone-merge-source", name: "Phone source", description: "Source identity", status: "ACTIVE", pinned: false },
      { id: "phone-merge-target", name: "Phone target", description: "Target identity", status: "ACTIVE", pinned: false },
    ],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/paths");
  const source = page.locator("article.path").first();
  await source.getByRole("button", { name: "Edit", exact: true }).tap();
  await source.locator("form.path-edit").getByRole("button", { name: "Merge", exact: true }).tap();
  const chooser = page.getByRole("dialog", { name: "Merge “Phone source” into…" });
  await chooser.waitFor();
  const target = chooser.getByRole("radio", { name: /Phone target/ });
  await target.tap();
  await chooser.getByRole("button", { name: "OK", exact: true }).tap();

  const confirmation = page.getByRole("dialog", { name: "Merge Phone source into Phone target? All sessions will move and Phone source will be removed." });
  await confirmation.waitFor();
  const confirmationText = await confirmation.innerText();
  for (const expected of ["Phone source", "Phone target", "All sessions will move", "will be removed"]) {
    assert.ok(confirmationText.includes(expected), `The phone confirmation must identify ${expected}`);
  }
  const bounds = await confirmation.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, JSON.stringify(bounds));
  const pathReadsBeforeMerge = completedRequests.filter((path) => path === "/paths").length;
  await confirmation.getByRole("button", { name: "Confirm", exact: true }).tap();
  await until(() => pathMergeWrites.length === 1);
  await until(() => completedRequests.filter((path) => path === "/paths").length > pathReadsBeforeMerge);
  await page.locator(".path-title", { hasText: "Phone target" }).waitFor();
  await page.locator(".path-title", { hasText: "Phone source" }).waitFor({ state: "detached" });
  assert.deepEqual(pathMergeWrites, [{ sourceId: "phone-merge-source", targetPathId: "phone-merge-target" }]);
  assert.deepEqual(paths.map(({ id }) => id), ["phone-merge-target"]);
});

it("confirms Path removal and restores it through the Undo action", async (t) => {
  const { page, paths, requests } = await fixture(t, 1440, {
    pathSeeds: [{ id: "undo-path", name: "Undo path", description: "Keep this path recoverable", status: "ACTIVE", pinned: false }],
  });
  await page.clock.install();
  await page.goto(`${server.resolvedUrls.local[0]}paths`);
  const row = page.locator(".path", { hasText: "Undo path" });
  await activate(row.getByRole("button", { name: "Remove", exact: true }));
  const dialog = page.getByRole("dialog", { name: "Remove Undo path? You can undo this for a few seconds." });
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await row.waitFor();
  assert.equal(requests.includes("/paths/undo-path"), false, "Escape cancels without deleting the Path");

  await activate(row.getByRole("button", { name: "Remove", exact: true }));
  await activate(page.getByRole("dialog", { name: "Remove Undo path? You can undo this for a few seconds." }).getByRole("button", { name: "Confirm" }));
  await row.waitFor({ state: "detached" });
  const snackbar = page.getByRole("status").filter({ hasText: "Removed “Undo path”." });
  await snackbar.waitFor();
  assert.equal(paths.length, 0);
  await page.clock.fastForward(7000);
  assert.equal(await snackbar.isVisible(), true, "the named Undo action remains available for at least seven seconds");
  await activate(snackbar.getByRole("button", { name: "Undo" }));
  await page.locator(".path-title", { hasText: "Undo path" }).waitFor();
  assert.deepEqual(paths.map(({ id }) => id), ["undo-path"]);
  assert.ok(requests.includes("/paths/undo-path/restore"));
});

it("keeps Path removal Undo visible and tappable at phone width", async (t) => {
  const { page, paths, requests } = await fixture(t, 390, {
    pathSeeds: [{ id: "phone-undo-path", name: "Phone Undo path", description: "Restore from the snackbar", status: "ACTIVE", pinned: false }],
  });
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/paths");
  const row = page.locator("article.path").first();
  await row.getByRole("button", { name: "Remove", exact: true }).tap();
  const dialog = page.getByRole("dialog", { name: "Remove Phone Undo path? You can undo this for a few seconds." });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).tap();
  await row.waitFor({ state: "detached" });

  const snackbar = page.getByRole("status").filter({ hasText: "Removed “Phone Undo path”." });
  const undo = snackbar.getByRole("button", { name: "Undo" });
  await undo.waitFor();
  await page.clock.fastForward(1200);
  const bounds = await undo.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844, JSON.stringify(bounds));
  const unobscured = await undo.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(top && (top === element || element.contains(top)));
  });
  assert.equal(unobscured, true, "Undo must not be covered by another fixed control");
  await undo.tap();
  await page.locator(".path-title", { hasText: "Phone Undo path" }).waitFor();
  assert.deepEqual(paths.map(({ id }) => id), ["phone-undo-path"]);
  assert.ok(requests.includes("/paths/phone-undo-path/restore"));
});

it("preserves a Timeline activity note after failure and saves it on retry", async (t) => {
  const { page, requests } = await fixture(t, 1280, {
    failTimelineNoteOnce: true,
    timelineSeeds: [{ id: "activity-note-source", type: "TIME_TRACKED", title: "Browser activity for notes", detail: "Completed a focused work session", occurredAt: "2026-10-01T10:00:00Z", timeEntryId: "session-activity-note" }],
  });
  await page.goto(`${server.resolvedUrls.local[0]}timeline`);
  const activity = page.locator(".timeline-entry", { hasText: "Browser activity for notes" });
  await activate(activity.getByRole("button", { name: "Add note" }));
  const editor = activity.locator(".note-editor");
  await editor.getByRole("textbox", { name: "Activity note title" }).fill("A retryable reflection");
  await editor.getByRole("textbox", { name: "Activity note content" }).fill("Keep this draft after the first request fails.");
  await activate(editor.getByRole("button", { name: "Save note" }));

  await page.getByRole("alert").filter({ hasText: "Could not save activity note." }).waitFor();
  assert.equal(await editor.getByRole("textbox", { name: "Activity note title" }).inputValue(), "A retryable reflection");
  assert.equal(await editor.getByRole("textbox", { name: "Activity note content" }).inputValue(), "Keep this draft after the first request fails.");

  await activate(editor.getByRole("button", { name: "Save note" }));
  await editor.waitFor({ state: "detached" });
  assert.equal(requests.filter((path) => path === "/notes").length, 2, "Retry issues the second note request after the 503");
  await activity.waitFor();
});

it("filters Timeline activity with phone-width controls and sends the selected values", async (t) => {
  const { page } = await fixture(t, 390, {
    pathSeeds: [{ id: "timeline-path", name: "Timeline Path", status: "ACTIVE" }],
    timelineSeeds: [{ id: "phone-timeline-activity", type: "TIME_TRACKED", title: "Phone filter activity", detail: "A filtered activity", occurredAt: "2026-10-01T10:00:00Z", pathId: "timeline-path", timeEntryId: "phone-timeline-session" }],
  });
  await page.goto(`${server.resolvedUrls.local[0]}timeline`);
  await page.getByRole("heading", { name: "Timeline", exact: true }).waitFor();

  const activityType = page.getByRole("combobox", { name: "Activity type" });
  const path = page.getByRole("combobox", { name: "Path" });
  const from = page.getByRole("textbox", { name: "From date" });
  const to = page.getByRole("textbox", { name: "To date" });
  await activityType.locator("option").filter({ hasText: "TIME_TRACKED" }).waitFor({ state: "attached" });
  await path.locator("option").filter({ hasText: "Timeline Path" }).waitFor({ state: "attached" });
  await chooseNativeOption(activityType, "TIME_TRACKED");
  await chooseNativeOption(path, "timeline-path");
  await from.fill("2026-09-30");
  await to.fill("2026-10-01");

  const filterRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/activities") &&
      url.searchParams.get("type") === "TIME_TRACKED" &&
      url.searchParams.get("pathId") === "timeline-path" &&
      url.searchParams.get("from") === "2026-09-30T00:00:00Z" &&
      url.searchParams.get("to") === "2026-10-01T23:59:59Z";
  });
  await activate(page.getByRole("button", { name: "Filter", exact: true }));
  await filterRequest;
  await page.getByRole("heading", { name: "Phone filter activity" }).waitFor();

  const touchTargetSizes = await Promise.all([
    activityType,
    path,
    page.getByRole("button", { name: "Filter", exact: true }),
    page.getByRole("button", { name: "Last 7 days" }),
  ].map(async (locator) => locator.evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  })));
  for (const size of touchTargetSizes) {
    assert.ok(size.width >= 44 && size.height >= 44, `Expected a 44px phone touch target, got ${size.width}×${size.height}px`);
  }
});

it("restores a hidden Path board tab after showing it from Paths", async (t) => {
  const { page, requests } = await fixture(t, 1440, {
    pathSeeds: [{ id: "path-1", name: "Writing", status: "ACTIVE", boardId: "board-1", boardHidden: true }],
  });
  const appUrl = server.resolvedUrls.local[0];
  await page.goto(`${appUrl}paths`);
  await page.getByRole("heading", { name: "Paths" }).waitFor();
  await activate(page.getByRole("button", { name: "Edit", exact: true }));

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
  const { page } = await fixture(t, 1440, {
    themeSurfaces: true,
    pathSeeds: [{ id: "path-1", name: "Writing", status: "ACTIVE" }],
    calendarLabels: [{ id: "label-1", name: "Focus", color: "#3B82F6", scopes: ["TIME_ENTRY"] }],
  });
  const search = "?startDate=2026-09-01&endDate=2026-09-07&aggregation=month&pathId=path-1&labelId=label-1";
  await page.goto(`${server.resolvedUrls.local[0]}reports${search}`);
  await page.locator(".reports-page").waitFor();
  const assertReportQuery = async () => {
    await page.waitForFunction(() => location.pathname === "/reports" && new URLSearchParams(location.search).get("startDate") === "2026-09-01");
    const params = new URLSearchParams(new URL(page.url()).search);
    assert.equal(params.get("endDate"), "2026-09-07");
    assert.equal(params.get("aggregation"), "month");
    assert.deepEqual(params.getAll("pathId"), ["path-1"]);
    assert.deepEqual(params.getAll("labelId"), ["label-1"]);
    assert.equal(await page.getByRole("combobox", { name: "Report aggregation" }).inputValue(), "MONTH");
    assert.equal(await page.getByRole("textbox", { name: "Datepicker input" }).inputValue(), expectedReportDateRange("2026-09-01", "2026-09-07"));
    assert.equal(await page.getByLabel("Selected path: Writing").count(), 1);
    assert.equal(await page.locator(".label-picker-control .selected-chip .chip-name").innerText(), "Focus");
    assert.equal(await page.locator(".total-display").innerText(), "01:00:00");
    assert.match(await page.locator(".breakdown-card").innerText(), /Writing/);
  };
  await assertReportQuery();

  await activate(page.locator('a[href="/logs"]').first());
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.locator(".logs-page").waitFor();
  await activate(page.locator('a[href="/reports"]').first());
  await page.waitForFunction(() => location.pathname === "/reports");
  await page.locator(".reports-page").waitFor();
  await assertReportQuery();

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.goForward();
  await assertReportQuery();
});

it("restores a phone report filter across Chrome Back and Forward", async (t) => {
  const { page } = await fixture(t, 390, {
    themeSurfaces: true,
    pathSeeds: [{ id: "path-1", name: "Writing", status: "ACTIVE" }],
  });
  const reportUrl = `${server.resolvedUrls.local[0]}reports?startDate=2026-09-01&endDate=2026-09-07&aggregation=month`;
  await page.goto(reportUrl);
  await page.locator(".reports-page").waitFor();

  const pathFilter = page.getByRole("combobox", { name: "Filter by paths" });
  await pathFilter.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.locator(".breakdown-control").filter({ has: pathFilter }).locator(".v-field").tap();
  await page.getByRole("option", { name: "Writing", exact: true }).tap();
  await page.waitForFunction(() => new URL(location.href).searchParams.getAll("pathId").join(",") === "path-1");
  const filteredUrl = page.url();
  await page.getByLabel("Selected path: Writing").waitFor();

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Logs", exact: true }).tap();
  await page.locator(".logs-page").waitFor();
  await page.goBack();
  await page.waitForTimeout(50);
  assert.equal(page.url(), filteredUrl, "Back restores the report URL with its selected Path filter");
  await page.getByLabel("Selected path: Writing").waitFor();

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/reports" && !new URL(location.href).searchParams.has("pathId"));
  assert.equal(await page.getByLabel("Selected path: Writing").count(), 0);

  await page.goForward();
  await page.waitForFunction(() => new URL(location.href).searchParams.getAll("pathId").join(",") === "path-1");
  await page.getByLabel("Selected path: Writing").waitFor();
  await page.goForward();
  await page.locator(".logs-page").waitFor();
});

it("opens Path, Label, and grouping filters above the floating tracker on a phone", async (t) => {
  const { page } = await fixture(t, 390, {
    themeSurfaces: true,
    pathSeeds: [{ id: "path-1", name: "Writing", status: "ACTIVE" }],
    calendarLabels: [{ id: "label-1", name: "Focus", color: "#3B82F6", scopes: ["TIME_ENTRY"] }],
  });
  const labelsLoaded = page.waitForResponse((response) =>
    response.url().includes("/labels?scope=TIME_ENTRY") && response.ok());
  await page.goto(`${server.resolvedUrls.local[0]}reports?startDate=2026-09-01&endDate=2026-09-07&aggregation=month`);
  await page.locator(".reports-page").waitFor();
  await labelsLoaded;
  const tracker = page.locator(".floating-tracker-bar");
  await tracker.waitFor();
  assert.equal(await tracker.isVisible(), true, "the floating timer is visible before opening filters");

  const pathFilter = page.getByRole("combobox", { name: "Filter by paths" });
  await pathFilter.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.locator(".breakdown-control").filter({ has: pathFilter }).locator(".v-field").tap();
  await page.getByRole("option", { name: "Writing", exact: true }).tap();
  await page.getByLabel("Selected path: Writing").waitFor();
  await page.keyboard.press("Escape");

  const labelFilter = page.locator(".breakdown-toolbar .label-picker-control");
  await labelFilter.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await labelFilter.locator(".picker-chevron").tap();
  await page.getByRole("option", { name: "Focus", exact: true }).tap();
  await page.locator(".label-picker-control .selected-chip .chip-name").filter({ hasText: "Focus" }).waitFor();
  await page.keyboard.press("Escape");

  const groupFilter = page.getByRole("combobox", { name: "Group by" });
  await groupFilter.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.locator(".breakdown-control").filter({ has: groupFilter }).locator(".v-field").tap();
  await page.getByRole("option", { name: "Labels", exact: true }).tap();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("groupBy") === "labels");

  assert.equal(await page.getByLabel("Selected path: Writing").count(), 1);
  assert.equal(await page.locator(".label-picker-control .selected-chip .chip-name").innerText(), "Focus");
  assert.equal(await groupFilter.inputValue(), "Labels");
  assert.equal(await tracker.isVisible(), false, "the floating timer hides while report controls are focused so it cannot cover them");
});

it("loads report filters from a direct query URL and keeps them on reload", async (t) => {
  const { page, reportQueries } = await fixture(t, 1440, {
    themeSurfaces: true,
    pathSeeds: [{ id: "path-1", name: "Writing", status: "ACTIVE" }],
    calendarLabels: [{ id: "label-1", name: "Focus", color: "#3B82F6", scopes: ["TIME_ENTRY"] }],
  });
  const query = "?startDate=2026-09-01&endDate=2026-09-07&aggregation=month&pathId=path-1&labelId=label-1";
  await page.goto(`${server.resolvedUrls.local[0]}reports${query}`);
  await page.locator(".reports-page").waitFor();
  const assertLoadedReportState = async () => {
    await page.waitForFunction(() => document.querySelector('select[aria-label="Report aggregation"]')?.value === "MONTH");
    assert.equal(new URL(page.url()).search, query);
    assert.equal(await page.getByRole("textbox", { name: "Datepicker input" }).inputValue(), expectedReportDateRange("2026-09-01", "2026-09-07"));
    assert.equal(await page.getByLabel("Selected path: Writing").count(), 1);
    assert.equal(await page.locator(".label-picker-control .selected-chip .chip-name").innerText(), "Focus");
    assert.equal(await page.locator(".total-display").innerText(), "01:00:00");
    assert.match(await page.locator(".breakdown-card").innerText(), /Writing/);
  };
  await assertLoadedReportState();

  await page.reload();
  await page.locator(".reports-page").waitFor();
  await assertLoadedReportState();
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
  await activate(aggregation);
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
  await page.locator(".report-chart-card .chart-frame").waitFor();
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
  await activate(page.getByRole("button", { name: "Previous date range" }));
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

it("keeps report filters, chart, and breakdown usable after phone rotation", async (t) => {
  const { page } = await fixture(t, 390, { themeSurfaces: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${server.resolvedUrls.local[0]}reports`);
  await page.locator(".reports-page").waitFor();
  await page.locator(".report-chart-card .chart-frame").waitFor();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const bounds = await page.evaluate(() => {
      const selectors = [".report-date-range", ".report-chart-card .chart-frame", ".breakdown-card"];
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        regions: selectors.map((selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { selector, left: rect.left, right: rect.right };
        }),
      };
    });
    assert.ok(bounds.document <= bounds.viewport, `Report page overflows at ${viewport.width}×${viewport.height}: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.regions.every((region) => region && region.left >= 0 && region.right <= bounds.viewport), JSON.stringify(bounds.regions));
    const pathFilter = page.getByRole("combobox", { name: "Filter by paths" });
    const grouping = page.getByRole("combobox", { name: "Group by" });
    await pathFilter.scrollIntoViewIfNeeded();
    await grouping.scrollIntoViewIfNeeded();
    assert.equal(await pathFilter.isVisible(), true);
    assert.equal(await grouping.isVisible(), true);
  }
});

it("keeps every primary route within the phone viewport", async (t) => {
  const { page } = await fixture(t, 390);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of pages) {
    await visit(page, path);
    const bounds = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    assert.ok(
      bounds.document <= bounds.viewport && bounds.body <= bounds.viewport,
      `${path} overflows the 390px phone viewport: ${JSON.stringify(bounds)}`,
    );
  }
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
  const startDay = await phoneDays.nth(8).locator("time").textContent();
  const endDay = await phoneDays.nth(10).locator("time").textContent();
  await phoneDays.nth(8).tap();
  assert.equal(await phone.page.locator('button.calendar-day[aria-pressed="true"]').count(), 1);
  await phone.page
    .getByRole("status")
    .filter({ hasText: "Choose an end date" })
    .waitFor();
  await phoneDays.nth(10).tap();
  assert.equal(await phone.page.locator('button.calendar-day[aria-pressed="true"]').count(), 1);
  await phone.page.locator(".day-editor-heading h2").filter({ hasText: "–" }).waitFor();
  const rangeTitle = await phone.page.locator(".day-editor-heading h2").textContent();
  assert.ok(rangeTitle?.includes(` ${startDay} `) && rangeTitle.includes(` ${endDay},`), rangeTitle);
  const phoneRangeActions = [
    phone.page.getByRole("button", { name: "Cancel range" }),
    phone.page.getByRole("button", { name: "Apply to range" }),
  ];
  for (const action of phoneRangeActions) {
    await action.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const bounds = await action.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844, JSON.stringify(bounds));
  }
  await phone.page.getByRole("button", { name: "Cancel range" }).tap();
  await phone.page.getByRole("button", { name: "Start date range selection" }).waitFor();
  await phone.page.getByRole("button", { name: "Start date range selection" }).tap();
  await phoneDays.nth(8).tap();
  await phoneDays.nth(10).tap();
  const applied = phone.page.waitForResponse((response) =>
    response.url().includes("/calendar/days/range") && response.request().method() === "PUT",
  );
  await phone.page.getByRole("button", { name: "Apply to range" }).tap();
  await applied;

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
  await page.waitForFunction(() => document.querySelector(".day-editor textarea")?.value === "Phone width calendar note");
  assert.equal(await page.locator(".day-editor textarea").inputValue(), "Phone width calendar note");
});

it("keeps Calendar editing controls reachable after a keyboard-like viewport resize", async (t) => {
  const { page } = await fixture(t, 390, {
    calendarLabels: [{ id: "mobile-label", name: "Vacation", color: "#3B82F6", scopes: ["CALENDAR"] }],
  });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await page.locator(".calendar-page").waitFor();
  await page.locator("button.calendar-day:not(.muted)").nth(2).tap();
  const note = page.locator(".day-editor textarea");
  await note.tap();
  await note.fill("Keep this mobile draft");

  // A reduced viewport models the visible area above a software keyboard.
  await page.setViewportSize({ width: 390, height: 320 });
  await note.scrollIntoViewIfNeeded();
  const labelTrigger = page.locator(".new-calendar-label .picker-chevron");
  await labelTrigger.scrollIntoViewIfNeeded();
  const labelBounds = await labelTrigger.boundingBox();
  assert.ok(labelBounds && labelBounds.y < 320 && labelBounds.y + labelBounds.height > 0);
  await labelTrigger.tap();
  await page.getByRole("combobox", { name: "Add or create calendar label" }).waitFor();
  const save = page.getByRole("button", { name: "Save day" });
  await save.scrollIntoViewIfNeeded();
  const saveBounds = await save.boundingBox();
  assert.ok(saveBounds && saveBounds.y < 320 && saveBounds.y + saveBounds.height > 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  await page.setViewportSize({ width: 390, height: 780 });
  assert.equal(await note.inputValue(), "Keep this mobile draft");
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
  await activate(page.getByRole("button", { name: "Save day" }));
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
  await activate(page.getByRole("button", { name: "Save day" }));
  await saved;

  await page.reload();

  await page.locator(".calendar-page").waitFor();
  await page.waitForFunction(() => {
    const checkbox = document.querySelector('.day-label input[type="checkbox"]');
    return checkbox instanceof HTMLInputElement && checkbox.checked;
  });
  assert.equal(await page.getByRole("checkbox", { name: "Sick leave" }).isChecked(), true);
});

it("assigns a Calendar label to a day by touch at phone width and retains it after reload", async (t) => {
  const label = { id: "phone-calendar-label", name: "Phone vacation", color: "#2878D5", scopes: ["CALENDAR"] };
  const { page } = await fixture(t, 390, { calendarLabels: [label] });
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/calendar");
  await page.locator("button.calendar-day:not(.muted)").nth(2).tap();
  const checkbox = page.getByRole("checkbox", { name: label.name });
  await checkbox.tap();
  assert.equal(await checkbox.isChecked(), true);
  const save = page.getByRole("button", { name: "Save day" });
  await save.scrollIntoViewIfNeeded();
  const saved = page.waitForResponse((response) =>
    response.url().includes("/calendar/days/") && response.request().method() === "PUT",
  );
  await save.tap();
  await saved;

  await page.reload();
  await page.locator(".calendar-page").waitFor();
  await page.waitForFunction(() => {
    const input = document.querySelector('.day-label input[type="checkbox"]');
    return input instanceof HTMLInputElement && input.checked;
  });
  assert.equal(await page.getByRole("checkbox", { name: label.name }).isChecked(), true);
});

it("creates a Calendar label with default scopes and reloads its assignment", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}calendar`);
  await page.locator(".calendar-page").waitFor();
  await activate(page.getByRole("button", { name: "Open label picker" }));
  const input = page.locator('.label-picker-menu input[aria-label="Add or create calendar label"]');
  await input.fill("Vacation");
  const createdLabelResponse = page.waitForResponse((response) =>
    response.url().includes("/labels") && response.request().method() === "POST",
  );
  await activate(page.getByRole("option", { name: "Create Vacation" }));
  const createdLabel = await createdLabelResponse;
  assert.equal(createdLabel.ok(), true, "Calendar label creation completes before checking its defaults");

  assert.deepEqual(
    await createdLabel.json().then(({ color, scopes }) => ({ color, scopes })),
    { color: "#F8FAFC", scopes: ["NOTE", "CALENDAR", "TIME_ENTRY", "LOG", "BOARD"] },
  );
  const checkbox = page.getByRole("checkbox", { name: "Vacation" });
  assert.equal(await checkbox.isChecked(), true);
  const saved = page.waitForResponse((response) =>
    response.url().includes("/calendar/days/") &&
    response.request().method() === "PUT",
  );
  await activate(page.getByRole("button", { name: "Save day" }));
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
  assert.equal(await dialog.getAttribute("aria-modal"), "true");
  assert.equal(new URL(page.url()).pathname, "/logs/log-deep-link");
  assert.ok(requests.includes("/logs/log-deep-link"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.pathname === "/logs");
  await page.getByRole("heading", { name: "Logs", exact: true }).waitFor();
});

it("moves focus into and back from Log removal confirmation in the detail dialog", async (t) => {
  const { page, requests } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}logs/log-deep-link`);
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Directly loaded log entry", { exact: true }).waitFor();
  const remove = dialog.getByRole("button", { name: "Remove…", exact: true });

  await activate(remove);
  const confirmation = page.getByRole("alertdialog");
  const keep = confirmation.getByRole("button", { name: "Keep log" });
  await confirmation.waitFor();
  assert.equal(await keep.evaluate((button) => button === document.activeElement), true, "Focus enters on the safe cancel action");

  await page.keyboard.press("Escape");
  assert.equal(await remove.evaluate((button) => button === document.activeElement), true, "Escape returns focus to the Remove trigger");
  assert.equal(requests.filter((path) => path === "/logs/log-deep-link").length, 1, "Cancellation sends no delete request");

  await activate(remove);
  await confirmation.waitFor();
  await activate(keep);
  assert.equal(await remove.evaluate((button) => button === document.activeElement), true, "Keep log returns focus to the Remove trigger");
  assert.equal(requests.filter((path) => path === "/logs/log-deep-link").length, 1, "Button cancellation sends no delete request");
});

it("returns focus to Edit after cancelling a Log detail edit", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}logs/log-deep-link`);
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Directly loaded log entry", { exact: true }).waitFor();
  const edit = dialog.getByRole("button", { name: "Edit", exact: true });
  await activate(edit);
  const editor = dialog.getByRole("textbox", { name: "Text" });
  await editor.waitFor();
  assert.equal(await editor.evaluate((field) => field === document.activeElement), true, "Edit opens with focus in the text field");

  await activate(dialog.getByRole("button", { name: "Cancel", exact: true }));
  await edit.waitFor();
  assert.equal(await edit.evaluate((button) => button === document.activeElement), true, "Cancel returns focus to the Edit action");
});

it("wraps very long Log text within the phone-width detail layout", async (t) => {
  const longText = `${"UnbrokenText".repeat(80)} ${"A long log entry should wrap around controls and stay readable. ".repeat(30)}`;
  const { page } = await fixture(t, 390, { logBody: longText });
  await page.goto(`${server.resolvedUrls.local[0]}logs/log-deep-link`);
  const dialog = page.getByRole("dialog");
  await dialog.locator(".log-dialog-body").waitFor();
  const body = dialog.locator(".log-dialog-body");
  assert.equal(await body.innerText(), longText);
  const widths = await body.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  assert.ok(widths.scroll <= widths.client, JSON.stringify(widths));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});

it("keeps a long Path description inside its phone-width card", async (t) => {
  const description = `${"UnbrokenDescription".repeat(40)} ${"A long path description should stay inside its card. ".repeat(20)}`;
  const { page } = await fixture(t, 390, {
    pathSeeds: [{ id: "long-description", name: "Reading", description, status: "ACTIVE" }],
  });
  await page.goto(`${server.resolvedUrls.local[0]}paths`);
  const paragraph = page.locator(".path-body > p");
  await paragraph.waitFor();
  assert.ok((await paragraph.textContent()).includes(description.slice(0, 80)));
  const layout = await page.locator("article.path").evaluate((article) => {
    const paragraph = article.querySelector(".path-body > p");
    const rect = article.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      clientWidth: article.clientWidth,
      scrollWidth: article.scrollWidth,
      lineClamp: paragraph && getComputedStyle(paragraph).webkitLineClamp,
    };
  });
  assert.equal(layout.lineClamp, "2");
  assert.ok(layout.left >= 0 && layout.right <= 390, JSON.stringify(layout));
  assert.ok(layout.scrollWidth <= layout.clientWidth, JSON.stringify(layout));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});

it("wraps a long Board card title inside its phone-width card", async (t) => {
  const title = `${"UnbrokenBoardTitle".repeat(20)} ${"A long card title must wrap without pushing adjacent controls. ".repeat(5)}`;
  const { page, requests } = await fixture(t, 390, { boardCardTitle: title });
  await page.goto(`${server.resolvedUrls.local[0]}board?board=board-1`);
  const heading = page.locator(".board-card h3");
  await heading.waitFor();
  assert.equal((await heading.innerText()).trim(), title.trim());
  const layout = await heading.evaluate((element) => {
    const card = element.closest(".board-card");
    const rect = card.getBoundingClientRect();
    return { left: rect.left, right: rect.right, clientWidth: card.clientWidth, scrollWidth: card.scrollWidth };
  });
  assert.ok(layout.left >= 0 && layout.right <= 390, JSON.stringify(layout));
  assert.ok(layout.scrollWidth <= layout.clientWidth, JSON.stringify(layout));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});

it("reorders Board cards with the keyboard as an alternative to dragging", async (t) => {
  const boardCards = [
    { ...card, id: "card-first", position: 0 },
    { ...card, id: "card-second", position: 1 },
  ];
  const { page, requests } = await fixture(t, 1440, { boardCards });
  await page.goto(`${server.resolvedUrls.local[0]}board?board=board-1`);
  const cards = page.locator("article.board-card");
  await cards.nth(0).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await until(() => requests.includes("/boards/board-1/cards/card-first/move"));
  assert.ok(requests.includes("/boards/board-1/cards/card-first/move"));
});

it("shows an add-card action for a loaded empty Board column", async (t) => {
  const { page } = await fixture(t, 390, { boardCards: [] });
  await page.goto(`${server.resolvedUrls.local[0]}board?board=board-1`);
  const empty = page.locator(".kanban-column .column-empty").first();
  await empty.waitFor();
  assert.equal(await empty.innerText(), "No cards yet");
  assert.equal(await page.locator(".board-card").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Add card to Backlog" }).isVisible(), true);
});

it("opens the first-board dialog with keyboard focus and returns focus on Escape", async (t) => {
  const { page } = await fixture(t, 1440, { boardList: [] });
  await page.goto(`${server.resolvedUrls.local[0]}board`);
  const trigger = page.locator(".board-empty button");
  await trigger.waitFor();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "New board" });
  await dialog.waitFor();
  const name = dialog.getByRole("textbox", { name: "New board name" });
  await page.waitForFunction(() => document.activeElement?.id === "new-board-name");
  assert.equal(await name.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
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
  await waitForNoteTitle(page, "Browser deep link");
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), "Browser deep link");
  await page.getByRole("textbox", { name: "Note content" }).waitFor();
  assert.match(await page.getByRole("textbox", { name: "Note content" }).innerText(), /Loaded directly/);
});

it("restores the Notes list and editor through browser Back and Forward", async (t) => {
  const note = {
    id: "history-note",
    title: "History browser note",
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "History body" }] }] }),
    contentText: "History body",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    version: 1,
    tags: [],
    pinned: false,
  };
  const { page } = await fixture(t, 1440, { noteSeeds: [note] });
  await visit(page, "/notes");
  await activate(page.getByRole("link", { name: "Open History browser note" }));
  await page.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/notes/history-note");

  await page.goBack();
  await page.getByRole("link", { name: "Open History browser note" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/notes");

  await page.goForward();
  await page.getByRole("textbox", { name: "Note title" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/notes/history-note");
  await waitForNoteTitle(page, "History browser note");
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), "History browser note");
});

it("keeps a Note draft open when autosave fails during navigation and recovers on retry", async (t) => {
  const note = {
    id: "note-recovery",
    title: "Autosave recovery note",
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Saved version" }] }] }),
    contentText: "Saved version",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    version: 1,
    tags: [],
    pinned: false,
  };
  const { page, requests } = await fixture(t, 1440, { noteSeeds: [note], failNoteUpdateOnce: true });
  await page.goto(`${server.resolvedUrls.local[0]}notes/note-recovery`);
  const title = page.getByRole("textbox", { name: "Note title" });
  const content = page.getByRole("textbox", { name: "Note content" });
  await content.waitFor();
  await content.fill("Draft preserved after failed autosave");
  await page.getByRole("status").filter({ hasText: "Not saved" }).waitFor();

  await activate(page.getByRole("link", { name: "Logs", exact: true }));
  await page.waitForTimeout(100);
  assert.equal(new URL(page.url()).pathname, "/notes/note-recovery", "Failed save blocks navigation away from the editor");
  assert.match(await content.innerText(), /Draft preserved after failed autosave/);

  await activate(page.getByRole("button", { name: "Retry save" }));
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  assert.equal(requests.filter((path) => path === "/notes/note-recovery").length, 3, "One detail read and two update attempts prove the retry");
  await activate(page.getByRole("link", { name: "Logs", exact: true }));
  await page.locator(".logs-page").waitFor();
  assert.equal(new URL(page.url()).pathname, "/logs");

  await page.goto(`${server.resolvedUrls.local[0]}notes`);
  await page.getByText("Draft preserved after failed autosave", { exact: true }).waitFor();
  assert.equal(await page.locator(".note-row").count(), 1, "Retrying the Note update leaves one record in the collection");
  assert.equal(await title.count(), 0, "The editor is closed after the saved draft is recovered");
});

it("restores the archived Notes filter from its direct URL after reload", async (t) => {
  const { page } = await fixture(t, 1280, {
    noteSeeds: [
      { id: "active-note", title: "Active browser note", content: "{}", contentText: "Active", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", version: 1, tags: [], pinned: false, archived: false },
      { id: "archived-note", title: "Archived browser note", content: "{}", contentText: "Archived", createdAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", deletedAt: "2026-10-03T10:00:00Z", version: 1, tags: [], pinned: false, archived: true },
    ],
  });
  await page.goto(`${server.resolvedUrls.local[0]}notes?archived=1`);
  await page.locator(".note-row", { hasText: "Archived browser note" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("archived"), "1");
  assert.equal(await page.locator(".note-row").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Active notes" }).count(), 1);

  await page.reload();
  await page.locator(".note-row", { hasText: "Archived browser note" }).waitFor();
  assert.equal(await page.locator(".note-row").count(), 1, "Reload preserves the archived filter and selected record set");
});

it("archives the selected Note after confirmation and keeps it in the archive after reload", async (t) => {
  const note = (id, title, contentText) => ({
    id,
    title,
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: contentText }] }] }),
    contentText,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    version: 1,
    tags: [],
    pinned: false,
    archived: false,
  });
  const { page, requests } = await fixture(t, 1280, {
    noteSeeds: [
      note("archive-target", "Browser archive target", "Keep this content in Archive"),
      note("archive-other", "Browser archive neighbor", "Leave this note active"),
    ],
  });
  await page.goto(`${server.resolvedUrls.local[0]}notes`);
  const target = page.locator(".note-row", { hasText: "Browser archive target" });
  await target.waitFor();
  let confirmationMessage = "";
  page.once("dialog", async (dialog) => {
    confirmationMessage = dialog.message();
    await dialog.accept();
  });
  const archiveRequest = page.waitForRequest((request) =>
    request.method() === "DELETE" && new URL(request.url()).pathname.endsWith("/notes/archive-target"),
  );
  await activate(target.getByRole("button", { name: "Archive", exact: true }));
  await archiveRequest;
  await target.waitFor({ state: "detached" });
  await page.locator(".note-row", { hasText: "Browser archive neighbor" }).waitFor();
  assert.equal(confirmationMessage, "Move “Browser archive target” to Archive? You can restore it from the archive at any time.");
  assert.equal(requests.filter((path) => path === "/notes/archive-target").length, 1);

  await activate(page.locator(".notes-pagination").getByRole("button", { name: "Archive", exact: true }));
  const archivedTarget = page.locator(".note-row.archived", { hasText: "Browser archive target" });
  await archivedTarget.waitFor();
  await page.waitForFunction(() =>
    document.querySelector(".note-row.archived")?.innerText?.includes("Keep this content in Archive"),
  );
  assert.match(await archivedTarget.innerText(), /Keep this content in Archive/);
  assert.equal(await page.locator(".note-row.archived").count(), 1, "Only the confirmed note is archived");

  await page.reload();
  await page.locator(".note-row.archived", { hasText: "Browser archive target" }).waitFor();
  await page.waitForFunction(() =>
    document.querySelector(".note-row.archived")?.innerText?.includes("Keep this content in Archive"),
  );
  assert.match(await page.locator(".note-row.archived", { hasText: "Browser archive target" }).innerText(), /Keep this content in Archive/);
});

it("restores the Notes search query and filtered result from its direct URL after reload", async (t) => {
  const note = (id, title, contentText) => ({
    id, title, content: "{}", contentText,
    createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z",
    version: 1, tags: [], pinned: false,
  });
  const { page } = await fixture(t, 1280, {
    noteSeeds: [
      note("matching-note", "Browser research", "A distinctive search passage"),
      note("other-note", "Meeting notes", "An unrelated detail"),
    ],
  });
  await page.goto(`${server.resolvedUrls.local[0]}notes?q=distinctive`);
  await page.locator(".note-row", { hasText: "Browser research" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("q"), "distinctive");
  assert.equal(await page.locator(".note-row").count(), 1);
  assert.equal(await page.getByRole("textbox", { name: "Search notes" }).inputValue(), "distinctive");

  await page.reload();
  await page.locator(".note-row", { hasText: "Browser research" }).waitFor();
  assert.equal(await page.locator(".note-row").count(), 1, "Reload preserves the URL query and filtered Notes result");
  assert.equal(await page.getByRole("textbox", { name: "Search notes" }).inputValue(), "distinctive");
});

it("creates a Note with touch at phone width and confirms label, save, and navigation feedback", async (t) => {
  const labelName = "Phone note label";
  const { page } = await fixture(t, 390, {
    calendarLabels: [{ id: "phone-note-label", name: labelName, color: "#2563eb", scopes: ["NOTE"] }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/notes");
  await page.getByRole("button", { name: "Create new note" }).tap();
  await page.waitForFunction(() => /^\/notes\/[^/]+$/.test(location.pathname));
  const title = page.getByRole("textbox", { name: "Note title" });
  const body = page.getByRole("textbox", { name: "Note content" });
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  await title.fill("Phone touch-created note");
  await body.tap();
  await page.keyboard.type("Created and saved through phone-sized touch controls.");

  const pickerButton = page.getByRole("button", { name: "Open label picker" });
  const backButton = page.getByRole("button", { name: "Back to notes" });
  const targetSizes = await Promise.all([pickerButton, backButton].map((locator) =>
    locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  ));
  assert.ok(targetSizes.every(({ width, height }) => width >= 44 && height >= 44), JSON.stringify(targetSizes));
  await pickerButton.tap();
  const labelSearch = page.getByRole("combobox", { name: "Note labels" });
  await labelSearch.fill(labelName);
  await page.getByRole("option").filter({ hasText: labelName }).tap();
  await page.getByRole("button", { name: `Remove ${labelName}` }).waitFor();
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  await backButton.tap();
  await page.waitForFunction(() => location.pathname === "/notes");
  await page.getByRole("link", { name: "Open Phone touch-created note" }).waitFor();
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
  const body = page.getByRole("textbox", { name: "Note content" });
  await body.tap();
  const controls = await page.locator(".note-toolbar button").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  assert.ok(controls.length > 0 && controls.every(({ width, height }) => width >= 44 && height >= 44));
  await page.keyboard.press("Control+A");
  const savedNote = page.waitForResponse((response) =>
    response.request().method() === "PUT" && new URL(response.url()).pathname === "/api/v1/notes/n1",
  );
  await page.getByRole("button", { name: "Bold", exact: true }).tap();
  await body.locator("strong").waitFor();
  await savedNote;
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("button", { name: "Back to notes" }).tap();
  await page.waitForFunction(() => location.pathname === "/notes");
});

it("keeps the Notes draft and editor controls reachable across a keyboard-like viewport resize", async (t) => {
  const longText = `Long mobile note content. ${"A paragraph that continues through the editor and needs page scrolling. ".repeat(40)}`;
  const note = {
    id: "n1",
    title: "Browser deep link",
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: longText }] }] }),
    contentText: longText,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-02T10:00:00Z",
    version: 1,
    tags: [],
    pinned: false,
  };
  const { page } = await fixture(t, 390, { noteSeeds: [note] });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${server.resolvedUrls.local[0]}notes/n1`);
  const body = page.getByRole("textbox", { name: "Note content" });
  await body.waitFor();
  await body.tap();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Draft stays here");
  const draft = await body.innerText();
  assert.match(draft, /Draft stays here/);

  // Model the visible area left above a software keyboard; Chromium does not open a real mobile keyboard.
  await page.setViewportSize({ width: 390, height: 320 });
  await page.waitForTimeout(100);
  const editorVisible = await body.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  });
  assert.ok(editorVisible, "the focused editor should remain in the visible viewport");
  assert.equal(await body.evaluate((element) => element === document.activeElement), true);
  const caretBounds = await body.evaluate(() => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, viewport: innerHeight };
  });
  assert.ok(caretBounds && caretBounds.top >= 0 && caretBounds.bottom <= caretBounds.viewport,
    `the caret at the end of long Note text should stay visible above the keyboard-like viewport: ${JSON.stringify(caretBounds)}`);
  assert.ok(await page.getByRole("button", { name: "Back to notes" }).isVisible());
  const toolbarButton = page.locator(".note-toolbar button").first();
  const toolbarInViewport = await toolbarButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  });
  assert.ok(toolbarInViewport, "a formatting control should remain reachable above the keyboard-like viewport");
  const caret = () => body.evaluate(() => {
    const selection = window.getSelection();
    return { text: selection?.anchorNode?.textContent, offset: selection?.anchorOffset };
  });
  const caretBeforeResize = await caret();

  await page.setViewportSize({ width: 390, height: 780 });
  assert.equal(await body.innerText(), draft);
  assert.equal(await body.evaluate((element) => element === document.activeElement), true);
  assert.deepEqual(await caret(), caretBeforeResize);
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
  await waitForNoteTitle(page, longTitle);
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

it("scrolls long Notes content without trapping the page or hiding formatting controls", async (t) => {
  const longBody = `Long note content. ${"A paragraph that continues through the editor and needs page scrolling. ".repeat(60)}`;
  const note = {
    id: "n1",
    title: "Long mobile note",
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: longBody }] }] }),
    contentText: longBody,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-02T10:00:00Z",
    version: 1,
    tags: [],
    pinned: false,
  };
  const { page } = await fixture(t, 390, { noteSeeds: [note] });
  await page.setViewportSize({ width: 390, height: 560 });
  await page.goto(`${server.resolvedUrls.local[0]}notes/n1`);
  await page.getByRole("textbox", { name: "Note content" }).waitFor();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => window.scrollY > 0);
  const toolbarButton = page.locator(".note-toolbar button").first();
  await toolbarButton.scrollIntoViewIfNeeded();
  const bounds = await toolbarButton.boundingBox();
  assert.ok(bounds && bounds.y < 560 && bounds.y + bounds.height > 0, "formatting controls remain reachable while reading long content");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});

it("keeps the active-notes recovery action in an empty archive", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(`${server.resolvedUrls.local[0]}notes?archived=1`);
  await page.locator(".notes-page").waitFor();
  await page.getByText("No archived notes.", { exact: true }).waitFor();
  await activate(page.getByRole("button", { name: "Active notes", exact: true }));

  await page.getByText("Your notes will appear here.", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("archived"), false);
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

it("changes the appearance preference with the native select at phone width", async (t) => {
  const { page } = await fixture(t, 390);
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/settings");
  const preference = page.getByRole("combobox", { name: "Theme preference" });
  const bounds = await preference.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.height >= 44, JSON.stringify(bounds));
  assert.equal(await preference.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize) >= 16), true);
  await chooseNativeOption(preference, "dark");
  assert.equal(await preference.inputValue(), "dark");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(await page.evaluate(() => localStorage.getItem("knowledge-base-theme")), "dark");
});

it("suppresses global search motion when reduced motion is preferred", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(server.resolvedUrls.local[0]);
  await activate(page.locator(".global-search-trigger"));
  const dialog = page.locator(".global-search");
  await dialog.waitFor();
  const motion = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationName, transition: style.transitionDuration };
  });
  assert.equal(motion.animation, "none");
  assert.equal(motion.transition, "0s");
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
    await activate(page.getByRole("button", { name: "Manage boards" }));
    const dialog = page.locator(".confirm-dialog[role=dialog]");
    await dialog.waitFor();
    const dialogColors = await surfaceColors(".confirm-dialog[role=dialog]");
    assertReadable(dialogColors.foreground, dialogColors.background, `${themeName} dialog`);
    await activate(dialog.getByRole("button", { name: "Done" }));

    await openGantt(page);
    await activate(page.getByRole("button", { name: /^Choose board:/ }));
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
    await activate(dateRange);
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
  await activate(trigger);
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  await dialog.waitFor();
  const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  await activate(dialog.locator(".global-search-close"));
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

it("keeps temporary Development tooling out of authenticated search navigation", async (t) => {
  const { page } = await fixture(t, 1440);
  await page.goto(server.resolvedUrls.local[0]);
  assert.equal(await page.getByRole("link", { name: "Development", exact: true }).count(), 0);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  await input.fill("Development");
  await dialog.locator(".global-search-empty").waitFor();
  assert.equal(await dialog.getByRole("option", { name: "Development, page" }).count(), 0);
});

it("distinguishes no matches from failed search and clears stale results", async (t) => {
  const { page } = await fixture(t, 1440, { failSearchQuery: "offline" });
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  const oldResult = page.getByRole("option", { name: /Reports research note/ });

  await input.fill("Reports");
  await oldResult.waitFor();
  await input.fill("zzqx");
  await dialog.locator(".global-search-empty").getByText(/No results for “zzqx”/).waitFor();
  assert.equal(await dialog.getByRole("alert").count(), 0, "No matches are not reported as a request failure");

  await input.fill("offline");
  const alert = dialog.getByRole("alert");
  await alert.waitFor();
  assert.match(await alert.innerText(), /Try again/);
  assert.equal(await oldResult.count(), 0, "results for an earlier query are not shown as current after failure");
  assert.equal(await dialog.locator(".global-search-empty").count(), 0, "a failed request is not presented as a no-match result");
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

it("keeps global search results reachable across a keyboard-like phone viewport resize", async (t) => {
  const { page } = await fixture(t, 390);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".global-search-trigger").tap();
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  await dialog.waitFor();
  await input.fill("Reports");
  const result = page.getByRole("option", { name: /Reports research note/ });
  await result.waitFor();

  await page.setViewportSize({ width: 390, height: 320 });
  await input.tap();
  await result.scrollIntoViewIfNeeded();
  const visibleResult = await result.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  });
  assert.ok(visibleResult, "a search result should be reachable above the keyboard-like viewport");
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  assert.equal(await input.inputValue(), "Reports");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  await page.setViewportSize({ width: 390, height: 780 });
  assert.equal(await input.inputValue(), "Reports");
  await result.waitFor();
});

it("recovers from a failed global search request with the in-dialog retry", async (t) => {
  const { page, requests } = await fixture(t, 1440, { failSearchOnce: true });
  await page.goto(server.resolvedUrls.local[0]);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search everything" });
  const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
  await input.fill("Reports");
  const alert = dialog.getByRole("alert");
  await alert.waitFor();
  await activate(alert.getByRole("button", { name: "Try again" }));
  await page.getByRole("option", { name: /Reports research note/ }).waitFor();
  assert.equal(await dialog.getByRole("alert").count(), 0);
  assert.equal(requests.filter((path) => path === "/search").length, 2, "Retry issues one fresh search request");
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
  await waitForNoteTitle(page, "Reports research note");
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), "Reports research note");
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

  await activate(page.getByRole("option", { name: /Show 2 more notes/ }));
  await page.locator("#global-search-note-more-note-2").waitFor();
  await page.locator("#global-search-note-more-note-3").waitFor();
  assert.equal(await page.locator("#global-search-log-more-log-2").count(), 0);
  assert.equal(await page.getByRole("option", { name: /Show 1 more logs/ }).count(), 1);

  await activate(page.getByRole("option", { name: /Show 1 more logs/ }));
  await page.locator("#global-search-log-more-log-2").waitFor();
  assert.equal(await page.locator("#global-search-note-more-note-2").count(), 1);
  assert.equal(await page.locator("#global-search-note-more-note-3").count(), 1);
});

it("WU-10: warms the other pages once, then reloads inside the cooldown send no warm-up", async (t) => {
  const { page, requests } = await fixture(t, 1440, { warmup: true, clock: true });
  const warmed = ["/notes", "/calendar/days", "/reports", "/logs"];
  const count = (path) => requests.filter((value) => value === path).length;
  await page.clock.fastForward(6000);
  await until(() => requests.includes("/logs"));
  for (const path of warmed) assert.equal(count(path), 1, `${path} must be warmed exactly once`);
  await until(() => requests.includes("/boards/all/gantt"));
  const boardRequests = () => requests.filter((path) => path.startsWith("/boards")).length;
  const warmedBoard = boardRequests();

  await activate(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Board" }));
  await page.waitForFunction(() => location.pathname === "/board");
  await page.locator(".board-page").waitFor();
  await page.getByRole("button", { name: "Gantt", exact: true }).or(page.locator("button.board-tab-more")).first().waitFor();
  await openGantt(page);
  assert.equal(boardRequests(), warmedBoard, "A warmed Board page and its Gantt view must not refetch boards");

  await activate(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Reports" }));
  await page.waitForFunction(() => location.pathname === "/reports");
  await page.locator(".reports-page").waitFor();
  await page.waitForTimeout(300);
  assert.equal(count("/reports"), 1, "A warmed Reports page must not refetch its report");

  await activate(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Calendar" }));
  await page.waitForFunction(() => location.pathname === "/calendar");
  await page.waitForTimeout(300);
  assert.equal(count("/calendar/days"), 1, "A warmed Calendar must not refetch its month");

  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".dashboard-shell > header nav").waitFor();
  await page.clock.fastForward(6000);
  for (const path of warmed) assert.equal(count(path), 1, `A reload inside the cooldown must not warm ${path} again`);
});
});
