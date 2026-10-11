import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.REPORTS_SETTINGS_E2E_BASE_URL;
const email = process.env.REPORTS_SETTINGS_E2E_EMAIL;
const password = process.env.REPORTS_SETTINGS_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("REPORTS_SETTINGS_E2E_BASE_URL, REPORTS_SETTINGS_E2E_EMAIL, and REPORTS_SETTINGS_E2E_PASSWORD are required");

let browser;
let page;

before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || undefined,
    headless: process.env.BROWSER_HEADLESS !== "false",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", colorScheme: "light", reducedMotion: "reduce" });
  context.setDefaultTimeout(10000);
  page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: /New here\? Create an account/ }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
});

after(async () => browser?.close());

it("keeps protected Reports hidden while signed out and handles sign-in return routes safely", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", colorScheme: "light", reducedMotion: "reduce" });
  const signedOut = await context.newPage();
  const query = "?startDate=2024-02-01&endDate=2024-02-29&aggregation=month";
  const signIn = async () => {
    await signedOut.getByRole("textbox", { name: "Email" }).fill(email);
    await signedOut.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await signedOut.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  try {
    await signedOut.goto(`${baseUrl}/reports${query}`, { waitUntil: "domcontentloaded" });
    await signedOut.getByRole("heading", { name: "Sign in" }).waitFor();
    assert.equal(await signedOut.locator(".reports-page").count(), 0);
    assert.equal(await signedOut.getByRole("navigation", { name: "Main navigation" }).count(), 0);
    await signIn();
    await signedOut.locator(".reports-page").waitFor();
    assert.equal(new URL(signedOut.url()).pathname, "/reports");
    assert.equal(new URL(signedOut.url()).search, query);

    for (const redirect of ["https://outside.example/path", "//outside.example/path"]) {
      await signedOut.getByRole("button", { name: "Sign out", exact: true }).click();
      await signedOut.getByRole("heading", { name: "Sign in" }).waitFor();
      await signedOut.goto(`${baseUrl}/reports?redirect=${encodeURIComponent(redirect)}`, { waitUntil: "domcontentloaded" });
      await signedOut.getByRole("heading", { name: "Sign in" }).waitFor();
      await signIn();
      await signedOut.locator(".session-list").waitFor();
      assert.equal(new URL(signedOut.url()).origin, new URL(baseUrl).origin);
      assert.equal(new URL(signedOut.url()).pathname, "/");
    }
  } finally {
    await context.close();
  }
});

it("discloses an unsaved Log draft when an expired session requires sign-in", async () => {
  await page.goto(`${baseUrl}/logs`);
  const draft = "Disposable draft entered before the session expired";
  const composer = page.getByRole("textbox", { name: "Log text", exact: true });
  await composer.fill(draft);
  let expiredRequestHandled = false;
  const rejectLogs = async (route) => {
    if (!expiredRequestHandled && route.request().method() === "GET") {
      expiredRequestHandled = true;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Session expired" }) });
    } else {
      await route.continue();
    }
  };
  await page.route("**/api/v1/logs", rejectLogs);
  try {
    const expired = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/logs" && response.status() === 401);
    await page.reload();
    await expired;
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("know_token")), null);
    await page.getByText("Your unsaved changes may be lost. Sign in to continue.", { exact: true }).waitFor();
  } finally {
    await page.unroute("**/api/v1/logs", rejectLogs);
    if (!(await page.evaluate(() => localStorage.getItem("know_token")))) {
      await page.getByRole("textbox", { name: "Email" }).fill(email);
      await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
    }
    await page.goto(`${baseUrl}/logs`);
    await page.locator(".logs-page").waitFor();
  }
  assert.equal(new URL(page.url()).pathname, "/logs");
  assert.equal(await page.getByRole("textbox", { name: "Log text", exact: true }).inputValue(), "");
});

it("keeps a replacement session signed in when an older Logs request returns 401", async () => {
  await page.goto(`${baseUrl}/logs`);
  const oldToken = await page.evaluate(() => localStorage.getItem("know_token"));
  let releaseResponse;
  let requestStarted;
  let responseReleased = false;
  const heldResponse = new Promise((resolve) => { releaseResponse = resolve; });
  const requestSeen = new Promise((resolve) => { requestStarted = resolve; });
  const releaseHeldResponse = () => {
    if (responseReleased) return;
    responseReleased = true;
    releaseResponse();
  };
  let held = false;
  const holdOldRequest = async (route) => {
    if (!held && route.request().method() === "GET") {
      held = true;
      requestStarted();
      await heldResponse;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Expired old session" }) });
    } else {
      await route.continue();
    }
  };
  await page.route("**/api/v1/logs*", holdOldRequest);
  try {
    const expired = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/logs" && response.status() === 401, { timeout: 30000 });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await requestSeen;
    const newEmail = `reports-stale-session-${Date.now()}@example.com`;
    const newToken = await page.evaluate(async ({ email, password }) => {
      const response = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(`Replacement sign-in failed: ${response.status}`);
      return (await response.json()).token;
    }, { email: newEmail, password });
    assert.ok(newToken);
    assert.notEqual(newToken, oldToken);
    await page.evaluate((token) => localStorage.setItem("know_token", token), newToken);
    releaseHeldResponse();
    await expired;

    assert.equal(await page.evaluate(() => localStorage.getItem("know_token")), newToken);
    assert.equal(await page.getByRole("heading", { name: "Sign in" }).count(), 0);
    assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 1);
    assert.equal(await page.evaluate(async (token) => {
      const response = await fetch("/api/v1/logs", { headers: { Authorization: `Bearer ${token}` } });
      return response.status;
    }, newToken), 200);
  } finally {
    releaseHeldResponse();
    await page.unroute("**/api/v1/logs*", holdOldRequest);
    if (oldToken) await page.evaluate((token) => localStorage.setItem("know_token", token), oldToken);
  }
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  assert.equal(quoted, false, "CSV fields are correctly quoted");
  return rows;
}

