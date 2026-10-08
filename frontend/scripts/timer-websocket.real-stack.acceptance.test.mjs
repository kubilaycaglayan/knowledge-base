import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium, webkit } from "playwright";

// Real-stack acceptance for the web client's socket-first timer sync. It runs
// against a proxy URL (scripts/run-timer-websocket-e2e.sh starts a disposable
// stack behind the production Cloudflare proxy config), so a proxy that stops
// routing /ws/* to the API, a client that polls while connected, or a server
// that stops pushing snapshots all fail here.
const baseUrl = process.env.TIMER_E2E_BASE_URL;
if (!baseUrl) throw new Error("TIMER_E2E_BASE_URL is required");

const pollIntervalMs = 2000;
let browser;
const browserType = process.env.BROWSER_ENGINE === "webkit" ? webkit : chromium;
const iphoneProfile = process.env.BROWSER_PROFILE === "iphone";

before(async () => {
  browser = await browserType.launch({
    executablePath: process.env.BROWSER_PATH || undefined,
    headless: true,
  });
});
after(async () => {
  await browser?.close();
});

async function api(path, init = {}, token) {
  const response = await fetch(new URL(`/api/v1${path}`, baseUrl), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  assert.ok(response.ok, `${init.method || "GET"} ${path} returned ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function register() {
  const account = {
    email: `timer-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: `Timer-e2e-${crypto.randomUUID()}`,
  };
  return (await api("/auth/register", { method: "POST", body: JSON.stringify(account) })).token;
}

// Opens the app signed in as `token` and records every timer HTTP request and
// every frame the timer socket receives.
async function openApp(token, { blockSocket = false } = {}) {
  const context = await browser.newContext({
    viewport: iphoneProfile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    ...(iphoneProfile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  context.setDefaultTimeout(10_000);
  await context.addInitScript((value) => localStorage.setItem("know_token", value), token);
  const page = await context.newPage();
  const timerRequests = [];
  const frames = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/timers/current" || path === "/api/v1/timers/draft")
      timerRequests.push({ path, at: Date.now() });
  });
  if (blockSocket) {
    // Simulates a proxy or network that cannot carry the socket.
    await page.routeWebSocket(/\/ws\/timers$/, (socket) => socket.close({ code: 1011 }));
  } else {
    page.on("websocket", (socket) => {
      if (!socket.url().endsWith("/ws/timers")) return;
      socket.on("framereceived", (frame) => {
        try {
          frames.push(JSON.parse(String(frame.payload)));
        } catch {
          /* Non-JSON frames are not timer messages. */
        }
      });
    });
  }
  await page.goto(new URL("/paths", baseUrl).toString());
  const tracker = page.locator('section[aria-label="Focus today"]');
  await tracker.getByRole("button", { name: "Start timer" }).waitFor();
  return { context, page, tracker, timerRequests, frames };
}

const waitFor = async (predicate, description, ms = 10_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`timed out waiting for ${description}`);
};

describe("timer WebSocket in the web app", () => {
  it("syncs over the socket and makes no timer HTTP requests while connected", async () => {
    const token = await register();
    const { context, page, tracker, timerRequests, frames } = await openApp(token);
    try {
      await waitFor(() => frames.some((frame) => frame.type === "READY"), "the socket's READY");
      // Let the load-time and post-READY catch-up requests settle.
      await page.waitForTimeout(1000);
      const settled = timerRequests.length;
      const currentReads = () =>
        timerRequests.filter((request) => request.path === "/api/v1/timers/current").length;
      const settledCurrentReads = currentReads();
      assert.ok(settled <= 4, `expected at most 4 timer requests on load, saw ${settled}`);

      // Idle for more than two polling intervals.
      await page.waitForTimeout(pollIntervalMs * 2.5);
      assert.equal(timerRequests.length, settled, "the client polled while the socket was connected");

      // Returning to the tab must not refetch either.
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          window.dispatchEvent(new Event("focus"));
          document.dispatchEvent(new Event("visibilitychange"));
        });
      }
      await page.waitForTimeout(500);
      assert.equal(timerRequests.length, settled, "focus or visibility refetched while connected");

      // Another client (extension, phone) starts and stops the timer.
      const started = await api(
        "/timers",
        { method: "POST", body: JSON.stringify({ labelIds: [], description: "Started elsewhere" }) },
        token,
      );
      await tracker.getByRole("button", { name: "Stop timer" }).waitFor({ timeout: 3000 });
      assert.ok(
        frames.some((frame) => frame.type === "TIMER_STATE" && frame.timer?.id === started.id),
        "the started timer did not arrive over the socket",
      );
      await api("/timers/stop", { method: "POST", body: "{}" }, token);
      await tracker.getByRole("button", { name: "Start timer" }).waitFor({ timeout: 3000 });
      assert.ok(
        frames.some((frame) => frame.type === "TIMER_STATE" && frame.timer === null),
        "the stop did not arrive over the socket",
      );
      // A stop clears the idle draft (PUT /timers/draft) but never reads the
      // current timer over HTTP.
      assert.equal(
        currentReads(),
        settledCurrentReads,
        "remote timer changes were fetched over HTTP instead of the socket",
      );
    } finally {
      await context.close();
    }
  });

  it("falls back to HTTP polling when the socket is unavailable", async () => {
    const token = await register();
    const { context, page, tracker, timerRequests } = await openApp(token, { blockSocket: true });
    try {
      const before = timerRequests.filter((r) => r.path === "/api/v1/timers/current").length;
      await page.waitForTimeout(pollIntervalMs * 2.5);
      const polled = timerRequests.filter((r) => r.path === "/api/v1/timers/current").length - before;
      assert.ok(polled >= 2, `expected polling without a socket, saw ${polled} requests`);

      await api(
        "/timers",
        { method: "POST", body: JSON.stringify({ labelIds: [], description: "Polled" }) },
        token,
      );
      await tracker
        .getByRole("button", { name: "Stop timer" })
        .waitFor({ timeout: pollIntervalMs * 3 });
      await api("/timers/stop", { method: "POST", body: "{}" }, token);
      await tracker
        .getByRole("button", { name: "Start timer" })
        .waitFor({ timeout: pollIntervalMs * 3 });
    } finally {
      await context.close();
    }
  });
});
