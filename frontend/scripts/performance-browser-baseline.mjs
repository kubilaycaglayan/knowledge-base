#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium, webkit } from "playwright";

const fixtureFile = process.argv[2];
if (!fixtureFile) {
  console.error("Usage: API_BASE_URL=... node scripts/performance-browser-baseline.mjs <private-fixture.json>");
  process.exit(2);
}
const fixture = JSON.parse(await readFile(resolve(fixtureFile), "utf8"));
const playwrightPackage = JSON.parse(await readFile(new URL("../node_modules/playwright/package.json", import.meta.url), "utf8"));
const baseUrl = process.env.API_BASE_URL;
const outputPath = resolve(process.env.PERFORMANCE_OUTPUT ?? "harden-tests/local-artifacts/performance/browser-samples.json");
const engine = process.env.BROWSER_ENGINE ?? "chromium";
const profile = process.env.BROWSER_PROFILE ?? "desktop";
const warmups = Number(process.env.PERFORMANCE_WARMUPS ?? 3);
const samples = Number(process.env.PERFORMANCE_SAMPLES ?? 30);
const runId = process.env.PERFORMANCE_RUN_ID ?? new Date().toISOString().replaceAll(":", "-");
if (!baseUrl || !fixture.token || !fixture.boards?.length || !fixture.noteIds?.length) {
  throw new Error("API_BASE_URL and a generated fixture with token, boards, and noteIds are required");
}
const origin = new URL(baseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(origin.hostname)) {
  throw new Error("Browser performance collection is restricted to localhost");
}
if (!outputPath.startsWith(`${resolve("harden-tests/local-artifacts")}/`)) {
  throw new Error("PERFORMANCE_OUTPUT must stay under harden-tests/local-artifacts/");
}
if (!Number.isInteger(warmups) || warmups < 0 || !Number.isInteger(samples) || samples < 1) {
  throw new Error("Warmups must be a non-negative integer and samples must be a positive integer");
}
if (!((engine === "chromium" && ["desktop", "iphone"].includes(profile)) || (engine === "webkit" && profile === "iphone"))) {
  throw new Error("Supported profiles: chromium/desktop, chromium/iphone, and webkit/iphone");
}
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const viewport = profile === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const mobileOptions = profile === "iphone" ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {};
const board = fixture.boards[0];
const noteId = fixture.noteIds[0];
const rows = [];
const apiRows = [];
const failures = [];
let currentJourney = "setup";
let currentSample = 0;
let currentPhase = "setup";
let pending = new Set();
let activePage;
let activeContext;
let browserMetadata;

