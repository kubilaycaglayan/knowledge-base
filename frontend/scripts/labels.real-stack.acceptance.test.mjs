import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.LABELS_E2E_BASE_URL;
const email = process.env.LABELS_E2E_EMAIL;
const password = process.env.LABELS_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("LABELS_E2E_BASE_URL, LABELS_E2E_EMAIL, and LABELS_E2E_PASSWORD are required");

const marker = `LabelsJourney-${Date.now()}`;
let browser;
let page;

async function api(path, method = "GET", body) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api/v1${path}`, { method, cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }, { path, method, body });
}

before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || undefined,
    headless: process.env.BROWSER_HEADLESS !== "false",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
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

async function createLabel(name) {
  await page.getByRole("button", { name: "Add label", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a label" });
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  const response = page.waitForResponse((result) => new URL(result.url()).pathname === "/api/v1/labels" && result.request().method() === "POST");
  await dialog.getByRole("button", { name: "Add label", exact: true }).click();
  assert.equal((await response).status(), 201);
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).waitFor();
  return (await api("/labels")).data.find((label) => label.name === name);
}

it("creates, edits, removes, and reloads a Label with persisted API state", async () => {
  await page.goto(`${baseUrl}/labels`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Your labels" }).waitFor();
  await page.getByRole("button", { name: "Add label" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add a label" });
  const initialName = `${marker} original`;
  await createDialog.getByRole("textbox", { name: "Name" }).fill(initialName);
  await createDialog.getByRole("button", { name: "Choose label color: Red (#EF4444)", exact: true }).click();
  for (const scope of ["Notes", "Calendar", "Sessions", "Boards"]) {
    await createDialog.getByRole("checkbox", { name: scope, exact: true }).check();
  }
  await createDialog.getByRole("button", { name: "Add label", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${initialName}` }).waitFor();
  let labels = await api("/labels");
  assert.equal(labels.status, 200);
  const created = labels.data.find((label) => label.name === initialName);
  assert.ok(created, "the label is created by the UI and present in a fresh API read");
  assert.equal(created.color, "#EF4444");
  assert.deepEqual(created.scopes, ["LOG"], "the selected scope is persisted as the only available product surface");
  await page.reload();
  await page.getByRole("button", { name: `Edit ${initialName}`, exact: true }).waitFor();
  assert.equal(await page.locator(".label-row").filter({ hasText: initialName }).count(), 1);
  assert.ok((await api("/labels?scope=LOG")).data.some((label) => label.id === created.id));
  assert.equal((await api("/labels?scope=NOTE")).data.some((label) => label.id === created.id), false);
  const labelRow = () => page.locator(".label-row").filter({ hasText: editedName });

  const editedName = `${marker} edited`;
  await page.getByRole("button", { name: `Edit ${initialName}` }).click();
  const editDialog = page.getByRole("dialog", { name: `Edit ${initialName}` });
  await editDialog.getByRole("textbox", { name: "Name" }).fill(editedName);
  await editDialog.getByRole("button", { name: "Set edit label color: Red (#EF4444)", exact: true }).click();
  await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${editedName}` }).waitFor();
  labels = await api("/labels");
  assert.ok(labels.data.some((label) => label.id === created.id && label.name === editedName && label.color === "#EF4444"));
  await page.reload();
  await page.getByRole("button", { name: `Edit ${editedName}` }).waitFor();
  assert.equal(await labelRow().locator(".label-swatch").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(239, 68, 68)");

  const assignedLog = await api("/logs", "POST", { body: `${marker} color assignment`, occurredAt: new Date().toISOString() });
  assert.equal(assignedLog.status, 201);
  assert.equal((await api(`/logs/${assignedLog.data.id}/labels`, "PUT", { labelIds: [created.id] })).status, 200);
  await page.goto(`${baseUrl}/logs`);
  const logEntry = page.locator(`#log-${assignedLog.data.id}`);
  await logEntry.getByText(`${marker} color assignment`, { exact: true }).waitFor();
  await logEntry.getByRole("button", { name: /^Choose labels for log from / }).click();
  const assignedOption = page.getByRole("option", { name: editedName, exact: true });
  await assignedOption.waitFor();
  assert.equal(await assignedOption.getAttribute("aria-selected"), "true");
  assert.match(await assignedOption.locator(".option-dot").getAttribute("style"), /rgb\(239, 68, 68\)/);
  assert.equal((await api(`/logs/${assignedLog.data.id}/labels`, "PUT", { labelIds: [] })).status, 200);

  await page.goto(`${baseUrl}/labels`);
  await labelRow().getByRole("button", { name: `Remove ${editedName}` }).click();
  const confirmation = page.getByRole("dialog", { name: `Remove “${editedName}”?` });
  await confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${editedName}` }).waitFor({ state: "detached" });
  labels = await api("/labels");
  assert.equal(labels.data.some((label) => label.id === created.id), false);
  await page.reload();
  await page.getByRole("button", { name: `Edit ${editedName}` }).waitFor({ state: "detached" });
});

it("validates blank and duplicate Label names without replacing saved data", async () => {
  await page.goto(`${baseUrl}/labels`);
  const name = `${marker} unique name`;
  const original = await createLabel(name);
  const before = (await api("/labels")).data.length;
  await page.getByRole("button", { name: "Add label", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a label" });
  const input = dialog.getByRole("textbox", { name: "Name", exact: true });
  await dialog.getByRole("button", { name: "Add label", exact: true }).click();
  assert.equal(await input.evaluate((element) => element.validity.valueMissing), true);
  assert.equal((await api("/labels")).data.length, before);
  await input.fill("   ");
  await dialog.getByRole("button", { name: "Add label", exact: true }).click();
  await dialog.getByRole("alert").getByText("Enter a name.", { exact: true }).waitFor();
  assert.equal((await api("/labels")).data.length, before);
  await input.fill(name);
  const duplicate = page.waitForResponse((result) => new URL(result.url()).pathname === "/api/v1/labels" && result.request().method() === "POST");
  await dialog.getByRole("button", { name: "Add label", exact: true }).click();
  assert.ok((await duplicate).status() >= 400);
  await dialog.getByRole("alert").getByText("Could not create this label. Names must be unique.", { exact: true }).waitFor();
  const labels = (await api("/labels")).data;
  assert.equal(labels.length, before);
  assert.deepEqual(labels.find((label) => label.id === original.id), original);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

it("searches Labels and restores the filtered URL after reload", async () => {
  await page.goto(`${baseUrl}/labels`);
  await page.getByRole("heading", { name: "Your labels" }).waitFor();
  const initialCount = await page.locator(".label-row").count();
  const matchingName = `${marker} search target`;
  const otherName = `${marker} unrelated label`;
  await createLabel(matchingName);
  await createLabel(otherName);
  const search = page.getByRole("searchbox", { name: "Search labels" });
  await search.fill("search target");
  await page.getByRole("button", { name: `Edit ${matchingName}`, exact: true }).waitFor();
  assert.equal(await page.locator(".label-row").count(), 1);
  assert.equal(new URL(page.url()).searchParams.get("q"), "search target");
  await search.fill("no matching label");
  await page.getByText("No labels match your search.", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("q"), "no matching label");

  await search.fill("search target");
  await page.reload();
  await page.getByRole("searchbox", { name: "Search labels" }).waitFor();
  await page.getByRole("button", { name: `Edit ${matchingName}`, exact: true }).waitFor();
  assert.equal(await page.getByRole("searchbox", { name: "Search labels" }).inputValue(), "search target");
  assert.equal(await page.locator(".label-row").count(), 1);
  assert.equal(await page.getByRole("button", { name: `Edit ${matchingName}`, exact: true }).count(), 1);
  await page.getByRole("searchbox", { name: "Search labels" }).fill("");
  assert.equal(new URL(page.url()).searchParams.has("q"), false);
  assert.equal(await page.locator(".label-row").count(), initialCount + 2);
});

it("opens Label history, follows related records, and preserves list context", async () => {
  await page.goto(`${baseUrl}/labels`);
  const labelName = `${marker} history label`;
  const relatedName = `${marker} related label`;
  const historyLabel = await createLabel(labelName);
  const relatedLabel = await createLabel(relatedName);
  const body = `${marker} history Log`;
  const createdLog = await api("/logs", "POST", { body, occurredAt: new Date().toISOString() });
  assert.equal(createdLog.status, 201);
  assert.equal((await api(`/logs/${createdLog.data.id}/labels`, "PUT", { labelIds: [historyLabel.id, relatedLabel.id] })).status, 200);

  await page.goto(`${baseUrl}/labels`);
  const search = page.getByRole("searchbox", { name: "Search labels" });
  await search.fill("history label");
  await page.getByRole("button", { name: `Show history of ${labelName}`, exact: true }).click();
  const dialog = page.locator(".label-history-dialog");
  await dialog.getByRole("heading", { name: labelName, exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, `/labels/${historyLabel.id}`);
  assert.equal(new URL(page.url()).searchParams.get("q"), "history label");
  assert.equal(await dialog.locator('[data-test="total-uses"] dd').innerText(), "1");
  assert.match(await dialog.locator(".history-kinds").innerText(), /1 log/);
  await dialog.locator(".history-timeline table").waitFor();
  await dialog.locator(".history-hours table").waitFor();
  await dialog.getByRole("button", { name: new RegExp(`Show history of ${relatedName}`) }).click();
  await dialog.getByRole("heading", { name: relatedName, exact: true }).waitFor();
  await dialog.getByRole("button", { name: `Back to ${labelName}`, exact: true }).click();
  await dialog.getByRole("heading", { name: labelName, exact: true }).waitFor();

  const relatedRecords = dialog.locator(".history-records");
  await relatedRecords.getByRole("link", { name: body, exact: true }).waitFor();
  await relatedRecords.getByRole("link", { name: body, exact: true }).click();
  await page.getByRole("dialog").getByText(body, { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, `/logs/${createdLog.data.id}`);
  await page.goBack();
  await page.locator(".label-history-dialog").getByRole("heading", { name: labelName, exact: true }).waitFor();
  await page.getByRole("button", { name: "Close history", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/labels" && url.searchParams.get("q") === "history label");
  await page.getByRole("button", { name: `Show history of ${labelName}`, exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/labels");
  assert.equal(new URL(page.url()).searchParams.get("q"), "history label");
  assert.equal(await page.locator(".label-row").count(), 1);

  const unusedName = `${marker} unused history`;
  await page.getByRole("searchbox", { name: "Search labels" }).fill("");
  await createLabel(unusedName);
  await page.getByRole("searchbox", { name: "Search labels" }).fill("unused history");
  await page.getByRole("button", { name: `Show history of ${unusedName}`, exact: true }).click();
  await page.locator(".label-history-dialog").getByText(/Not used yet\./).waitFor();
});

it("persists unused scope changes and preserves assigned scopes when edits or removal are cancelled", async () => {
  await page.goto(`${baseUrl}/labels`);
  const name = `${marker} assignment preservation`;
  const original = await createLabel(name);
  assert.ok(original.scopes.includes("NOTE") && original.scopes.includes("LOG"));
  const openEdit = async () => {
    await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
    return page.getByRole("dialog", { name: `Edit ${name}`, exact: true });
  };
  let edit = await openEdit();
  // The UI's checked "Don't show in" options remove an API availability scope.
  await edit.getByRole("checkbox", { name: "Notes", exact: true }).check();
  const updated = page.waitForResponse((result) => new URL(result.url()).pathname === `/api/v1/labels/${original.id}` && result.request().method() === "PUT");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  assert.equal((await updated).status(), 200);
  await edit.waitFor({ state: "detached" });
  await page.reload();
  const saved = (await api("/labels")).data.find((label) => label.id === original.id);
  assert.equal(saved.scopes.includes("NOTE"), false);
  edit = await openEdit();
  assert.equal(await edit.getByRole("checkbox", { name: "Notes", exact: true }).isChecked(), true);
  await edit.getByRole("textbox", { name: "Name", exact: true }).fill(`${marker} cancelled name`);
  await edit.getByRole("checkbox", { name: "Logs", exact: true }).check();
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  assert.deepEqual((await api("/labels")).data.find((label) => label.id === original.id), saved);

  const log = await api("/logs", "POST", { body: `${marker} assigned Log`, occurredAt: new Date().toISOString() });
  assert.equal(log.status, 201);
  assert.equal((await api(`/logs/${log.data.id}/labels`, "PUT", { labelIds: [original.id] })).status, 200);
  edit = await openEdit();
  await edit.getByRole("checkbox", { name: "Logs", exact: true }).check();
  const conflict = page.waitForResponse((result) => new URL(result.url()).pathname === `/api/v1/labels/${original.id}` && result.request().method() === "PUT");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  assert.ok((await conflict).status() >= 400);
  await edit.getByRole("alert").getByText("Could not save this label. Remove assignments before removing a scope.", { exact: true }).waitFor();
  assert.deepEqual((await api("/labels")).data.find((label) => label.id === original.id), saved);
  assert.deepEqual((await api(`/logs/${log.data.id}`)).data.labelIds, [original.id]);
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
  await page.getByRole("dialog", { name: `Remove “${name}”?`, exact: true }).getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("alert").getByText("Remove assignments before removing this label.", { exact: true }).waitFor();
  await page.reload();
  assert.deepEqual((await api("/labels")).data.find((label) => label.id === original.id), saved);
  const retained = (await api(`/logs/${log.data.id}`)).data;
  assert.equal(retained.body, log.data.body);
  assert.deepEqual(retained.labelIds, [original.id]);
});
