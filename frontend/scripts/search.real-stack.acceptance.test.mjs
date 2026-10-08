import assert from "node:assert/strict";
import { after, before, it as nodeIt } from "node:test";
import { chromium, webkit } from "playwright";
import { resolve } from "node:path";
import { browserFailureArtifacts } from "./browser-failure-artifacts.mjs";

const baseUrl = process.env.SEARCH_E2E_BASE_URL;
if (!baseUrl) throw new Error("SEARCH_E2E_BASE_URL is required");
const browserType = process.env.BROWSER_ENGINE === "webkit" ? webkit : chromium;
const phone = process.env.BROWSER_PROFILE === "iphone";
let browser;
const failureArtifacts = browserFailureArtifacts({
  directory: process.env.SEARCH_E2E_ARTIFACT_DIR || resolve(process.cwd(), "../harden-tests/local-artifacts", `search-${Date.now()}-${process.env.BROWSER_PROFILE || "default"}`),
  engine: process.env.BROWSER_ENGINE || "chromium",
  profile: process.env.BROWSER_PROFILE || "default",
});

function it(name, run) {
  nodeIt(name, async (testContext) => {
    await failureArtifacts.begin(name);
    try {
      await run(testContext);
    } catch (error) {
      await failureArtifacts.end(error);
      throw error;
    } finally {
      await failureArtifacts.end();
    }
  });
}

before(async () => {
  browser = await browserType.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
});
after(async () => browser?.close());

async function api(path, init = {}, token) {
  const response = await fetch(new URL(`/api/v1${path}`, baseUrl), {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
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
  await failureArtifacts.addContext(context);
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
    await dialog.locator(".global-search-spinner").waitFor();
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
  } catch (error) {
    await failureArtifacts.end(error);
    throw error;
  } finally {
    releaseFirstRequest();
    await context.close();
  }
});

it("keeps long note titles and matching body snippets reachable on phone and desktop widths", async () => {
  const account = {
    email: `search-long-e2e-${Date.now()}@example.com`,
    password: `Search-long-e2e-${crypto.randomUUID()}`,
  };
  const { token } = await api("/auth/register", { method: "POST", body: JSON.stringify(account) });
  const title = `Long note title ${"Resilience ".repeat(8)}visible ending`;
  const body = `${"Context about resilient search results and wrapping. ".repeat(12)}DistinctiveSnippetTerm ${"After the match, additional note content must remain readable. ".repeat(8)}`;
  const noteContent = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: body }] }] });
  await api("/notes", { method: "POST", body: JSON.stringify({ title, content: noteContent, contentText: body, tags: [] }) }, token);
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  await failureArtifacts.addContext(context);
  await context.addInitScript((value) => localStorage.setItem("know_token", value), token);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  try {
    await page.goto(new URL("/paths", baseUrl).toString());
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Search everything" });
    const input = dialog.getByRole("combobox", { name: "Search sessions, boards, notes, labels, paths, and logs" });
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/search");
    await input.fill("DistinctiveSnippetTerm");
    const searchResponse = await responsePromise;
    const searchResult = await searchResponse.json();
    assert.ok(searchResult.groups?.some((group) => group.results?.length), `search API returned no groups: ${JSON.stringify(searchResult)}`);
    assert.ok(searchResult.groups.some((group) => group.results.some((item) => item.title === title)), `search API omitted the long note: ${JSON.stringify(searchResult.groups.map((group) => ({ type: group.type, results: group.results.map((item) => ({ title: item.title, snippet: item.snippet })) })))}`);
    const result = dialog.getByRole("option", { name: new RegExp("Long note title.*visible ending") });
    await result.waitFor();
    assert.match(await result.getAttribute("aria-label"), /Long note title.*visible ending/);
    assert.match(await result.locator(".global-search-snippet").textContent(), /DistinctiveSnippetTerm/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "long search title/snippet must not create page overflow");
  } catch (error) {
    await failureArtifacts.end(error);
    throw error;
  } finally {
    await context.close();
  }
});