function attachPage(page) {
  page.on("request", (request) => {
    const started = performance.now();
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/")) {
      let finish;
      const done = new Promise((resolveDone) => { finish = resolveDone; });
      pending.add(done);
      const row = {
        runId, profile: `${engine}-${profile}`, journey: currentJourney, phase: currentPhase,
        sampleIndex: currentPhase === "setup" ? 0 : currentSample,
        method: request.method(), path: `${url.pathname}${url.search}`, startedAtMonotonicMs: Number(started.toFixed(3)),
        status: null, responseBytes: null, durationMs: null, failure: null,
      };
      apiRows.push(row);
      request.__performanceRow = row;
      request.__performanceStart = started;
      request.__performanceDone = done;
      request.__performanceFinish = finish;
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    const row = request.__performanceRow;
    if (!row) return;
    row.status = response.status();
    if (!response.ok()) row.failure = `HTTP ${response.status()}`;
    void (async () => {
      try {
        row.responseBytes = (await response.body()).byteLength;
      } catch (error) {
        const contentLength = Number(response.headers()["content-length"]);
        row.responseBytes = Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null;
        row.responseBodyCaptureError = error.message;
      }
    })();
  });
  page.on("requestfinished", (request) => {
    const row = request.__performanceRow;
    if (!row) return;
    row.durationMs = Number((performance.now() - request.__performanceStart).toFixed(3));
    request.__performanceFinish();
    pending.delete(request.__performanceDone);
  });
  page.on("requestfailed", (request) => {
    const row = request.__performanceRow;
    if (row) {
      row.durationMs = Number((performance.now() - request.__performanceStart).toFixed(3));
      row.failure = request.failure()?.errorText ?? "request failed";
      request.__performanceFinish();
      pending.delete(request.__performanceDone);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") failures.push({ journey: currentJourney, sampleIndex: currentSample, kind: "console", message: message.text() });
  });
  page.on("pageerror", (error) => failures.push({ journey: currentJourney, sampleIndex: currentSample, kind: "pageerror", message: error.message }));
  return async () => {
    while (pending.size) await Promise.all([...pending]);
  };
}

async function openPage(path = "/paths", { timedNavigation = true } = {}) {
  activeContext = await browser.newContext({ viewport, ...mobileOptions });
  activeContext.setDefaultTimeout(15000);
  await activeContext.addInitScript(({ tokenValue }) => {
    localStorage.setItem("know_token", tokenValue);
    window.__kbNavigationStart = performance.now();
  }, { tokenValue: fixture.token });
  await activeContext.tracing.start({ screenshots: true, snapshots: true, sources: false });
  activePage = await activeContext.newPage();
  const settle = attachPage(activePage);
  currentPhase = timedNavigation ? currentPhase : "setup";
  await activePage.goto(new URL(path, origin).toString(), { waitUntil: "domcontentloaded" });
  if (!browserMetadata) {
    browserMetadata = await activePage.evaluate(() => ({ userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio }));
  }
  return { page: activePage, settle };
}

async function closePage(error = null) {
  if (!activeContext) return;
  if (error) {
    const tracePath = resolve(dirname(outputPath), `trace-${engine}-${profile}-${currentJourney}-${currentSample}.zip`);
    const screenshotPath = resolve(dirname(outputPath), `failure-${engine}-${profile}-${currentJourney}-${currentSample}.png`);
    await activePage?.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    await activeContext.tracing.stop({ path: tracePath }).catch(() => {});
    failures.push({ journey: currentJourney, sampleIndex: currentSample, kind: "journey", message: error.message, tracePath, screenshotPath });
  } else {
    await activeContext.tracing.stop().catch(() => {});
  }
  await activeContext.close().catch(() => {});
  while (pending.size) await Promise.all([...pending]);
  activeContext = null;
  activePage = null;
}

async function navDuration(page) {
  return Number((await page.evaluate(() => performance.now() - window.__kbNavigationStart)).toFixed(3));
}

async function interaction(page, action, sample) {
  sample.browserStartTimeMs = Number((await page.evaluate(() => performance.now())).toFixed(3));
  await page.evaluate(() => performance.mark("kb-journey-start"));
  await action();
  const measurement = await page.evaluate(() => {
    performance.mark("kb-journey-end");
    return { durationMs: performance.measure("kb-journey", "kb-journey-start", "kb-journey-end").duration, endTimeMs: performance.now() };
  });
  sample.browserEndTimeMs = Number(measurement.endTimeMs.toFixed(3));
  return Number(measurement.durationMs.toFixed(3));
}

async function recordedNavigationDuration(page, sample) {
  sample.browserStartTimeMs = 0;
  sample.browserEndTimeMs = await navDuration(page);
  return sample.browserEndTimeMs;
}

async function settled(page) {
  const tracker = page.locator('section[aria-label="Focus today"]');
  await tracker.waitFor({ state: "visible" });
  await tracker.getByRole("button", { name: /Start timer|Stop timer/ }).waitFor();
}

const workloads = [
  "authenticated-startup",
  "authenticated-warm-reload",
  "search-exact",
  "search-near-match",
  "board-first-page",
  "board-next-page",
  "gantt-range",
  "report-range",
  "note-save",
  "timer-start-stop",
  "websocket-second-page",
];

async function runOnce(workload, phase, index) {
  currentJourney = workload;
  currentSample = index + 1;
  currentPhase = phase;
  pending = new Set();
  const sample = {
    runId, profile: `${engine}-${profile}`, fixtureProfile: fixture.profile,
    journey: workload, phase, sampleIndex: index + 1, startedAtUtc: new Date().toISOString(),
    durationMs: null, completion: null, failure: null,
    cacheState: workload === "authenticated-startup" || workload === "board-first-page" || workload === "gantt-range" || workload === "report-range"
      ? "cold browser context"
      : "fresh context with untimed authenticated setup navigation",
  };
  rows.push(sample);
  let error;
  let timerMayBeRunning = false;
  let runningTimerId = null;
  try {
    let page;
    let settle;
    if (workload === "authenticated-startup") {
      ({ page, settle } = await openPage("/paths"));
      await settled(page);
      await settle();
      sample.durationMs = await recordedNavigationDuration(page, sample);
      sample.completion = "authenticated shell and Focus today tracker rendered; initiated HTTP requests settled";
      return;
    }
    if (workload === "authenticated-warm-reload") {
      ({ page, settle } = await openPage("/paths", { timedNavigation: false }));
      await settled(page);
      currentPhase = phase;
      await page.reload({ waitUntil: "domcontentloaded" });
      await settled(page);
      await settle();
      sample.durationMs = await recordedNavigationDuration(page, sample);
      sample.cacheState = "warm same-context reload after an untimed authenticated navigation";
      sample.completion = "warm reload shell and Focus today tracker rendered; initiated HTTP requests settled";
      return;
    }
    if (workload === "search-exact" || workload === "search-near-match") {
      ({ page, settle } = await openPage("/paths", { timedNavigation: false }));
      await settled(page);
      const query = workload === "search-exact" ? fixture.search.exact : fixture.search.nearMatch;
      currentPhase = phase;
      sample.durationMs = await interaction(page, async () => {
        await page.locator("button.global-search-trigger").click();
        const input = page.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
        await input.fill(query);
        await page.locator("#global-search-listbox").getByRole("option").first().waitFor({ state: "visible" });
        await page.locator("#global-search-listbox[aria-busy='true']").waitFor({ state: "detached" }).catch(() => {});
        if (workload === "search-near-match") await page.getByText(/No exact matches for/).waitFor({ state: "visible" });
      }, sample);
      await settle();
      sample.completion = workload === "search-exact" ? "exact results rendered and listbox settled" : "fuzzy fallback notice and results rendered";
      return;
    }
    if (workload === "board-first-page" || workload === "board-next-page") {
      ({ page, settle } = await openPage(`/board?board=${board.id}`, { timedNavigation: workload === "board-first-page" }));
      await page.locator(".kanban-column").first().waitFor({ state: "visible" });
      const cards = page.locator(".kanban-column").first().locator(".board-card");
      await page.waitForFunction(() => document.querySelectorAll(".kanban-column:first-of-type .board-card").length >= 20);
      if (workload === "board-first-page") {
        await settle();
        sample.durationMs = await recordedNavigationDuration(page, sample);
        sample.completion = "first status column rendered 20 cards";
      } else {
        currentPhase = phase;
        sample.durationMs = await interaction(page, async () => {
          const sentinel = page.locator(".kanban-column").first().locator(".load-more-sentinel");
          await sentinel.scrollIntoViewIfNeeded();
          await page.waitForFunction(() => document.querySelectorAll(".kanban-column:first-of-type .board-card").length >= 40);
        }, sample);
        await settle();
        sample.completion = "first status column rendered cards from the next page";
      }
      return;
    }
    if (workload === "gantt-range") {
      ({ page, settle } = await openPage(`/board?board=${board.id}&view=gantt&from=2026-01-01&to=2026-12-31`));
      await page.locator(".timeline-row").first().waitFor({ state: "visible" });
      await page.waitForFunction((expectedRows) => document.querySelectorAll(".timeline-row").length >= expectedRows, board.cards);
      const ganttRows = await page.locator(".timeline-row").count();
      if (ganttRows !== board.cards) throw new Error(`expected ${board.cards} Gantt rows, received ${ganttRows}`);
      await settle();
      sample.durationMs = await recordedNavigationDuration(page, sample);
      sample.resultCount = ganttRows;
      sample.completion = "all fixture Gantt rows rendered for the fixed 2026 date range";
      return;
    }
    if (workload === "report-range") {
      ({ page, settle } = await openPage("/reports?startDate=2026-01-01&endDate=2026-12-31"));
      await page.locator(".reports-page").waitFor({ state: "visible" });
      await settle();
      sample.durationMs = await recordedNavigationDuration(page, sample);
      sample.completion = "report view rendered and its initiated requests settled";
      return;
    }
    if (workload === "note-save") {
      ({ page, settle } = await openPage(`/notes/${noteId}`, { timedNavigation: false }));
      const title = page.getByRole("textbox", { name: "Note title" });
      await title.waitFor({ state: "visible" });
      await page.locator(".tiptap").waitFor({ state: "visible" });
      currentPhase = phase;
      sample.durationMs = await interaction(page, async () => {
        sample.expectedTitle = `Perf ${fixture.profile} measured title ${runId}-${phase}-${index}`;
        await title.fill(sample.expectedTitle);
        await page.getByText("Saved", { exact: true }).waitFor({ state: "visible" });
        if (await title.inputValue() !== sample.expectedTitle) throw new Error("saved note title did not match the submitted value");
      }, sample);
      await settle();
      sample.completion = "autosave confirmed by Saved status";
      return;
    }
    if (workload === "timer-start-stop") {
      ({ page, settle } = await openPage("/paths", { timedNavigation: false }));
      const start = page.getByRole("button", { name: "Start timer" });
      await start.waitFor({ state: "visible" });
      currentPhase = phase;
      sample.durationMs = await interaction(page, async () => {
        const response = page.waitForResponse((value) => value.request().method() === "POST" && new URL(value.url()).pathname === "/api/v1/timers");
        await start.click();
        const result = await response;
        if (!result.ok()) throw new Error(`timer start returned ${result.status()}`);
        runningTimerId = (await result.json()).id;
        timerMayBeRunning = true;
        await page.getByRole("button", { name: "Stop timer" }).waitFor({ state: "visible" });
      }, sample);
      await settle();
      sample.timerStartDurationMs = sample.durationMs;
      sample.timerStartStatus = "acknowledged";
      sample.timerStopDurationMs = await interaction(page, async () => {
        const response = page.waitForResponse((value) => value.request().method() === "POST" && new URL(value.url()).pathname === `/api/v1/timers/${runningTimerId}/stop`);
        await page.getByRole("button", { name: "Stop timer" }).click();
        const result = await response;
        if (!result.ok()) throw new Error(`timer stop returned ${result.status()}`);
        timerMayBeRunning = false;
        await page.getByRole("button", { name: "Start timer" }).waitFor({ state: "visible" });
      }, sample);
      await settle();
      sample.completion = "timer start and stop acknowledged with running/stopped UI states";
      return;
    }
    if (workload === "websocket-second-page") {
      ({ page, settle } = await openPage("/paths", { timedNavigation: false }));
      await settled(page);
      const second = await activeContext.newPage();
      const settleSecond = attachPage(second);
      const frames = [];
      const socketRecords = [];
      second.on("websocket", (socket) => {
        if (!socket.url().endsWith("/ws/timers")) return;
        const record = { path: new URL(socket.url()).pathname, openedAtMonotonicMs: Number(performance.now().toFixed(3)), frames: [] };
        socketRecords.push(record);
        socket.on("framereceived", (frame) => {
          try {
            const receivedAtMonotonicMs = Number(performance.now().toFixed(3));
            const payload = JSON.parse(String(frame.payload));
            frames.push({ at: receivedAtMonotonicMs, payload });
            record.frames.push({ receivedAtMonotonicMs, type: payload.type });
          } catch { /* ignore non-JSON frames */ }
        });
      }, sample);
      await second.goto(new URL("/paths", origin).toString(), { waitUntil: "domcontentloaded" });
      await second.locator('section[aria-label="Focus today"]').waitFor({ state: "visible" });
      const secondReady = () => frames.some(({ payload }) => payload.type === "READY");
      const readyDeadline = Date.now() + 15000;
      while (!secondReady() && Date.now() < readyDeadline) await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      if (!secondReady()) throw new Error("second page timer socket did not send READY");
      currentPhase = phase;
      let ackAt;
      sample.durationMs = await interaction(page, async () => {
        const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/v1/timers");
        await page.getByRole("button", { name: "Start timer" }).click();
        const response = await responsePromise;
        if (!response.ok()) throw new Error(`timer start returned ${response.status()}`);
        const timer = await response.json();
        runningTimerId = timer.id;
        timerMayBeRunning = true;
        ackAt = performance.now();
        const deadline = Date.now() + 15000;
        while (!frames.some(({ payload }) => payload.type === "TIMER_STATE" && payload.timer?.id === timer.id) && Date.now() < deadline) {
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
        }
        if (!frames.some(({ payload }) => payload.type === "TIMER_STATE" && payload.timer?.id === timer.id)) throw new Error("second page did not receive timer update");
      }, sample);
      const delivered = frames.find(({ payload }) => payload.type === "TIMER_STATE" && payload.timer);
      sample.websocketDeliveryMs = delivered && ackAt
        ? Number(Math.max(0, delivered.at - ackAt).toFixed(3))
        : null;
      sample.websocketMutationStartToDeliveryMs = delivered
        ? Number((delivered.at - sample.browserStartTimeMs).toFixed(3))
        : null;
      sample.websocketDeliveredBeforeApiAck = Boolean(delivered && ackAt && delivered.at < ackAt);
      sample.websocket = {
        path: socketRecords[0]?.path ?? "/ws/timers",
        readyObserved: socketRecords.some((record) => record.frames.some((frame) => frame.type === "READY")),
        eventType: delivered?.payload.type ?? null,
        frameReceivedAtMonotonicMs: delivered?.at ?? null,
      };
      const stopResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/v1/timers/${runningTimerId}/stop`);
      await page.getByRole("button", { name: "Stop timer" }).click();
      const stopResponse = await stopResponsePromise;
      if (!stopResponse.ok()) throw new Error(`timer stop returned ${stopResponse.status()}`);
      timerMayBeRunning = false;
      await page.getByRole("button", { name: "Start timer" }).waitFor({ state: "visible" });
      await Promise.all([settle(), settleSecond()]);
      sample.completion = "timer start acknowledged by first page; matching timer state received by the authorized second page";
      return;
    }
  } catch (cause) {
    error = cause instanceof Error ? cause : new Error(String(cause));
    sample.failure = error.message;
  } finally {
    sample.finishedAtUtc = new Date().toISOString();
    if (timerMayBeRunning && runningTimerId) {
      const cleanup = await fetch(new URL(`/api/v1/timers/${runningTimerId}/stop`, origin), {
        method: "POST",
        headers: { Authorization: `Bearer ${fixture.token}` },
        signal: AbortSignal.timeout(10000),
      }).catch((cause) => ({ ok: false, status: 0, cause }));
      sample.timerCleanup = cleanup.ok ? "stopped by out-of-band fixture cleanup request" : `cleanup failed with HTTP ${cleanup.status}`;
      if (!cleanup.ok) {
        sample.failure ??= sample.timerCleanup;
        failures.push({ journey: workload, sampleIndex: currentSample, kind: "timer-cleanup", message: sample.timerCleanup });
      }
    }
    if (activeContext) {
      sample.browserResourceTimings = await Promise.all(activeContext.pages().map(async (page) => ({
        page: new URL(page.url()).pathname,
        resources: await page.evaluate(({ startTimeMs, endTimeMs }) => performance.getEntriesByType("resource")
          .filter((entry) => entry.name.includes("/api/v1/"))
          .map((entry) => {
            const resource = entry;
            return {
              name: resource.name,
              phase: resource.startTime >= startTimeMs && resource.startTime <= endTimeMs ? "measured" : "setup",
              startTimeMs: Number(resource.startTime.toFixed(3)),
              durationMs: Number(resource.duration.toFixed(3)),
              responseEndMs: Number(resource.responseEnd.toFixed(3)),
              transferSize: resource.transferSize,
              decodedBodySize: resource.decodedBodySize,
            };
          }), {
            startTimeMs: sample.browserStartTimeMs ?? Number.POSITIVE_INFINITY,
            endTimeMs: sample.browserEndTimeMs ?? Number.NEGATIVE_INFINITY,
          }),
      })));
    }
    await closePage(error);
    sample.apiRequestCount = apiRows.filter((row) => row.journey === workload && row.sampleIndex === currentSample && row.phase !== "setup").length;
    sample.apiRequestFailures = apiRows.filter((row) => row.journey === workload && row.sampleIndex === currentSample && row.phase !== "setup" && row.failure).length;
  }
}

try {
  await mkdir(dirname(outputPath), { recursive: true });
  for (const workload of workloads) {
    for (let index = 0; index < warmups; index += 1) await runOnce(workload, "warmup", index);
    for (let index = 0; index < samples; index += 1) await runOnce(workload, "measured", index);
  }
} finally {
  await browser.close();
}

const quantile = (values, fraction) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)];
const summaryFor = (journey, metric, measured, selector) => {
  const values = measured.filter((row) => !row.failure && row.apiRequestFailures === 0).map(selector).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    journey, metric, samples: measured.length, successes: values.length,
    failuresOrTimeouts: measured.length - values.length,
    medianMs: values.length ? quantile(values, 0.5) : null,
    p95Ms: values.length ? quantile(values, 0.95) : null,
    minMs: values.length ? values[0] : null,
    maxMs: values.length ? values.at(-1) : null,
  };
};
const summaries = workloads.flatMap((workload) => {
  const measured = rows.filter((row) => row.journey === workload && row.phase === "measured");
  const result = [summaryFor(workload, "browser-observed", measured, (row) => row.durationMs)];
  if (workload === "timer-start-stop") result.push(summaryFor(workload, "timer-stop-ui", measured, (row) => row.timerStopDurationMs));
  if (workload === "websocket-second-page") result.push(summaryFor(workload, "websocket-delivery", measured, (row) => row.websocketDeliveryMs));
  return result;
});
const output = {
  schemaVersion: 1,
  createdAtUtc: new Date().toISOString(),
  runId,
  profile: `${engine}-${profile}`,
  fixture: { id: fixture.generator, profile: fixture.profile, counts: fixture.counts, expected: fixture.expected },
  browser: { engine, version: browser.version(), playwrightVersion: playwrightPackage.version, viewport, ...mobileOptions, ...browserMetadata },
  measurement: "Browser-observed duration from performance.now(); includes client rendering and local network. API request samples are separately recorded from Playwright request/response events. WebSocket delivery is measured with Node performance.now() from timer API acknowledgment to matching frame receipt.",
  cacheState: "Each measured row creates a fresh browser context. Direct-route journeys start with a cold browser cache; authenticated-warm-reload explicitly navigates once untimed and measures the second navigation in the same context. Warmups may warm server/database state but not the next context's browser cache.",
  warmups,
  requestedSamplesPerJourney: samples,
  outlierPolicy: "No outliers excluded; raw rows are retained",
  journeys: rows,
  apiRequests: apiRows,
  apiRequestFailures: apiRows.filter((row) => row.failure),
  summaries,
  failures,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ outputPath, profile: output.profile, summaries, failureCount: failures.length }, null, 2));
if (summaries.some((summary) => summary.failuresOrTimeouts > 0) || failures.length || apiRows.some((row) => row.failure)) process.exitCode = 1;