async function api(path, method = "GET", body, targetPage = page) {
  return targetPage.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api/v1${path}`, { method, cache: "no-store", headers: {
      Authorization: `Bearer ${localStorage.getItem("know_token")}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }, { path, method, body });
}

it("sets a password for a Google-only account and enables password sign-in", async () => {
  const setupContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  try {
    const setupPage = await setupContext.newPage();
    await setupPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await setupPage.getByRole("button", { name: /New here\? Create an account/ }).click();
    const setupEmail = `reports-password-setup-${Date.now()}@example.com`;
    await setupPage.getByRole("textbox", { name: "Email" }).fill(setupEmail);
    await setupPage.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await setupPage.getByRole("textbox", { name: "Confirm password" }).fill(password);
    await setupPage.getByRole("button", { name: "Create account", exact: true }).click();
    await setupPage.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
    const account = (await api("/auth/me", "GET", undefined, setupPage)).data;
    assert.equal(account.hasPassword, true);

    const sql = `UPDATE app_user SET password_configured = FALSE, google_subject = 'ototest-${Date.now()}' WHERE id = '${account.userId}'::uuid;`;
    const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    const databaseResult = execFileSync("docker", [
      "compose", "-p", process.env.COMPOSE_PROJECT_NAME,
      "-f", join(repoRoot, "docker-compose.yml"),
      "-f", join(repoRoot, "docker-compose.smoke.yml"),
      "exec", "-T", "db", "psql", "-U", process.env.REPORTS_SETTINGS_E2E_DB_USER,
      "-d", process.env.REPORTS_SETTINGS_E2E_DB_NAME, "-c", sql,
    ], { encoding: "utf8" });
    assert.match(databaseResult, /UPDATE 1/);
    const googleOnlyAccount = (await api("/auth/me", "GET", undefined, setupPage)).data;
    assert.equal(googleOnlyAccount.hasPassword, false);
    assert.equal(googleOnlyAccount.hasGoogle, true);

    await setupPage.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const form = setupPage.locator("#password-change-form");
    await form.waitFor();
    assert.equal(await form.locator("#current-password").count(), 0);
    await setupPage.getByText("Set a password to add password sign-in while keeping Google sign-in available.", { exact: true }).waitFor();
    const newPassword = `Google-Only-${Date.now()}-Password`;
    await form.locator("#new-password").fill(newPassword);
    await form.locator("#confirm-password").fill(newPassword);
    const saved = setupPage.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/auth/password" && response.request().method() === "PUT");
    await form.getByRole("button", { name: "Set password", exact: true }).click();
    assert.equal((await saved).status(), 200);
    await setupPage.getByRole("status").getByText("Password saved. You can now sign in with your email and password.", { exact: true }).waitFor();
    assert.equal(await setupPage.getByText("A password is configured. You can use either password or Google sign-in.", { exact: true }).count(), 1);
    assert.equal((await api("/auth/me", "GET", undefined, setupPage)).data.hasPassword, true);
    assert.equal((await api("/auth/me", "GET", undefined, setupPage)).data.hasGoogle, true);

    await setupPage.getByRole("button", { name: "Sign out", exact: true }).click();
    await setupPage.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
    await setupPage.getByRole("textbox", { name: "Email", exact: true }).fill(setupEmail);
    await setupPage.getByRole("textbox", { name: "Password", exact: true }).fill(newPassword);
    const signedIn = setupPage.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/auth/login" && response.request().method() === "POST");
    await setupPage.getByRole("button", { name: "Sign in", exact: true }).click();
    assert.equal((await signedIn).status(), 200);
    await setupPage.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  } finally {
    await setupContext.close();
  }
});

async function openReport(query) {
  await page.goto(`${baseUrl}/reports${query ? `?${query}` : ""}`);
  await page.locator(".total-display").waitFor();
  await page.getByText("No tracked time in this period.", { exact: true }).waitFor();
  const params = new URL(page.url()).searchParams;
  const result = await api(`/reports?${params}`);
  assert.equal(result.status, 200);
  return result.data;
}

