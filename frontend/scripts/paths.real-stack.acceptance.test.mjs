import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.PATHS_E2E_BASE_URL;
const email = process.env.PATHS_E2E_EMAIL;
const password = process.env.PATHS_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("PATHS_E2E_BASE_URL, PATHS_E2E_EMAIL, and PATHS_E2E_PASSWORD are required");

const marker = `PathsJourney-${Date.now()}`;
let browser;
let page;

async function api(path, method = "GET", body) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }, { path, method, body });
}

async function createPath(name) {
  await page.getByRole("button", { name: "Add path" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a path" });
  await dialog.getByRole("textbox", { name: "New path name" }).fill(name);
  await dialog.getByRole("button", { name: "Add path", exact: true }).click();
  const article = page.locator("article.path").filter({ hasText: name });
  await article.getByRole("heading", { name, exact: true }).waitFor();
  await page.reload();
  const reloadedArticle = page.locator("article.path").filter({ hasText: name });
  await reloadedArticle.getByRole("heading", { name, exact: true }).waitFor();
  const record = (await api("/paths")).data.find((path) => path.name === name);
  assert.ok(record, `created Path ${name} is returned by a fresh API read after page reload`);
  return { article: reloadedArticle, record };
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

it("creates, edits, removes, restores, and reloads a Path with persisted API state", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Your paths" }).waitFor();
  await page.getByRole("button", { name: "Add path" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a path" });
  const initialName = `${marker} original`;
  const initialDescription = `${marker} description`;
  await dialog.getByRole("textbox", { name: "New path name" }).fill(initialName);
  await dialog.getByRole("textbox", { name: "Path description" }).fill(initialDescription);
  await dialog.getByRole("button", { name: "Choose path color: Near Black (#0F172A)" }).click();
  await dialog.getByRole("radio", { name: "Custom" }).check();
  await dialog.getByLabel("Custom path text color").evaluate((element) => {
    const input = element;
    input.value = "#FFFFFF";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await dialog.getByRole("button", { name: "Add path", exact: true }).click();

  const initialCard = page.locator("article.path").filter({ hasText: initialName });
  await initialCard.getByRole("heading", { name: initialName }).waitFor();
  const initialSaved = (await api("/paths")).data.find((path) => path.name === initialName);
  assert.equal(initialSaved.description, initialDescription);
  assert.equal(initialSaved.color, "#0F172A");
  assert.equal(initialSaved.textColor, "#FFFFFF");
  const boardCardTitle = `${marker} restored board card`;
  const boardCard = await api(`/boards/${initialSaved.boardId}/cards`, "POST", {
    title: boardCardTitle,
    body: "{}",
    priority: "MEDIUM",
    pathIds: [],
    labelIds: [],
  });
  assert.equal(boardCard.status, 201);
  assert.equal(await initialCard.locator(".dot").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(15, 23, 42)");
  assert.equal(await initialCard.locator(".path-body > p").innerText(), initialDescription);
  await page.goto(`${baseUrl}/timeline`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const timelinePath = page.getByRole("combobox", { name: "Path" });
  await timelinePath.waitFor();
  await timelinePath.locator(`option[value="${initialSaved.id}"]`).waitFor({ state: "attached" });
  assert.equal(await timelinePath.locator(`option[value="${initialSaved.id}"]`).count(), 1, "the new Path is available in the Timeline path filter");
  await timelinePath.selectOption(initialSaved.id);
  assert.equal(await timelinePath.inputValue(), initialSaved.id);
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });

  await initialCard.getByRole("button", { name: "Edit", exact: true }).click();
  const editedName = `${marker} edited`;
  const editedDescription = `${marker} edited description`;
  await page.getByRole("textbox", { name: "Edit path name" }).fill(editedName);
  await page.getByRole("textbox", { name: "Edit path description" }).fill(editedDescription);
  await page.getByRole("button", { name: "Save path", exact: true }).click();
  const editedCard = page.locator("article.path").filter({ hasText: editedName });
  await editedCard.getByRole("heading", { name: editedName }).waitFor();
  const editedPaths = await api("/paths");
  assert.equal(editedPaths.status, 200);
  const editedRecord = editedPaths.data.find((path) => path.name === editedName);
  assert.equal(editedRecord.description, editedDescription);
  assert.equal(editedRecord.color, "#0F172A");
  assert.equal(editedRecord.textColor, "#FFFFFF");
  await page.reload();
  const reloadedCard = page.locator("article.path").filter({ hasText: editedName });
  await reloadedCard.getByRole("heading", { name: editedName }).waitFor();
  assert.equal(await reloadedCard.locator(".dot").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(15, 23, 42)");
  assert.equal(await reloadedCard.locator(".path-body > p").innerText(), editedDescription);
  await reloadedCard.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Choose edit path color" }).click();
  const selectedColor = page.getByRole("button", { name: "Set edit path color: Near Black (#0F172A)" });
  assert.equal(await selectedColor.getAttribute("aria-pressed"), "true", "the selected color has an accessible pressed-state cue");
  const contrast = page.locator(".path-text-color-contrast");
  assert.ok(!(await contrast.innerText()).includes("Low"), "the custom text color meets contrast in light theme");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.ok(!(await contrast.innerText()).includes("Low"), "the same explicit foreground and background remain legible in dark theme");
  await page.locator("form.path-edit").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");

  await page.locator("article.path").filter({ hasText: editedName }).getByRole("button", { name: "Remove", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: `Remove ${editedName}? You can undo this for a few seconds.` });
  await confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
  const undoStatus = page.getByRole("status").filter({ hasText: `Removed “${editedName}”.` });
  await undoStatus.getByRole("button", { name: "Undo", exact: true }).waitFor();
  assert.equal((await api("/paths")).data.some((path) => path.name === editedName), false);

  await undoStatus.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("heading", { name: editedName }).waitFor();
  await page.reload();
  await page.locator("article.path").filter({ hasText: editedName }).getByRole("heading", { name: editedName }).waitFor();
  const restored = await api("/paths");
  assert.equal(restored.status, 200);
  const restoredPath = restored.data.find((path) => path.name === editedName);
  assert.equal(restoredPath.description, editedDescription);
  assert.equal(restoredPath.boardId, initialSaved.boardId, "Undo restores the Path's board association");
  const restoredBoardCard = await api(`/boards/${initialSaved.boardId}/cards/${boardCard.data.id}`);
  assert.equal(restoredBoardCard.status, 200);
  assert.equal(restoredBoardCard.data.title, boardCardTitle, "the associated board card remains available after Undo and reload");
});

it("rejects whitespace and duplicate Path names without changing saved data", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const name = `${marker} unique validation path`;
  const { record: original } = await createPath(name);

  await page.getByRole("button", { name: "Add path" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a path" });
  const nameField = dialog.getByRole("textbox", { name: "New path name" });
  await nameField.fill("   ");
  await dialog.getByRole("button", { name: "Add path", exact: true }).click();
  await dialog.getByRole("alert").getByText("Enter a path name.", { exact: true }).waitFor();
  assert.equal((await api("/paths")).data.some((path) => !path.name.trim()), false, "whitespace input creates no Path");

  await nameField.fill(name);
  await dialog.getByRole("textbox", { name: "Path description" }).fill("Replacement description must not be saved");
  await dialog.getByRole("button", { name: "Add path", exact: true }).click();
  await dialog.getByRole("alert").getByText("Could not create path.", { exact: true }).waitFor();
  const paths = await api("/paths");
  assert.equal(paths.data.filter((path) => path.name === name).length, 1, "duplicate submission leaves exactly one Path");
  assert.deepEqual(paths.data.find((path) => path.id === original.id), original, "duplicate submission does not replace existing Path data");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

it("cancels a Path edit cleanly and retries a failed edit without losing the draft", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const name = `${marker} edit recovery`;
  const { article, record } = await createPath(name);
  await article.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Edit path name" }).fill(`${name} canceled`);
  await page.getByRole("textbox", { name: "Edit path description" }).fill("Canceled description");
  await page.locator("form.path-edit").getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal((await api(`/paths/${record.id}`)).data.name, name, "cancel leaves the persisted Path unchanged");

  const articleAgain = page.locator("article.path").filter({ hasText: name });
  await articleAgain.getByRole("button", { name: "Edit", exact: true }).click();
  const draftName = `${name} recovered`;
  const draftDescription = `${marker} recovered description`;
  await page.getByRole("textbox", { name: "Edit path name" }).fill(draftName);
  await page.getByRole("textbox", { name: "Edit path description" }).fill(draftDescription);
  let failedWrites = 0;
  await page.route(`**/api/v1/paths/${record.id}`, async (route) => {
    if (route.request().method() === "PUT" && failedWrites === 0) {
      failedWrites += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "simulated Path save outage" }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Save path", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Could not update path." }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Edit path name" }).inputValue(), draftName);
  assert.equal(await page.getByRole("textbox", { name: "Edit path description" }).inputValue(), draftDescription);
  assert.equal((await api(`/paths/${record.id}`)).data.name, name, "the failed save leaves the original server value intact");

  const retryResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/v1/paths/${record.id}` && response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save path", exact: true }).click();
  assert.equal((await retryResponse).status(), 200);
  await page.unroute(`**/api/v1/paths/${record.id}`);
  await page.locator("article.path").filter({ hasText: draftName }).getByRole("heading", { name: draftName }).waitFor();
  const recovered = await api(`/paths/${record.id}`);
  assert.equal(recovered.data.name, draftName);
  assert.equal(recovered.data.description, draftDescription);
  await page.reload();
  const reloadedRecovered = page.locator("article.path").filter({ hasText: draftName });
  await reloadedRecovered.getByRole("heading", { name: draftName, exact: true }).waitFor();
  await reloadedRecovered.getByText(draftDescription, { exact: true }).waitFor();
});

it("pins and unpins a Path with persisted pressed state", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const name = `${marker} pinned`;
  const { article, record } = await createPath(name);
  const pin = article.getByRole("button", { name: `Pin ${name}`, exact: true });
  assert.equal(await pin.getAttribute("aria-pressed"), "false");
  await pin.click();
  const unpin = article.getByRole("button", { name: `Unpin ${name}`, exact: true });
  await unpin.waitFor();
  assert.equal((await api("/paths")).data.find((path) => path.id === record.id).pinned, true);

  await page.reload();
  const pinnedArticle = page.locator("article.path").filter({ hasText: name });
  const persistedUnpin = pinnedArticle.getByRole("button", { name: `Unpin ${name}`, exact: true });
  await persistedUnpin.waitFor();
  assert.equal(await persistedUnpin.getAttribute("aria-pressed"), "true");
  await persistedUnpin.click();
  const persistedPin = pinnedArticle.getByRole("button", { name: `Pin ${name}`, exact: true });
  await persistedPin.waitFor();
  const persisted = (await api("/paths")).data.find((path) => path.id === record.id);
  assert.equal(persisted.pinned, false);
  await page.reload();
  await page.locator("article.path").filter({ hasText: name }).getByRole("button", { name: `Pin ${name}`, exact: true }).waitFor();
});

it("explains removal, preserves cancellation, and expires the Path undo action", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const name = `${marker} undo expiry`;
  const { article, record } = await createPath(name);
  await article.getByRole("button", { name: "Remove", exact: true }).click();
  let confirmation = page.getByRole("dialog", { name: `Remove ${name}? You can undo this for a few seconds.` });
  await confirmation.waitFor();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.ok((await api("/paths")).data.some((path) => path.id === record.id), "cancel keeps the Path active");
  assert.equal(await page.getByRole("status").filter({ hasText: `Removed “${name}”.` }).count(), 0);

  const articleAgain = page.locator("article.path").filter({ hasText: name });
  await articleAgain.getByRole("button", { name: "Remove", exact: true }).click();
  confirmation = page.getByRole("dialog", { name: `Remove ${name}? You can undo this for a few seconds.` });
  await confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
  await articleAgain.waitFor({ state: "detached" });
  const undoStatus = page.getByRole("status").filter({ hasText: `Removed “${name}”.` });
  await undoStatus.getByRole("button", { name: "Undo", exact: true }).waitFor();
  assert.equal((await api("/paths")).data.some((path) => path.id === record.id), false);
  await undoStatus.waitFor({ state: "detached", timeout: 12000 });
  assert.equal(await page.getByRole("button", { name: "Undo", exact: true }).count(), 0, "the expired action no longer offers recovery");
  assert.equal((await api(`/paths/${record.id}`)).status, 404, "the removed Path remains deleted after the undo window expires");
  await page.reload();
  await page.locator("article.path").filter({ hasText: name }).waitFor({ state: "detached" });
});

it("confirms Path board hiding, preserves cancellation, and shows the board again with its cards", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const name = `${marker} board visibility`;
  const { article, record } = await createPath(name);
  const cardTitle = `${marker} retained board card`;
  const statuses = await api(`/boards/${record.boardId}/statuses`);
  assert.equal(statuses.status, 200);
  const createdCard = await api(`/boards/${record.boardId}/cards`, "POST", {
    title: cardTitle,
    body: "{}",
    priority: "MEDIUM",
    pathIds: [],
    labelIds: [],
  });
  assert.equal(createdCard.status, 201);

  await article.getByRole("button", { name: "Edit", exact: true }).click();
  const visibility = page.getByRole("switch", { name: "Show on board" });
  await visibility.click();
  const hidePrompt = page.getByRole("dialog");
  await hidePrompt.getByText(`Hide the “${name}” board?`).waitFor();
  await hidePrompt.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await visibility.isChecked(), true);
  assert.equal((await api("/paths")).data.find((path) => path.id === record.id).boardHidden, false);

  await visibility.click();
  const confirmHide = page.getByRole("dialog");
  await confirmHide.getByText(`Hide the “${name}” board?`).waitFor();
  await confirmHide.getByRole("button", { name: "Hide board" }).click();
  await page.getByRole("status").filter({ hasText: `${name} board is hidden.` }).waitFor();
  assert.equal((await api("/paths")).data.find((path) => path.id === record.id).boardHidden, true);

  await page.reload();
  const hiddenPath = page.locator("article.path").filter({ hasText: name });
  await hiddenPath.getByRole("button", { name: "Edit", exact: true }).click();
  const show = page.getByRole("switch", { name: "Show on board" });
  assert.equal(await show.isChecked(), false);
  await show.click();
  await page.getByRole("status").filter({ hasText: `${name} board is shown.` }).waitFor();
  await page.reload();
  const shown = (await api("/paths")).data.find((path) => path.id === record.id);
  assert.equal(shown.boardHidden, false);
  const retainedCard = await api(`/boards/${record.boardId}/cards/${createdCard.data.id}`);
  assert.equal(retainedCard.status, 200);
  assert.equal(retainedCard.data.title, cardTitle);
});

it("cancels then confirms a Path merge and keeps its session on the target after reload", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const targetName = `${marker} merge target`;
  const sourceName = `${marker} merge source`;
  const { record: target } = await createPath(targetName);
  const { record: source } = await createPath(sourceName);
  const startedAt = new Date(Date.now() - 3_600_000).toISOString();
  const endedAt = new Date(Date.now() - 1_800_000).toISOString();
  const session = await api("/time-entries", "POST", {
    pathId: source.id,
    labelIds: [],
    startedAt,
    endedAt,
    description: `${marker} merge session`,
  });
  assert.ok(session.status >= 200 && session.status < 300);

  const openMergeDialog = async () => {
    const sourceArticle = page.locator("article.path").filter({ hasText: sourceName });
    const editButton = sourceArticle.getByRole("button", { name: "Edit", exact: true });
    if (await editButton.count()) await editButton.click();
    await page.getByRole("button", { name: "Merge", exact: true }).click();
    const mergeDialog = page.getByRole("dialog", { name: `Merge “${sourceName}” into…` });
    await mergeDialog.waitFor();
    assert.equal(await mergeDialog.locator(`input[name="merge-target-path"][value="${source.id}"]`).count(), 0);
    return mergeDialog;
  };

  let mergeDialog = await openMergeDialog();
  await mergeDialog.locator(`input[name="merge-target-path"][value="${target.id}"]`).check();
  await mergeDialog.getByRole("button", { name: "Cancel" }).click();
  assert.ok((await api("/paths")).data.some((path) => path.id === source.id));
  assert.equal((await api(`/time-entries/${session.data.id}`)).data.pathId, source.id);

  mergeDialog = await openMergeDialog();
  await mergeDialog.locator(`input[name="merge-target-path"][value="${target.id}"]`).check();
  await mergeDialog.getByRole("button", { name: "OK", exact: true }).click();
  const confirmation = page.getByRole("dialog");
  await confirmation.getByText(`Merge ${sourceName} into ${targetName}?`).waitFor();
  const mergeResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/v1/paths/${source.id}/merge`,
  );
  await confirmation.getByRole("button", { name: "Confirm" }).click();
  const mergeResponse = await mergeResponsePromise;
  assert.equal(mergeResponse.status(), 204);

  await page.locator("article.path").filter({ hasText: sourceName }).waitFor({ state: "detached" });
  let paths = (await api("/paths")).data;
  assert.equal(paths.some((path) => path.id === source.id), false, JSON.stringify(paths.find((path) => path.id === source.id)));
  assert.ok(paths.some((path) => path.id === target.id));
  assert.equal((await api(`/time-entries/${session.data.id}`)).data.pathId, target.id);

  await page.reload();
  const targetArticle = page.locator("article.path").filter({ hasText: targetName });
  await targetArticle.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("dialog", { name: targetName });
  await history.getByText(`${marker} merge session`).waitFor();
  paths = (await api("/paths")).data;
  assert.ok(paths.some((path) => path.id === target.id));
});

it("rejects Path merges into self or a missing target without changing the source", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const sourceName = `${marker} invalid merge source`;
  const { record: source } = await createPath(sourceName);
  const article = page.locator("article.path").filter({ hasText: sourceName });
  await article.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  const mergeDialog = page.getByRole("dialog", { name: `Merge “${sourceName}” into…` });
  await mergeDialog.waitFor();
  assert.equal(await mergeDialog.locator(`input[name="merge-target-path"][value="${source.id}"]`).count(), 0);
  await mergeDialog.getByRole("button", { name: "Cancel" }).click();

  const selfMerge = await api(`/paths/${source.id}/merge`, "POST", { targetPathId: source.id });
  assert.ok(selfMerge.status >= 400 && selfMerge.status < 500);
  const missingTarget = await api(`/paths/${source.id}/merge`, "POST", { targetPathId: "00000000-0000-0000-0000-000000000001" });
  assert.ok(missingTarget.status >= 400 && missingTarget.status < 500);
  assert.ok((await api("/paths")).data.some((path) => path.id === source.id));
});

it("opens an owned Path history directly and keeps missing or foreign Path IDs private", async () => {
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const name = `${marker} direct history`;
  const { record } = await createPath(name);
  const sessionDescription = `${marker} owned history session`;
  const session = await api("/time-entries", "POST", {
    pathId: record.id,
    labelIds: [],
    startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    endedAt: new Date(Date.now() - 1_800_000).toISOString(),
    description: sessionDescription,
  });
  assert.ok(session.status >= 200 && session.status < 300);

  await page.goto(`${baseUrl}/paths/${record.id}`, { waitUntil: "domcontentloaded" });
  const history = page.getByRole("dialog", { name });
  await history.getByText(sessionDescription).waitFor();
  await history.getByRole("button", { name: "Edit session", exact: true }).click();
  const sessionEditor = page.getByRole("dialog", { name: "Edit session" });
  await sessionEditor.waitFor();
  assert.equal(
    await sessionEditor.getByRole("textbox", { name: "Edit session description" }).inputValue(),
    sessionDescription,
    "the Path history action opens the matching owned session",
  );
  assert.equal(
    await sessionEditor.getByRole("combobox", { name: "Edit session path" }).inputValue(),
    record.id,
    "the selected session belongs to the Path whose history is open",
  );
  await sessionEditor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goBack();
  await page.waitForURL(/\/paths$/);
  assert.equal(await page.getByRole("dialog", { name }).count(), 0, "browser Back returns to the usable Path list");

  await page.goto(`${baseUrl}/paths/00000000-0000-0000-0000-000000000001`, { waitUntil: "domcontentloaded" });
  await page.getByRole("alert").filter({ hasText: "That path doesn’t exist any more." }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0, "a missing Path ID opens no history dialog");

  const foreignContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
  try {
    const foreignPage = await foreignContext.newPage();
    foreignPage.setDefaultTimeout(10000);
    await foreignPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await foreignPage.getByRole("button", { name: /New here\? Create an account/ }).click();
    const foreignEmail = `paths-foreign-${Date.now()}@example.com`;
    await foreignPage.getByRole("textbox", { name: "Email" }).fill(foreignEmail);
    await foreignPage.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await foreignPage.getByRole("textbox", { name: "Confirm password" }).fill(password);
    await foreignPage.getByRole("button", { name: "Create account", exact: true }).click();
    const foreignToken = await foreignPage.waitForFunction(() => localStorage.getItem("know_token"));
    const foreignName = `${marker} private foreign Path`;
    const foreign = await foreignPage.evaluate(async ({ token, name }) => {
      const response = await fetch("/api/v1/paths", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return { status: response.status, data: await response.json() };
    }, { token: await foreignToken.jsonValue(), name: foreignName });
    assert.equal(foreign.status, 201);
    await page.goto(`${baseUrl}/paths/${foreign.data.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("alert").filter({ hasText: "That path doesn’t exist any more." }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.ok(!(await page.locator("body").innerText()).includes(foreignName), "a foreign Path name is not disclosed");
  } finally {
    await foreignContext.close();
  }
});
