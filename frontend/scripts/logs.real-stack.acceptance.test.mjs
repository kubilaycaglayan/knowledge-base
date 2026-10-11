import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.LOGS_E2E_BASE_URL;
const email = process.env.LOGS_E2E_EMAIL;
const password = process.env.LOGS_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("LOGS_E2E_BASE_URL, LOGS_E2E_EMAIL, and LOGS_E2E_PASSWORD are required");

const marker = `LogsJourney-${Date.now()}`;
let browser;
let page;

async function api(path, method = "GET", body) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api/v1${path}`, { cache: "no-store", method, headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }, { path, method, body });
}

before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || undefined,
    headless: process.env.BROWSER_HEADLESS !== "false",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce", timezoneId: "America/Los_Angeles" });
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

async function createLog(body, timestamp) {
  await page.getByRole("textbox", { name: "Log text", exact: true }).fill(body);
  if (timestamp) await page.getByLabel("Log timestamp", { exact: true }).fill(timestamp);
  const saved = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/v1/logs" && response.request().method() === "POST",
  );
  await page.locator(".log-composer").getByRole("button", { name: "Save", exact: true }).click();
  const response = await saved;
  assert.equal(response.status(), 201);
  const record = await response.json();
  const entry = page.locator(`#log-${record.id}`);
  await entry.waitFor();
  return { record, entry };
}

it("uses the browser-local timestamp default and wraps long multi-line entries", async () => {
  await page.goto(`${baseUrl}/logs`);
  const body = `${marker} long entry\n${"A long unbroken value ".repeat(24)}\n${"multi-line content ".repeat(32).trimEnd()}`;
  await page.getByRole("textbox", { name: "Log text", exact: true }).fill(body);
  const selectedLocalTime = await page.getByLabel("Log timestamp", { exact: true }).inputValue();
  const expectedInstant = await page.evaluate((value) => new Date(value).toISOString(), selectedLocalTime);
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/logs" && response.request().method() === "POST");
  await page.locator(".log-composer").getByRole("button", { name: "Save", exact: true }).click();
  const response = await saved;
  assert.equal(response.status(), 201);
  const record = await response.json();
  const entry = page.locator(`#log-${record.id}`);
  await entry.waitFor();
  const persisted = (await api(`/logs/${record.id}`)).data;
  const occurredAt = Date.parse(persisted.occurredAt);
  assert.equal(occurredAt, Date.parse(expectedInstant), "default timestamp should match the browser-local input value");
  assert.equal(await entry.locator("time").getAttribute("datetime"), persisted.occurredAt);
  const expectedLocalTime = await page.evaluate((value) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)), persisted.occurredAt);
  assert.equal((await entry.locator("time").innerText()).trim(), expectedLocalTime);
  assert.equal(await entry.locator(".log-body").innerText(), body);
  const dimensions = await entry.evaluate((row) => {
    const text = row.querySelector(".log-body");
    return { rowWidth: row.clientWidth, rowScrollWidth: row.scrollWidth, textWidth: text.clientWidth, textScrollWidth: text.scrollWidth };
  });
  assert.ok(dimensions.rowScrollWidth <= dimensions.rowWidth, `Log row overflowed: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.textScrollWidth <= dimensions.textWidth, `Log text overflowed: ${JSON.stringify(dimensions)}`);
  await page.reload();
  const reloaded = page.locator(`#log-${record.id}`);
  await reloaded.waitFor();
  assert.equal(await reloaded.locator(".log-body").innerText(), body);
  assert.equal((await reloaded.locator("time").innerText()).trim(), expectedLocalTime);
});

