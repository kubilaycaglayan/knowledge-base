import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { chromium, webkit } from "playwright";

const baseUrl = process.env.SEARCH_E2E_BASE_URL;
if (!baseUrl) throw new Error("SEARCH_E2E_BASE_URL is required");
const browserType = process.env.BROWSER_ENGINE === "webkit" ? webkit : chromium;
const phone = process.env.BROWSER_PROFILE === "iphone";
let browser;

before(async () => {
  browser = await browserType.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
});
after(async () => browser?.close());

async function api(path, init = {}) {
  const response = await fetch(new URL(`/api/v1${path}`, baseUrl), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  assert.ok(response.ok, `${init.method || "GET"} ${path} returned ${response.status}`);
  return response.json();
}

it("preserves a search query after a retryable request failure and retries accessibly", async () => {
  const account = {
    email: `search-e2e-${Date.now()}@example.com`,
    password: `Search-e2e-${crypto.randomUUID()}`,
  };
  const { token } = await api("/auth/register", { method: "POST", body: JSON.stringify(account) });
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  await context.addInitScript((value) => localStorage.setItem("know_token", value), token);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  let attempts = 0;
  let reportFirstRequest;
  let releaseFirstRequest;
  const firstRequestHeld = new Promise((resolve) => { reportFirstRequest = resolve; });
  const firstRequestRelease = new Promise((resolve) => { releaseFirstRequest = resolve; });
  await page.route("**/api/v1/search?*", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      reportFirstRequest();
      await firstRequestRelease;
      return route.abort("internetdisconnected");
    }
    return route.continue();
  });
  try {
    await page.goto(new URL("/paths", baseUrl).toString());
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Search everything" });
    const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
    await input.fill("zzzxq-nonexistent-query");
    await firstRequestHeld;
    await page.waitForFunction(() => document.querySelector("#global-search-status")?.textContent.includes("Searching…"));
    await context.setOffline(true);
    releaseFirstRequest();
    await dialog.getByRole("alert").getByText("Search isn’t available right now. Check your connection and try again.").waitFor();
    assert.equal(await input.inputValue(), "zzzxq-nonexistent-query");
    assert.equal(attempts, 1);

    const retryResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/v1/search" &&
      response.request().method() === "GET" && response.status() === 200,
    );
    await context.setOffline(false);
    const retry = dialog.getByRole("button", { name: "Try again" });
    await retry.focus();
    await retry.press("Enter");
    await retryResponse;
    await dialog.locator(".global-search-empty").getByText("No results for", { exact: false }).waitFor();
    await page.waitForFunction(() => document.querySelector("#global-search-status")?.textContent.includes("No results for"));
    assert.equal(await input.inputValue(), "zzzxq-nonexistent-query");
    assert.equal(attempts, 2, "retry should issue one request");
  } finally {
    releaseFirstRequest();
    await context.close();
  }
});