it("persists report range in navigation and theme preference after reload", async () => {
  const startDate = "2025-03-03";
  const endDate = "2025-03-09";
  const reportResponse = page.waitForResponse((response) => response.url().includes("/api/v1/reports?") && response.status() === 200);
  await page.goto(`${baseUrl}/reports?startDate=${startDate}&endDate=${endDate}&aggregation=day`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Reports" }).waitFor();
  const loaded = await reportResponse;
  const payload = await loaded.json();
  assert.equal(payload.from, startDate);
  assert.equal(payload.to, endDate);
  assert.equal(await page.getByRole("textbox", { name: "Datepicker input", exact: true }).inputValue(), "Mar 3, 2025 – Mar 9, 2025");
  assert.equal(new URL(page.url()).searchParams.get("startDate"), startDate);
  assert.equal(new URL(page.url()).searchParams.get("endDate"), endDate);
  await page.reload();
  await page.getByRole("heading", { name: "Reports" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("startDate"), startDate);
  assert.equal(new URL(page.url()).searchParams.get("endDate"), endDate);

  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await page.goBack();
  await page.getByRole("heading", { name: "Reports" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/reports");
  assert.equal(new URL(page.url()).searchParams.get("startDate"), startDate);
  assert.equal(new URL(page.url()).searchParams.get("endDate"), endDate);
  assert.equal(await page.getByRole("textbox", { name: "Datepicker input", exact: true }).inputValue(), "Mar 3, 2025 – Mar 9, 2025");
  await page.goForward();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  const theme = page.getByRole("combobox", { name: "Theme preference" });
  await theme.waitFor();
  for (const [preference, resolvedTheme, colorScheme] of [
    ["auto", "light", "light"],
    ["light", "light", "light"],
    ["dark", "dark", "dark"],
    ["solarized", "solarized", "light"],
    ["banana", "banana", "light"],
    ["melon", "melon", "light"],
    ["fruity", "fruity", "light"],
    ["neon", "neon", "dark"],
    ["tokyo-neon", "tokyo-neon", "dark"],
    ["beach", "beach", "light"],
  ]) {
    if (await theme.inputValue() !== preference) {
      const preferenceSaved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/preferences" && response.request().method() === "PUT" && response.status() === 200);
      await theme.selectOption(preference);
      await preferenceSaved;
    }
    await page.waitForFunction((expected) => localStorage.getItem("knowledge-base-theme") === expected, preference);
    assert.equal(await page.locator("html").getAttribute("data-theme"), resolvedTheme, `${preference} applies its expected palette`);
    assert.equal(await page.locator("html").evaluate((element) => element.style.colorScheme), colorScheme);
    assert.equal((await api("/preferences")).data.theme, preference, `${preference} is saved to the account`);

    await page.goto(`${baseUrl}/reports`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("heading", { name: "Reports" }).waitFor();
    assert.equal(await page.locator("html").getAttribute("data-theme"), resolvedTheme, `${preference} remains applied on another route`);
    await page.reload();
    await page.getByRole("heading", { name: "Reports" }).waitFor();
    await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const reloadedTheme = page.getByRole("combobox", { name: "Theme preference" });
    await reloadedTheme.waitFor();
    assert.equal(await reloadedTheme.inputValue(), preference, `${preference} survives navigation and reload`);
    assert.equal(await page.locator("html").getAttribute("data-theme"), resolvedTheme);
    assert.equal((await api("/preferences")).data.theme, preference);
  }
});

it("normalizes malformed, incomplete, reversed, and impossible report dates", async () => {
  await page.evaluate(() => localStorage.setItem("knowledge-base-theme", "light"));
  for (const query of [
    "startDate=bad&endDate=2026-10-11",
    "startDate=2026-10-01",
    "startDate=2026-10-12&endDate=2026-10-01",
    "startDate=2026-02-30&endDate=2026-03-01&aggregation=invalid",
  ]) {
    const payload = await openReport(query);
    const params = new URL(page.url()).searchParams;
    assert.match(payload.from, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(payload.to, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(payload.from <= payload.to);
    assert.equal(params.get("startDate"), payload.from);
    assert.equal(params.get("endDate"), payload.to);
    assert.equal(await page.getByRole("combobox", { name: "Report aggregation", exact: true }).inputValue(), "DAY");
    assert.equal(payload.totalSeconds, 0);
    assert.equal(await page.getByRole("alert").count(), 0);
  }
});

it("shows loading and a failed report error, then retries the same range successfully", async () => {
  const query = "startDate=2026-06-01&endDate=2026-06-07&aggregation=day";
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const endpoint = "**/api/v1/reports?**";
  await page.route(endpoint, async (route) => {
    await gate;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Injected report failure"}' });
  });
  try {
    await page.goto(`${baseUrl}/reports?${query}`);
    await page.getByRole("status").filter({ hasText: "Loading report…" }).waitFor();
    release();
    await page.getByRole("alert").filter({ hasText: "Unable to load the report. Please try again." }).waitFor();
  } finally {
    release();
    await page.unroute(endpoint);
  }
  const recovered = page.waitForResponse((result) => new URL(result.url()).pathname === "/api/v1/reports" && result.status() === 200);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const payload = await (await recovered).json();
  assert.equal(payload.from, "2026-06-01");
  assert.equal(payload.to, "2026-06-07");
  await page.getByText("No tracked time in this period.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
});

it("preserves aggregation while shifting ranges and restores visualization state after reload", async () => {
  for (const aggregation of ["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]) {
    const payload = await openReport(`startDate=2026-01-30&endDate=2026-02-02&aggregation=${aggregation.toLowerCase()}`);
    assert.equal(payload.totalSeconds, 0);
    assert.equal(await page.getByRole("combobox", { name: "Report aggregation", exact: true }).inputValue(), aggregation);
    const shifted = page.waitForResponse((result) => new URL(result.url()).pathname === "/api/v1/reports" && result.status() === 200);
    await page.getByRole("button", { name: "Next date range", exact: true }).click();
    const next = await (await shifted).json();
    assert.equal(next.from, "2026-02-03");
    assert.equal(next.to, "2026-02-06");
    await page.waitForFunction((expected) => {
      const params = new URL(location.href).searchParams;
      return params.get("startDate") === "2026-02-03" && params.get("endDate") === "2026-02-06" && params.get("aggregation") === expected;
    }, aggregation.toLowerCase());
    await page.getByRole("button", { name: "Previous date range", exact: true }).click();
    await page.waitForFunction((expected) => {
      const params = new URL(location.href).searchParams;
      return params.get("startDate") === "2026-01-30" && params.get("endDate") === "2026-02-02" && params.get("aggregation") === expected;
    }, aggregation.toLowerCase());
    assert.equal(new URL(page.url()).searchParams.get("endDate"), "2026-02-02");
  }
  const trendline = () => page.getByRole("button", { name: /Trendline mode:/ });
  await trendline().click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("trendline") === "linear");
  await page.getByRole("button", { name: "Trendline mode: linear. Activate to show the next mode.", exact: true }).waitFor();
  assert.equal(await trendline().getAttribute("aria-pressed"), "true");
  assert.equal(new URL(page.url()).searchParams.get("trendline"), "linear");
  await page.reload();
  await page.getByRole("button", { name: "Trendline mode: linear. Activate to show the next mode.", exact: true }).waitFor();
  await page.getByRole("button", { name: "Show Sankey", exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("sankey") === "1");
  assert.equal(new URL(page.url()).searchParams.get("sankey"), "1");
  await page.getByRole("heading", { name: "Path timing by year", exact: true }).waitFor();
  await page.getByRole("table").getByText("No tracked time in this period.", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Show bar chart", exact: true }).waitFor();
  await page.getByRole("button", { name: "Show bar chart", exact: true }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("sankey"));
  assert.equal(new URL(page.url()).searchParams.has("sankey"), false);
  await page.getByRole("heading", { name: "Tracked time", exact: true }).waitFor();
});

it("filters distinct persisted session totals by Path and Label and restores filters after reload", async () => {
  const marker = `ReportsJourney-${Date.now()}`;
  const first = await api("/paths", "POST", { name: `${marker} first Path` });
  const second = await api("/paths", "POST", { name: `${marker} second Path` });
  const label = await api("/labels", "POST", { name: `${marker} selected Label`, scopes: ["TIME_ENTRY"] });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(label.status, 201);
  for (const [pathId, labelIds, startedAt, endedAt] of [
    [first.data.id, [label.data.id], "2026-05-01T09:00:00Z", "2026-05-01T10:00:00Z"],
    [second.data.id, [], "2026-05-02T09:00:00Z", "2026-05-02T11:00:00Z"],
  ]) {
    const session = await api("/time-entries", "POST", { pathId, labelIds, startedAt, endedAt, description: marker });
    assert.ok(session.status >= 200 && session.status < 300);
  }
  const baseQuery = "startDate=2026-05-01&endDate=2026-05-02&aggregation=day";
  await page.goto(`${baseUrl}/reports?${baseQuery}`);
  const verify = async (seconds) => {
    const query = new URL(page.url()).searchParams;
    const fresh = await api(`/reports?${query}`);
    assert.equal(fresh.status, 200);
    assert.equal(fresh.data.totalSeconds, seconds);
    await page.locator(".total-display").getByText(`${String(seconds / 3600).padStart(2, "0")}:00:00`, { exact: true }).waitFor();
    return fresh.data;
  };
  await verify(10800);
  const pathFilter = page.getByRole("combobox", { name: "Filter by paths", exact: true });
  await pathFilter.focus();
  await pathFilter.press("ArrowDown");
  await page.getByRole("option", { name: first.data.name, exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForFunction((expected) => new URL(location.href).searchParams.get("pathId") === expected, first.data.id);
  assert.equal(new URL(page.url()).searchParams.get("pathId"), first.data.id);
  let report = await verify(3600);
  assert.deepEqual(report.paths.map((path) => path.id), [first.data.id]);
  await page.reload();
  await verify(3600);
  await page.getByLabel(`Selected path: ${first.data.name}`, { exact: true }).locator(".v-chip__close").click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("pathId"));
  assert.equal(new URL(page.url()).searchParams.has("pathId"), false);
  await verify(10800);
  const picker = page.locator(".breakdown-control").filter({ has: page.locator(".label-picker") });
  await picker.getByRole("button", { name: "Open label picker", exact: true }).click();
  await page.getByRole("option", { name: label.data.name, exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForFunction((expected) => new URL(location.href).searchParams.get("labelId") === expected, label.data.id);
  assert.equal(new URL(page.url()).searchParams.get("labelId"), label.data.id);
  report = await verify(3600);
  assert.deepEqual(report.sessionLabels.map((entry) => entry.id), [label.data.id]);
  await page.reload();
  await verify(3600);
  await picker.getByRole("button", { name: `Remove ${label.data.name}`, exact: true }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("labelId"));
  assert.equal(new URL(page.url()).searchParams.has("labelId"), false);
  await verify(10800);
});

it("groups persisted report rows by Labels and preserves grouping with the range through reload and history", async () => {
  const labels = (await api("/labels")).data;
  const label = labels.find((entry) => entry.name.endsWith("selected Label"));
  assert.ok(label, "the preceding filter journey seeded a labeled session");
  await page.goto(`${baseUrl}/reports?startDate=2026-05-01&endDate=2026-05-02&aggregation=day`);
  await page.locator(".total-display").getByText("03:00:00", { exact: true }).waitFor();
  const grouping = () => page.getByRole("combobox", { name: "Group by", exact: true });
  const selectGroup = async (value) => {
    await grouping().focus();
    await grouping().press("ArrowDown");
    await page.getByRole("option", { name: value, exact: true }).click();
    await page.keyboard.press("Escape");
    const expectedGroup = value === "Path" ? null : value.toLowerCase();
    await page.waitForFunction((expected) => new URL(location.href).searchParams.get("groupBy") === expected, expectedGroup);
  };
  const verifyLabels = async () => {
    assert.equal(await grouping().inputValue(), "Labels");
    await page.getByRole("columnheader", { name: "Label", exact: true }).waitFor();
    await page.locator(".duration-table").getByText(label.name, { exact: true }).waitFor();
    assert.equal(await page.locator(".total-display").innerText(), "03:00:00");
    assert.equal(await page.locator(".chart-frame").getAttribute("aria-label"), "day tracked time with calendar inputs: Fri, May 1: 1h; Sat, May 2: 2h");
    await page.getByText("Hours", { exact: true }).waitFor();
    assert.match(await page.locator(".duration-table").innerText(), /01:00/);
    const params = new URL(page.url()).searchParams;
    assert.equal(params.get("groupBy"), "labels");
    assert.equal(params.get("startDate"), "2026-05-01");
    assert.equal(params.get("endDate"), "2026-05-02");
  };
  await selectGroup("Labels");
  await verifyLabels();
  await page.reload();
  await verifyLabels();
  if (process.env.REPORTS_E2E_SCREENSHOT_PATH)
    await page.screenshot({ path: process.env.REPORTS_E2E_SCREENSHOT_PATH, fullPage: true });
  await selectGroup("Path");
  await page.getByRole("columnheader", { name: "Path", exact: true }).waitFor();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("groupBy"));
  assert.equal(new URL(page.url()).searchParams.has("groupBy"), false);
  await page.goBack();
  await verifyLabels();
  await page.goForward();
  await page.getByRole("columnheader", { name: "Path", exact: true }).waitFor();
  assert.equal(await grouping().inputValue(), "Path");

  const screenshotDir = process.env.OTOTEST_THEME_SCREENSHOT_DIR;
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    const setTheme = async (preference) => {
      await page.goto(`${baseUrl}/settings`);
      const select = page.getByRole("combobox", { name: "Theme preference" });
      await select.waitFor();
      if (await select.inputValue() !== preference) {
        const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/preferences" && response.request().method() === "PUT" && response.status() === 200);
        await select.selectOption(preference);
        await saved;
      }
      assert.equal(await page.locator("html").getAttribute("data-theme"), preference);
    };
    await setTheme("light");
    await page.goto(`${baseUrl}/settings`);
    await page.locator("#password-change-form").waitFor();
    await page.getByRole("combobox", { name: "Theme preference" }).focus();
    await page.screenshot({ path: join(screenshotDir, "settings-light.png") });
    await page.goto(`${baseUrl}/reports?startDate=2026-05-01&endDate=2026-05-02&aggregation=day&groupBy=labels`);
    await page.getByRole("columnheader", { name: "Label", exact: true }).waitFor();
    await page.screenshot({ path: join(screenshotDir, "reports-light-controls.png") });
    await page.evaluate(() => window.scrollTo(0, 350));
    await page.screenshot({ path: join(screenshotDir, "reports-light-breakdown.png") });
    await page.getByRole("button", { name: "Search", exact: false }).click();
    const searchDialog = page.getByRole("dialog", { name: "Search everything" });
    await searchDialog.waitFor();
    await page.screenshot({ path: join(screenshotDir, "search-dialog-light.png") });
    await page.keyboard.press("Escape");

    await setTheme("dark");
    await page.goto(`${baseUrl}/settings`);
    await page.locator("#password-change-form").waitFor();
    await page.getByRole("combobox", { name: "Theme preference" }).focus();
    await page.screenshot({ path: join(screenshotDir, "settings-dark.png") });
    await page.goto(`${baseUrl}/reports?startDate=2026-05-01&endDate=2026-05-02&aggregation=day&groupBy=labels`);
    await page.getByRole("columnheader", { name: "Label", exact: true }).waitFor();
    await page.screenshot({ path: join(screenshotDir, "reports-dark-controls.png") });
    await page.evaluate(() => window.scrollTo(0, 350));
    await page.screenshot({ path: join(screenshotDir, "reports-dark-breakdown.png") });
    await page.getByRole("button", { name: "Search", exact: false }).click();
    await page.getByRole("dialog", { name: "Search everything" }).waitFor();
    await page.screenshot({ path: join(screenshotDir, "search-dialog-dark.png") });
    await page.keyboard.press("Escape");
    await setTheme("light");
  }
});

it("opens the nonzero Sankey flow with a text alternative and returns to the bar chart", async () => {
  const query = "startDate=2026-05-01&endDate=2026-05-02&aggregation=day";
  await page.goto(`${baseUrl}/reports?${query}`);
  await page.locator(".total-display").getByText("03:00:00", { exact: true }).waitFor();
  const report = await api(`/reports?${query}`);
  assert.equal(report.status, 200);
  assert.equal(report.data.sankey.links.length, 1);
  const sourcePathName = report.data.sankey.links[0].sourceLabel.split(" · ").at(-1);
  const targetPathName = report.data.sankey.links[0].targetLabel.split(" · ").at(-1);
  assert.ok(sourcePathName);
  assert.ok(targetPathName);

  await page.getByRole("button", { name: "Show Sankey", exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("sankey") === "1");
  await page.getByRole("button", { name: "Show bar chart", exact: true }).waitFor();
  await page.locator("#sankey-flow").waitFor();
  const flow = page.locator(".sankey-frame");
  await flow.waitFor();
  const flowText = await flow.getAttribute("aria-label");
  assert.match(flowText, /Time flow by day:/);
  assert.ok(flowText.includes(sourcePathName));
  assert.ok(flowText.includes(targetPathName));
  assert.ok(flowText.includes("Fri, May 1"));
  assert.ok(flowText.includes("Sat, May 2"));
  assert.ok(flowText.includes("01:00:00"));
  assert.equal(await page.locator(".sankey-aggregate-totals").getAttribute("aria-label"), "Aggregated flow totals");
  await page.locator(".sankey-aggregate-totals").getByText("1h", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Path timing by day", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("sankey"), "1");
  assert.equal(await page.getByRole("button", { name: "Show bar chart", exact: true }).getAttribute("aria-pressed"), "true");

  await page.getByRole("button", { name: "Show bar chart", exact: true }).click();
  await page.locator(".chart-frame").waitFor();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("sankey"));
  assert.equal(new URL(page.url()).searchParams.has("sankey"), false);
  assert.equal(await page.getByRole("button", { name: /Show Sankey/ }).getAttribute("aria-pressed"), "false");
});

it("keeps trendline and Sankey controls in sync with clicked and restored URL state", async () => {
  const marker = `Visualization state ${Date.now()}`;
  const paths = [];
  for (const suffix of ["first", "second"]) {
    const created = await api("/paths", "POST", { name: `${marker} ${suffix}` });
    assert.equal(created.status, 201);
    paths.push(created.data);
  }
  for (const [path, date] of paths.map((path, index) => [path, `2026-07-0${index + 1}`])) {
    const session = await api("/time-entries", "POST", {
      pathId: path.id,
      labelIds: [],
      description: marker,
      startedAt: `${date}T09:00:00Z`,
      endedAt: `${date}T10:00:00Z`,
    });
    assert.ok(session.status >= 200 && session.status < 300);
  }

  const query = "startDate=2026-07-01&endDate=2026-07-02&aggregation=day";
  await page.goto(`${baseUrl}/reports?${query}`);
  await page.locator(".total-display").getByText("02:00:00", { exact: true }).waitFor();
  const trendline = page.getByRole("button", { name: /Trendline mode:/ });
  await trendline.click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("trendline") === "linear");
  assert.equal(await trendline.getAttribute("aria-pressed"), "true");
  await page.reload();
  const restoredTrendline = page.getByRole("button", { name: /Trendline mode: linear\./ });
  await restoredTrendline.waitFor();
  assert.equal(await restoredTrendline.getAttribute("aria-pressed"), "true");

  await page.getByRole("button", { name: "Show Sankey", exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("sankey") === "1");
  const barChartButton = page.getByRole("button", { name: "Show bar chart", exact: true });
  await barChartButton.waitFor();
  await page.locator("#sankey-flow").waitFor();
  assert.equal(await barChartButton.getAttribute("aria-pressed"), "true");
  await page.reload();
  const restoredBarChartButton = page.getByRole("button", { name: "Show bar chart", exact: true });
  await restoredBarChartButton.waitFor();
  await page.locator("#sankey-flow").waitFor();
  assert.equal(await restoredBarChartButton.getAttribute("aria-pressed"), "true");
  await restoredBarChartButton.click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("sankey"));
  assert.equal(await page.getByRole("button", { name: "Show Sankey", exact: true }).getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator("#sankey-flow").count(), 0);
});

it("selects report presets and advances each interval by its calendar unit", async () => {
  await page.clock.setFixedTime(new Date("2024-02-29T12:00:00Z"));
  for (const [date, hours] of [["2024-02-29", 1], ["2024-02-01", 2], ["2024-01-01", 3], ["2023-12-31", 4]]) {
    const session = await api("/time-entries", "POST", {
      labelIds: [], description: "Report preset boundary fixture",
      startedAt: `${date}T09:00:00Z`, endedAt: `${date}T${String(9 + hours).padStart(2, "0")}:00:00Z`,
    });
    assert.ok(session.status >= 200 && session.status < 300);
  }
  for (const [preset, aggregation, start, end, nextStart, nextEnd, seconds] of [
    ["Today", "DAY", "2024-02-29", "2024-02-29", "2024-03-01", "2024-03-01", 3600],
    ["Week", "WEEK", "2024-02-26", "2024-03-03", "2024-03-04", "2024-03-10", 3600],
    ["Month", "MONTH", "2024-02-01", "2024-02-29", "2024-03-01", "2024-03-31", 10800],
    ["Quarter", "QUARTER", "2024-01-01", "2024-03-31", "2024-04-01", "2024-06-30", 21600],
    ["Year", "YEAR", "2024-01-01", "2024-12-31", "2025-01-01", "2025-12-31", 21600],
  ]) {
    await openReport("startDate=2023-01-01&endDate=2023-01-02&aggregation=day");
    await page.getByRole("combobox", { name: "Report aggregation", exact: true }).selectOption(aggregation);
    await page.getByRole("textbox", { name: "Datepicker input", exact: true }).click();
    await page.getByText(preset, { exact: true }).click();
    await page.waitForFunction(({ start, end }) => {
      const params = new URL(location.href).searchParams;
      return params.get("startDate") === start && params.get("endDate") === end;
    }, { start, end });
    const verify = async (expectedStart, expectedEnd, expectedSeconds = 0) => {
      await page.waitForFunction(({ start, end }) => {
        const params = new URL(location.href).searchParams;
        return params.get("startDate") === start && params.get("endDate") === end;
      }, { start: expectedStart, end: expectedEnd });
      const params = new URL(page.url()).searchParams;
      assert.equal(params.get("startDate"), expectedStart);
      assert.equal(params.get("endDate"), expectedEnd);
      assert.equal(params.get("aggregation"), aggregation.toLowerCase());
      const fresh = await api(`/reports?${params}`);
      assert.equal(fresh.status, 200);
      assert.equal(fresh.data.from, expectedStart);
      assert.equal(fresh.data.to, expectedEnd);
      assert.equal(fresh.data.totalSeconds, expectedSeconds);
      await page.locator(".total-display").getByText(`${String(expectedSeconds / 3600).padStart(2, "0")}:00:00`, { exact: true }).waitFor();
    };
    await verify(start, end, seconds);
    await page.getByRole("button", { name: "Next date range", exact: true }).click();
    await verify(nextStart, nextEnd);
    await page.getByRole("button", { name: "Previous date range", exact: true }).click();
    await verify(start, end, seconds);
  }
});

it("opens the matching owned Calendar day from its Reports source entry", async () => {
  const date = "2026-05-03";
  const note = `Reports source navigation ${Date.now()}`;
  const saved = await api(`/calendar/days/${date}`, "PUT", { note, labels: [] });
  assert.equal(saved.status, 200);
  const report = await openReport(`startDate=${date}&endDate=${date}&aggregation=day`);
  assert.equal(report.days.find((day) => day.date === date)?.calendarNote, note);
  await page.getByRole("heading", { name: "Calendar log", exact: true }).waitFor();
  const source = page.locator(`a[href="/calendar?date=${date}"]`);
  await source.getByText("Sun, May 3", { exact: true }).waitFor();
  await source.click();
  await page.getByRole("heading", { name: "Calendar", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/calendar");
  assert.equal(new URL(page.url()).searchParams.get("date"), date);
  assert.equal(await page.getByRole("textbox", { name: "Note", exact: true }).inputValue(), note);
});

it("renders zero-duration and unassigned Path/Label report data without broken charts", async () => {
  const zeroDate = "2026-06-10";
  const unassignedDate = "2026-06-11";
  const zero = await api("/time-entries", "POST", {
    pathId: null,
    labelIds: [],
    startedAt: `${zeroDate}T09:00:00Z`,
    endedAt: `${zeroDate}T09:00:00Z`,
    description: "Zero-duration Reports fixture",
  });
  assert.ok(zero.status >= 200 && zero.status < 300);
  const unassigned = await api("/time-entries", "POST", {
    pathId: null,
    labelIds: [],
    startedAt: `${unassignedDate}T09:00:00Z`,
    endedAt: `${unassignedDate}T10:00:00Z`,
    description: "Unassigned Reports fixture",
  });
  assert.ok(unassigned.status >= 200 && unassigned.status < 300);

  const query = "startDate=2026-06-10&endDate=2026-06-11&aggregation=day";
  const report = await api(`/reports?${query}`);
  assert.equal(report.status, 200);
  assert.equal(report.data.totalSeconds, 3600);
  const zeroDay = report.data.days.find((day) => day.date === zeroDate);
  assert.equal(zeroDay.totalSeconds, 0);
  assert.deepEqual(zeroDay.paths, []);
  assert.deepEqual(zeroDay.sessionLabels, []);
  const unassignedDay = report.data.days.find((day) => day.date === unassignedDate);
  assert.equal(unassignedDay.totalSeconds, 3600);
  assert.deepEqual(unassignedDay.paths.map((path) => [path.label, path.seconds]), [["Unassigned path", 3600]]);
  assert.deepEqual(unassignedDay.sessionLabels, []);

  await page.goto(`${baseUrl}/reports?${query}`);
  await page.locator(".total-display").getByText("01:00:00", { exact: true }).waitFor();
  assert.equal(await page.locator(".chart-frame").getAttribute("aria-label"), "day tracked time with calendar inputs: Thu, Jun 11: 1h");
  await page.getByText("Hours", { exact: true }).waitFor();
  const grouping = page.getByRole("combobox", { name: "Group by", exact: true });
  await grouping.focus();
  await grouping.press("ArrowDown");
  await page.getByRole("option", { name: "Labels", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("columnheader", { name: "Label", exact: true }).waitFor();
  await page.locator(".duration-table").getByText("No labels assigned in this period.", { exact: true }).waitFor();
  assert.equal(await page.locator(".total-display").innerText(), "01:00:00");

  await grouping.focus();
  await grouping.press("ArrowDown");
  await page.getByRole("option", { name: "Path", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.locator(".duration-table").getByText("Unassigned path", { exact: true }).waitFor();
  await page.locator(".duration-table").getByText("01:00", { exact: true }).waitFor();
  assert.equal(await page.locator(".total-display").innerText(), "01:00:00");
});

it("recovers from invalid password changes and signs the disposable account in with the new password", async () => {
  await page.goto(`${baseUrl}/settings`);
  const form = page.locator("#password-change-form");
  await form.waitFor();
  const current = form.locator("#current-password");
  const next = form.locator("#new-password");
  const confirm = form.locator("#confirm-password");
  const oldPassword = password;
  const newPassword = `Reports-New-${Date.now()}-Password`;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  await page.evaluate(async (value) => navigator.clipboard.writeText(value), newPassword);
  await next.focus();
  await next.press("Control+V");
  assert.equal(await next.inputValue(), newPassword, "the new password field accepts pasted text");
  assert.equal(await current.getAttribute("autocomplete"), "current-password");
  assert.equal(await next.getAttribute("autocomplete"), "new-password");
  assert.equal(await confirm.getAttribute("autocomplete"), "new-password");
  await current.fill(oldPassword);
  await next.fill(newPassword);
  await confirm.fill(`${newPassword}-mismatch`);
  const mismatchedRequest = page.waitForRequest((request) => request.url().includes("/api/v1/auth/password"));
  await form.getByRole("button", { name: "Change password", exact: true }).click();
  assert.equal(await Promise.race([mismatchedRequest.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 100))]), false);
  await page.getByRole("alert").getByText("Passwords do not match. Re-enter the same new password in both fields.", { exact: true }).waitFor();
  assert.equal(await next.inputValue(), newPassword);

  await confirm.fill(newPassword);
  await current.fill("wrong disposable current password");
  const failedChange = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/auth/password" && response.request().method() === "PUT");
  await form.getByRole("button", { name: "Change password", exact: true }).click();
  assert.equal((await failedChange).status(), 400);
  await page.getByRole("alert").getByText("Could not save your password. Check your current password and try again.", { exact: true }).waitFor();
  assert.equal(await next.inputValue(), newPassword);
  assert.equal(await confirm.inputValue(), newPassword);

  await current.fill(oldPassword);
  const successfulChange = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/auth/password" && response.request().method() === "PUT");
  await form.getByRole("button", { name: "Change password", exact: true }).click();
  assert.equal((await successfulChange).status(), 200);
  await page.getByRole("status").getByText("Password saved. You can now sign in with your email and password.", { exact: true }).waitFor();
  assert.equal(await current.inputValue(), "");
  assert.equal(await next.inputValue(), "");
  assert.equal(await confirm.inputValue(), "");
  assert.equal((await api("/auth/me")).data.hasPassword, true);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  const signIn = async (candidate) => {
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
    await page.getByRole("textbox", { name: "Password", exact: true }).fill(candidate);
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === "/api/v1/auth/login" && result.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    return response;
  };
  assert.ok((await signIn(oldPassword)).status() >= 400);
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("heading", { name: "Sign in", exact: true }).count(), 1);
  assert.equal((await signIn(newPassword)).status(), 200);
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  await page.goto(`${baseUrl}/settings`);
  await page.locator("#password-change-form").waitFor();
});

it("exports a usable owner-only CSV, preserves Unicode and CSV-special content, and recovers from failure", async () => {
  const ownPathName = `Export, “Unicode Ω” ${Date.now()}`;
  const ownDescription = 'first line, with "quoted" text\nand a second line';
  const ownPath = await api("/paths", "POST", { name: ownPathName, description: ownDescription });
  assert.equal(ownPath.status, 201);

  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await otherPage.goto(`${baseUrl}/`);
    await otherPage.getByRole("button", { name: /New here\? Create an account/ }).click();
    await otherPage.getByRole("textbox", { name: "Email" }).fill(`reports-export-other-${Date.now()}@example.com`);
    await otherPage.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await otherPage.getByRole("textbox", { name: "Confirm password" }).fill(password);
    await otherPage.getByRole("button", { name: "Create account", exact: true }).click();
    await otherPage.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
    const privatePathName = `Private other account ${Date.now()}`;
    const privatePath = await otherPage.evaluate(async (name) => {
      const response = await fetch("/api/v1/paths", { method: "POST", headers: {
        Authorization: `Bearer ${localStorage.getItem("know_token")}`, "Content-Type": "application/json",
      }, body: JSON.stringify({ name }) });
      return { status: response.status, data: await response.json() };
    }, privatePathName);
    assert.equal(privatePath.status, 201);
    await page.goto(`${baseUrl}/settings`);
    await page.getByRole("tab", { name: "Export", exact: true }).click();
    const downloadWait = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Knowledge Base CSV", exact: true }).click();
    const download = await downloadWait;
    assert.equal(download.suggestedFilename(), "knowledge-base-export.csv");
    assert.equal(await download.failure(), null);
    await page.getByRole("status").getByText("Your Knowledge Base export is ready.", { exact: true }).waitFor();
    const exported = await readFile(await download.path(), "utf8");
    const rows = parseCsv(exported);
    assert.deepEqual(rows[0], ["entity", "id", "payload"]);
    const ownRow = rows.find((row) => row[0] === "path" && row[1] === ownPath.data.id);
    assert.ok(ownRow, "the export contains the current user's seeded Path");
    const payload = JSON.parse(ownRow[2]);
    assert.equal(payload.name, ownPathName);
    assert.equal(payload.description, ownDescription);
    assert.equal(exported.includes(privatePathName), false, "the export omits a different account's Path");
    assert.equal(exported.includes("know_token"), false, "the export contains no authentication token field");
    assert.equal(exported.includes("currentPassword"), false, "the export contains no password-change data");

    let downloads = 0;
    const countDownload = () => { downloads += 1; };
    page.on("download", countDownload);
    const endpoint = "**/api/v1/imports/knowledge-base/export";
    await page.route(endpoint, (route) => route.fulfill({ status: 503, body: "Unavailable" }));
    try {
      const failed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/imports/knowledge-base/export");
      await page.getByRole("button", { name: "Download Knowledge Base CSV", exact: true }).click();
      assert.equal((await failed).status(), 503);
      await page.getByRole("status").getByText("Could not export your data. Try again.", { exact: true }).waitFor();
      assert.equal(downloads, 0);
    } finally {
      page.off("download", countDownload);
      await page.unroute(endpoint);
    }
    const retryWait = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Knowledge Base CSV", exact: true }).click();
    const retry = await retryWait;
    assert.equal(retry.suggestedFilename(), "knowledge-base-export.csv");
    await page.getByRole("status").getByText("Your Knowledge Base export is ready.", { exact: true }).waitFor();
  } finally {
    await otherContext.close();
  }
});