it("assigns and removes a LOG-scope label without changing the Log", async () => {
  await page.goto(`${baseUrl}/logs`);
  const labelName = `${marker} log label`;
  const createdLabel = await api("/labels", "POST", { name: labelName, color: "#2878D5", scopes: ["LOG"] });
  assert.equal(createdLabel.status, 201);
  const labelsLoaded = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/labels" && new URL(response.url()).searchParams.get("scope") === "LOG");
  await page.reload();
  await labelsLoaded;
  const body = `${marker} label assignment`;
  const { record, entry } = await createLog(body);
  const picker = entry.getByRole("button", { name: /^Choose labels for log from / });
  await picker.click();
  const option = page.getByRole("option", { name: labelName, exact: true });
  await option.waitFor();
  const assign = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/logs/${record.id}/labels` && response.request().method() === "PUT");
  await option.click();
  assert.equal((await assign).status(), 200);
  assert.deepEqual((await api(`/logs/${record.id}`)).data.labelIds, [createdLabel.data.id]);
  await page.reload();
  const reloadedEntry = page.locator(`#log-${record.id}`);
  await reloadedEntry.getByText(body, { exact: true }).waitFor();
  const reloadedPicker = reloadedEntry.getByRole("button", { name: /^Choose labels for log from / });
  await reloadedPicker.click();
  const selectedOption = page.getByRole("option", { name: labelName, exact: true });
  await selectedOption.waitFor();
  assert.equal(await selectedOption.getAttribute("aria-selected"), "true");
  const unassign = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/logs/${record.id}/labels` && response.request().method() === "PUT");
  await selectedOption.click();
  assert.equal((await unassign).status(), 200);
  assert.deepEqual((await api(`/logs/${record.id}`)).data.labelIds, []);
  assert.equal((await api(`/logs/${record.id}`)).data.body, body);
  const wrongScope = await api("/labels", "POST", { name: `${marker} notes-only label`, color: "#2878D5", scopes: ["NOTE"] });
  assert.equal(wrongScope.status, 201);
  const rejectedAssignment = await api(`/logs/${record.id}/labels`, "PUT", { labelIds: [wrongScope.data.id] });
  assert.equal(rejectedAssignment.status, 400);
  assert.deepEqual((await api(`/logs/${record.id}`)).data.labelIds, []);
  await page.reload();
  await reloadedEntry.getByText(body, { exact: true }).waitFor();
  assert.equal(await reloadedEntry.getByText(labelName, { exact: true }).count(), 0);
});

it("keeps Logs search and pagination synchronized with the URL", async () => {
  const previousLogs = (await api("/logs")).data;
  await Promise.all(previousLogs.map((log) => api(`/logs/${log.id}`, "DELETE")));
  const seeded = await page.evaluate(async ({ marker, token }) => {
    const responses = await Promise.all(Array.from({ length: 101 }, (_, index) => fetch("/api/v1/logs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: `${marker} page fixture ${index}`, occurredAt: new Date(Date.now() - index * 1000).toISOString() }),
    })));
    return Promise.all(responses.map(async (response) => ({ status: response.status, data: await response.json() })));
  }, { marker, token: await page.evaluate(() => localStorage.getItem("know_token")) });
  assert.ok(seeded.every((item) => item.status === 201));
  await page.goto(`${baseUrl}/logs`);
  await page.locator(".log-entry").first().waitFor();
  assert.equal(await page.locator(".log-entry").count(), 100);

  await page.keyboard.press("/");
  const search = page.getByRole("searchbox", { name: "Search all logs" });
  await search.fill(`${marker} page fixture 0`);
  await page.locator(`#log-${seeded[0].data.id}`).waitFor();
  assert.equal(await page.locator(".log-entry").count(), 1);
  assert.equal(new URL(page.url()).searchParams.get("q"), `${marker} page fixture 0`);
  await page.reload();
  await page.locator(`#log-${seeded[0].data.id}`).waitFor();
  await page.keyboard.press("/");
  const reloadedSearch = page.getByRole("searchbox", { name: "Search all logs" });
  await reloadedSearch.waitFor();
  assert.equal(await reloadedSearch.inputValue(), `${marker} page fixture 0`);
  await page.locator(`#log-${seeded[0].data.id}`).waitFor();
  assert.equal(await page.locator(".log-entry").count(), 1);

  const activeSearch = page.getByRole("searchbox", { name: "Search all logs" });
  await activeSearch.fill(`${marker} no matching entry`);
  await page.getByText("No logs match this search.", { exact: true }).waitFor();
  await activeSearch.fill("");
  assert.equal(await page.locator(".log-entry").count(), 100);
  assert.equal(new URL(page.url()).searchParams.has("q"), false);
  assert.equal(await activeSearch.evaluate((input) => document.activeElement === input), true, "clearing search keeps focus in the search field");

  const pagination = page.getByRole("navigation", { name: "Log pages" });
  const previous = pagination.getByRole("button", { name: "Previous", exact: true });
  const next = pagination.getByRole("button", { name: "Next", exact: true });
  assert.equal(await previous.isDisabled(), true);
  assert.equal(await next.isDisabled(), false);
  await next.click();
  await pagination.getByText("Page 2 of 2", { exact: true }).waitFor();
  assert.equal(await page.locator(".log-entry").count(), 1);
  await page.locator(`#log-${seeded[100].data.id}`).waitFor();
  assert.equal(await page.locator(`#log-${seeded[0].data.id}`).count(), 0, "the next page contains a distinct row");
  assert.equal(new URL(page.url()).searchParams.get("page"), "2");
  assert.equal(await next.isDisabled(), true);
  assert.equal(await previous.isDisabled(), false);
  await previous.click();
  await pagination.getByText("Page 1 of 2", { exact: true }).waitFor();
  assert.equal(await page.locator(".log-entry").count(), 100);
  await page.locator(`#log-${seeded[0].data.id}`).waitFor();
  assert.equal(await page.locator(`#log-${seeded[100].data.id}`).count(), 0, "the previous page restores its earlier rows");
  await next.click();
  await page.reload();
  await page.getByRole("navigation", { name: "Log pages" }).getByText("Page 2 of 2", { exact: true }).waitFor();

  await page.goto(`${baseUrl}/`);
  await page.goBack();
  await page.getByRole("navigation", { name: "Log pages" }).getByText("Page 2 of 2", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("page"), "2");
  await page.keyboard.press("/");
  const restoredSearch = page.getByRole("searchbox", { name: "Search all logs" });
  await restoredSearch.waitFor();
  await restoredSearch.fill(`${marker} page fixture 0`);
  await page.goto(`${baseUrl}/`);
  await page.goBack();
  await page.keyboard.press("/");
  await page.getByRole("searchbox", { name: "Search all logs" }).waitFor();
  assert.equal(await page.getByRole("searchbox", { name: "Search all logs" }).inputValue(), `${marker} page fixture 0`);
  await page.locator(`#log-${seeded[0].data.id}`).waitFor();
  assert.equal(await page.locator(".log-entry").count(), 1);
  await page.goForward();
  assert.equal(new URL(page.url()).pathname, "/");
  const deletedFixtures = await Promise.all(seeded.map((item) => api(`/logs/${item.data.id}`, "DELETE")));
  assert.ok(deletedFixtures.every((item) => item.status === 204));
});

it("creates, edits, deletes, and reloads a Log with persisted API state", async () => {
  await page.goto(`${baseUrl}/logs`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const initialBody = `${marker} original entry`;
  await page.getByRole("textbox", { name: "Log text" }).fill(initialBody);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  let entry = page.locator("article.log-entry").filter({ hasText: initialBody });
  await entry.waitFor();
  const logId = (await entry.getAttribute("id")).replace(/^log-/, "");
  entry = page.locator(`#log-${logId}`);
  let savedLog = await api(`/logs/${logId}`);
  assert.equal(savedLog.status, 200);
  assert.equal(savedLog.data.body, initialBody);
  await page.reload();
  entry = page.locator(`#log-${logId}`);
  await entry.getByText(initialBody, { exact: true }).waitFor();

  await entry.getByRole("button", { name: /^Edit log from / }).click();
  const editedBody = `${marker} edited entry`;
  await entry.getByRole("textbox", { name: /^Edit log text from / }).fill(editedBody);
  await entry.getByRole("button", { name: "Save", exact: true }).click();
  entry = page.locator(`#log-${logId}`);
  await entry.getByText(editedBody, { exact: true }).waitFor();
  savedLog = await api(`/logs/${logId}`);
  assert.equal(savedLog.status, 200);
  assert.equal(savedLog.data.body, editedBody);
  await page.reload();
  entry = page.locator(`#log-${logId}`);
  await entry.waitFor();

  await entry.getByRole("button", { name: /^Remove log from / }).click();
  const confirmation = page.getByRole("dialog", { name: "Remove this log? This cannot be undone." });
  await confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
  await entry.waitFor({ state: "detached" });
  savedLog = await api(`/logs/${logId}`);
  assert.equal(savedLog.status, 404);
  await page.reload();
  await page.getByText(editedBody, { exact: true }).waitFor({ state: "detached" });
});

it("rejects empty and whitespace Log text without creating a record", async () => {
  await page.goto(`${baseUrl}/logs`);
  const before = (await api("/logs")).data.length;
  for (const text of ["", "   "]) {
    await page.getByRole("textbox", { name: "Log text", exact: true }).fill(text);
    await page.locator(".log-composer").getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("alert").getByText("Enter log text before saving.", { exact: true }).waitFor();
    assert.equal((await api("/logs")).data.length, before);
  }
});

it("persists an explicit Log timestamp, cancels edits, and retains a failed edit for retry", async () => {
  await page.goto(`${baseUrl}/logs`);
  const originalBody = `${marker} timestamp and retry`;
  const initialTime = "2025-02-03T10:15";
  const changedTime = "2025-02-04T11:30";
  const expectedTime = await page.evaluate((value) => new Date(value).toISOString(), initialTime);
  const { record, entry } = await createLog(originalBody, initialTime);
  assert.equal(Date.parse((await api(`/logs/${record.id}`)).data.occurredAt), Date.parse(expectedTime));
  await page.reload();
  await entry.waitFor();
  assert.equal(Date.parse(await entry.locator("time").getAttribute("datetime")), Date.parse(expectedTime));

  await entry.getByRole("button", { name: /^Edit log from / }).click();
  await entry.getByRole("textbox", { name: /^Edit log text from / }).fill(`${marker} cancelled edit`);
  await entry.getByLabel("Edit log timestamp", { exact: true }).fill(changedTime);
  await entry.getByRole("button", { name: "Cancel", exact: true }).click();
  let persisted = (await api(`/logs/${record.id}`)).data;
  assert.equal(persisted.body, originalBody);
  assert.equal(Date.parse(persisted.occurredAt), Date.parse(expectedTime));
  await page.reload();
  await entry.getByText(originalBody, { exact: true }).waitFor();

  await entry.getByRole("button", { name: /^Edit log from / }).click();
  const draftBody = `${marker} retained after failure`;
  const editor = entry.getByRole("textbox", { name: /^Edit log text from / });
  await editor.fill(draftBody);
  await entry.getByLabel("Edit log timestamp", { exact: true }).fill(changedTime);
  const endpoint = `**/api/v1/logs/${record.id}`;
  const rejectEdit = async (route) => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Disposable save failure" }) });
    else await route.continue();
  };
  await page.route(endpoint, rejectEdit);
  try {
    await entry.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("alert").getByText("Unable to save this log. Your text is still here; try again.", { exact: true }).waitFor();
    assert.equal(await editor.inputValue(), draftBody);
    assert.equal(await entry.getByLabel("Edit log timestamp", { exact: true }).inputValue(), changedTime);
    persisted = (await api(`/logs/${record.id}`)).data;
    assert.equal(persisted.body, originalBody);
    assert.equal(Date.parse(persisted.occurredAt), Date.parse(expectedTime));
  } finally {
    await page.unroute(endpoint, rejectEdit);
  }
  const update = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/logs/${record.id}` && response.request().method() === "PUT");
  await entry.getByRole("button", { name: "Save", exact: true }).click();
  assert.equal((await update).status(), 200);
  await entry.getByText(draftBody, { exact: true }).waitFor();
  const changedIso = await page.evaluate((value) => new Date(value).toISOString(), changedTime);
  await page.reload();
  await entry.getByText(draftBody, { exact: true }).waitFor();
  persisted = (await api(`/logs/${record.id}`)).data;
  assert.equal(persisted.body, draftBody);
  assert.equal(Date.parse(persisted.occurredAt), Date.parse(changedIso));
  assert.equal(Date.parse(await entry.locator("time").getAttribute("datetime")), Date.parse(changedIso));
  assert.equal((await api("/logs")).data.filter((log) => log.id === record.id).length, 1);
});

it("cancels Log removal and recovers from a rejected removal before deleting once", async () => {
  await page.goto(`${baseUrl}/logs`);
  const body = `${marker} removal recovery`;
  const { record, entry } = await createLog(body);
  const openRemoval = async () => {
    await entry.getByRole("button", { name: /^Remove log from / }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this log? This cannot be undone." });
    await dialog.waitFor();
    return dialog;
  };
  await (await openRemoval()).getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal((await api(`/logs/${record.id}`)).data.body, body);
  await entry.getByText(body, { exact: true }).waitFor();

  const endpoint = `**/api/v1/logs/${record.id}`;
  const rejectRemoval = async (route) => {
    if (route.request().method() === "DELETE") await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Disposable removal failure" }) });
    else await route.continue();
  };
  await page.route(endpoint, rejectRemoval);
  try {
    await (await openRemoval()).getByRole("button", { name: "Confirm", exact: true }).click();
    await page.getByRole("alert").getByText("Unable to remove this log. Please try again.", { exact: true }).waitFor();
    assert.equal((await api(`/logs/${record.id}`)).data.body, body);
    await page.reload();
    await entry.getByText(body, { exact: true }).waitFor();
  } finally {
    await page.unroute(endpoint, rejectRemoval);
  }
  const response = page.waitForResponse((result) => new URL(result.url()).pathname === `/api/v1/logs/${record.id}` && result.request().method() === "DELETE");
  await (await openRemoval()).getByRole("button", { name: "Confirm", exact: true }).click();
  assert.equal((await response).status(), 204);
  await entry.waitFor({ state: "detached" });
  await page.reload();
  assert.equal((await api(`/logs/${record.id}`)).status, 404);
  assert.equal(await entry.count(), 0);
});
