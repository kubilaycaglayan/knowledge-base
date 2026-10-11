import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.NOTES_E2E_BASE_URL;
const email = process.env.NOTES_E2E_EMAIL;
const password = process.env.NOTES_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("NOTES_E2E_BASE_URL, NOTES_E2E_EMAIL, and NOTES_E2E_PASSWORD are required");

const marker = `NotesJourney-${Date.now()}`;
let browser;
let page;
let noteId;

async function api(path, method = "GET", body) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data };
  }, { path, method, body });
}

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
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
  await api("/notes", "POST", {
    title: `${marker} retained active note`,
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Active archive-navigation fixture" }] }] }),
    contentText: "Active archive-navigation fixture",
    tags: [],
  });
});

after(async () => browser?.close());

it("creates, edits, deep-links, archives, restores, and reloads a note with persisted API state", async () => {
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await page.waitForURL(/\/notes$/);
  await page.getByText("Active archive-navigation fixture", { exact: true }).waitFor();
  await page.goto(`${baseUrl}/notes`, { waitUntil: "domcontentloaded", timeout: 30000 });
  let releaseNoteRead;
  let signalNoteRead;
  let noteReadBlocked = false;
  let archiveFailureSent = false;
  let gateNextNoteSave = false;
  let noteSaveBody;
  let releaseFirstNoteSave;
  let signalFirstNoteSave;
  const noteReadStarted = new Promise((resolve) => { signalNoteRead = resolve; });
  const noteReadGate = new Promise((resolve) => { releaseNoteRead = resolve; });
  const firstNoteSaveStarted = new Promise((resolve) => { signalFirstNoteSave = resolve; });
  const firstNoteSaveGate = new Promise((resolve) => { releaseFirstNoteSave = resolve; });
  await page.route("**/api/v1/notes/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === "PUT" && pathname === `/api/v1/notes/${noteId}` && gateNextNoteSave) {
      gateNextNoteSave = false;
      noteSaveBody = JSON.parse(route.request().postData() || "{}");
      signalFirstNoteSave();
      await firstNoteSaveGate;
    }
    if (route.request().method() === "DELETE" && pathname === `/api/v1/notes/${noteId}` && !archiveFailureSent) {
      archiveFailureSent = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "simulated archive outage" }) });
      return;
    }
    if (route.request().method() === "GET" && !noteReadBlocked) {
      noteReadBlocked = true;
      signalNoteRead();
      await noteReadGate;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Create new note" }).click();
  await page.waitForURL(/\/notes\/[^/]+$/);
  noteId = new URL(page.url()).pathname.split("/").at(-1);
  await noteReadStarted;
  const titleField = page.getByRole("textbox", { name: "Note title" });
  assert.equal(await titleField.isDisabled(), true, "the note title stays unavailable until its saved value has loaded");
  await page.getByRole("status").filter({ hasText: "Loading…" }).waitFor();
  releaseNoteRead();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);

  const title = `${marker} ${"Readable long title ".repeat(9)}`.trim();
  const bodyParagraphs = [
    `${marker} first paragraph ${"Readable note content ".repeat(18)}`,
    `${marker} second paragraph ${"Additional note content ".repeat(18)}`,
  ];
  const body = bodyParagraphs.join("\n");
  await titleField.fill(title);
  assert.equal(await titleField.inputValue(), title, "the long title remains within the editor limit");
  await page.waitForFunction(async ({ id, expectedTitle }) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return response.ok && (await response.json()).title === expectedTitle;
  }, { id: noteId, expectedTitle: title });
  assert.equal(await titleField.inputValue(), title, "the editor retains the persisted title before the body edit");
  await page.getByRole("textbox", { name: "Note content" }).fill(body);
  assert.equal(await titleField.inputValue(), title, "editing the body must retain the title in the editor");
  await page.waitForFunction(async ({ id, expectedTitle, expectedBody }) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    if (!response.ok) return false;
    const note = await response.json();
    return note.title === expectedTitle && (note.contentText || "").includes(expectedBody);
  }, { id: noteId, expectedTitle: title, expectedBody: body });
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();

  const saved = await api(`/notes/${noteId}`);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.title, title, JSON.stringify(saved.data));
  assert.ok(saved.data.contentText.includes(body), JSON.stringify(saved.data));
  const noteLayout = await page.evaluate(() => {
    const titleRow = document.querySelector(".note-title-row");
    const editor = document.querySelector(".rich-editor");
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      titleRowWidth: titleRow?.scrollWidth ?? 0,
      titleRowClientWidth: titleRow?.clientWidth ?? 0,
      editorWidth: editor?.scrollWidth ?? 0,
      editorClientWidth: editor?.clientWidth ?? 0,
      paragraphs: document.querySelectorAll(".rich-editor .ProseMirror > p").length,
    };
  });
  assert.ok(noteLayout.documentWidth <= noteLayout.viewportWidth, JSON.stringify(noteLayout));
  assert.ok(noteLayout.titleRowWidth <= noteLayout.titleRowClientWidth, JSON.stringify(noteLayout));
  assert.ok(noteLayout.editorWidth <= noteLayout.editorClientWidth, JSON.stringify(noteLayout));
  assert.ok(noteLayout.paragraphs >= 2, "multi-paragraph content remains separate and readable");

  const pendingTitle = `${marker} first pending title`;
  const latestTitle = `${marker} latest typed title`;
  gateNextNoteSave = true;
  await titleField.fill(pendingTitle);
  await firstNoteSaveStarted;
  assert.equal(noteSaveBody.title, pendingTitle, "the blocked request captures the first pending edit");
  await titleField.fill(latestTitle);
  await page.waitForTimeout(800);
  releaseFirstNoteSave();
  await page.waitForFunction(async ({ id, expectedTitle }) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return response.ok && (await response.json()).title === expectedTitle;
  }, { id: noteId, expectedTitle: latestTitle });
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  const latestSaved = await api(`/notes/${noteId}`);
  assert.equal(latestSaved.data.title, latestTitle, "a newer edit typed during the pending save reaches persisted state");

  const routeSaveTitle = `${marker} title saved on navigation`;
  await titleField.fill(routeSaveTitle);
  const routeSaveResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/v1/notes/${noteId}` && response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Back to notes" }).click();
  const routeSave = await routeSaveResponse;
  assert.equal(routeSave.status(), 200);
  await page.getByRole("link", { name: `Open ${routeSaveTitle}` }).waitFor();
  const routeSaved = await api(`/notes/${noteId}`);
  assert.equal(routeSaved.data.title, routeSaveTitle, "leaving the editor preserves the pending change");
  await page.reload();
  const reloadedTitleLink = page.getByRole("link", { name: `Open ${routeSaveTitle}` });
  await reloadedTitleLink.waitFor();
  assert.equal(await reloadedTitleLink.count(), 1, "the saved note appears once after Notes reload");

  const retainedLabelName = `${marker} restore label`;
  const retainedLabel = await api("/labels", "POST", { name: retainedLabelName, color: null, scopes: ["NOTE"] });
  assert.equal(retainedLabel.status, 201);
  await page.goto(`${baseUrl}/notes/${noteId}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((expectedTitle) => document.querySelector('[aria-label="Note title"]')?.value === expectedTitle, routeSaveTitle);
  await page.waitForFunction((expectedParagraphs) => {
    const content = document.querySelector('[aria-label="Note content"]')?.innerText || "";
    return expectedParagraphs.every((paragraph) => content.includes(paragraph));
  }, bodyParagraphs.map((paragraph) => paragraph.trim()));
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), routeSaveTitle);
  const reopenedBody = await page.getByRole("textbox", { name: "Note content" }).innerText();
  assert.ok(bodyParagraphs.every((paragraph) => reopenedBody.includes(paragraph.trim())));
  const deepLinked = await api(`/notes/${noteId}`);
  assert.equal(deepLinked.status, 200);
  assert.equal(deepLinked.data.title, routeSaveTitle);
  assert.ok(deepLinked.data.contentText.includes(body));
  await page.getByRole("button", { name: "Open label picker" }).click();
  await page.getByRole("combobox", { name: "Note labels" }).fill(retainedLabelName);
  await page.getByRole("option").filter({ hasText: retainedLabelName }).click();
  await page.waitForFunction(async ({ id, name }) => {
    const response = await fetch(`/api/v1/notes/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return response.ok && (await response.json()).tags.includes(name);
  }, { id: noteId, name: retainedLabelName });
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  await page.getByRole("button", { name: "Back to notes" }).click();

  let archiveConfirmation;
  page.once("dialog", async (dialog) => {
    archiveConfirmation = dialog.message();
    await dialog.accept();
  });
  await page.locator(".note-row").filter({ hasText: routeSaveTitle }).getByRole("button", { name: "Archive" }).click();
  assert.equal(archiveConfirmation, `Move “${routeSaveTitle}” to Archive? You can restore it from the archive at any time.`);
  await page.getByRole("alert").filter({ hasText: "Unable to archive note." }).waitFor();
  assert.equal(await page.locator(".note-row").filter({ hasText: routeSaveTitle }).count(), 1, "archive failure keeps the exact note visible for recovery");
  const afterArchiveFailure = await api("/notes?page=0&size=100");
  const failedArchiveItems = Array.isArray(afterArchiveFailure.data) ? afterArchiveFailure.data : afterArchiveFailure.data.items;
  assert.ok(failedArchiveItems.some((item) => item.id === noteId && item.title === routeSaveTitle), "fresh API read confirms the failed archive did not change persisted state");

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".note-row").filter({ hasText: routeSaveTitle }).getByRole("button", { name: "Archive" }).click();
  await page.getByRole("link", { name: `Open ${routeSaveTitle}` }).waitFor({ state: "detached" });
  const afterArchive = await api("/notes?page=0&size=100");
  const activeItems = Array.isArray(afterArchive.data) ? afterArchive.data : afterArchive.data.items;
  assert.ok(!activeItems.some((item) => item.id === noteId), "fresh active collection read confirms the note is absent after archive");
  const archivedRead = await api("/notes?page=0&size=100&archived=true");
  const archivedItems = Array.isArray(archivedRead.data) ? archivedRead.data : archivedRead.data.items;
  assert.ok(archivedItems.some((item) => item.id === noteId && item.title === routeSaveTitle && (item.contentText || "").includes(body)), "fresh archive collection read confirms exact identity and retained content");
  await page.goto(`${baseUrl}/notes/${noteId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("alert").filter({ hasText: "Unable to open this note." }).waitFor();
  await page.goto(`${baseUrl}/notes`, { waitUntil: "domcontentloaded" });
  await page.locator(".notes-pagination").getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByText(routeSaveTitle, { exact: true }).waitFor();

  const restoreButton = page.locator(".note-row").filter({ hasText: routeSaveTitle }).getByRole("button", { name: "Restore" });
  const restoreRequests = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === `/api/v1/notes/${noteId}/restore`) restoreRequests.push(request);
  });
  await restoreButton.click();
  await page.locator(".note-row").filter({ hasText: routeSaveTitle }).waitFor({ state: "detached" });
  assert.equal(restoreRequests.length, 1, "restoring sends one request and removes the note from the archive");
  await page.getByRole("button", { name: "Active notes", exact: true }).click();
  await page.getByRole("link", { name: `Open ${routeSaveTitle}` }).waitFor();
  await page.reload();
  await page.getByRole("link", { name: `Open ${routeSaveTitle}` }).waitFor();
  const restored = await api(`/notes/${noteId}`);
  assert.equal(restored.status, 200);
  assert.equal(restored.data.title, routeSaveTitle);
  assert.ok(restored.data.contentText.includes(body));
  assert.ok(restored.data.tags.includes(retainedLabelName), "restoring the note retains its assigned NOTE label");
  assert.ok((await api("/notes/labels")).data.some((label) => label.id === retainedLabel.data.id), "the restored note label remains available");
  const activeAfterRestore = await api("/notes?page=0&size=100");
  const activeAfterRestoreItems = Array.isArray(activeAfterRestore.data) ? activeAfterRestore.data : activeAfterRestore.data.items;
  assert.equal(activeAfterRestoreItems.filter((item) => item.id === noteId).length, 1, "fresh active collection contains the restored note exactly once");
  const archiveAfterRestore = await api("/notes?page=0&size=100&archived=true");
  const archiveAfterRestoreItems = Array.isArray(archiveAfterRestore.data) ? archiveAfterRestore.data : archiveAfterRestore.data.items;
  assert.ok(!archiveAfterRestoreItems.some((item) => item.id === noteId), "fresh archive collection no longer lists the restored note");
});

it("keeps an empty or whitespace-only note recoverable without creating duplicates", async () => {
  await page.goto(`${baseUrl}/notes`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: "Create new note" }).click();
  await page.waitForURL(/\/notes\/[^/]+$/);
  noteId = new URL(page.url()).pathname.split("/").at(-1);
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  const emptyNote = await api(`/notes/${noteId}`);
  assert.equal(emptyNote.status, 200);
  assert.equal(emptyNote.data.title, "");

  await page.getByRole("button", { name: "Back to notes" }).click();
  const emptyLink = page.getByRole("link", { name: "Open untitled note" });
  await emptyLink.waitFor();
  assert.equal(await emptyLink.count(), 1);
  await page.reload();
  await page.getByRole("link", { name: "Open untitled note" }).waitFor();
  const active = await api("/notes?page=0&size=100");
  const items = Array.isArray(active.data) ? active.data : active.data.items;
  assert.equal(items.filter((item) => item.id === noteId).length, 1, "the empty note is stored exactly once");

  await page.getByRole("link", { name: "Open untitled note" }).click();
  await page.waitForURL(new RegExp(`/notes/${noteId}$`));
  await page.getByRole("textbox", { name: "Note title" }).fill("   ");
  await page.getByRole("textbox", { name: "Note content" }).fill("   ");
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  const whitespaceSaved = await api(`/notes/${noteId}`);
  assert.equal(whitespaceSaved.status, 200);
  assert.equal(whitespaceSaved.data.title, "");
  await page.getByRole("button", { name: "Back to notes" }).click();
  await page.getByRole("link", { name: "Open untitled note" }).waitFor();
  const afterWhitespace = await api("/notes?page=0&size=100");
  const afterWhitespaceItems = Array.isArray(afterWhitespace.data) ? afterWhitespace.data : afterWhitespace.data.items;
  assert.equal(afterWhitespaceItems.filter((item) => item.id === noteId).length, 1, "whitespace-only editing does not create another note");
});

it("retains a note draft after an unavailable save and retries it successfully", async () => {
  await page.goto(`${baseUrl}/notes`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: "Create new note" }).click();
  await page.waitForURL(/\/notes\/[^/]+$/);
  noteId = new URL(page.url()).pathname.split("/").at(-1);
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  let failedWrites = 0;
  await page.route(`**/api/v1/notes/${noteId}`, async (route) => {
    if (route.request().method() === "PUT" && failedWrites === 0) {
      failedWrites += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "simulated unavailable save" }) });
      return;
    }
    await route.continue();
  });
  const title = `${marker} retry draft`;
  const content = `${marker} draft survives a temporary save outage`;
  await page.getByRole("textbox", { name: "Note title" }).fill(title);
  await page.getByRole("textbox", { name: "Note content" }).fill(content);
  await page.getByRole("status").filter({ hasText: "Not saved" }).waitFor();
  assert.equal(failedWrites, 1);
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), title);
  assert.ok((await page.getByRole("textbox", { name: "Note content" }).innerText()).includes(content));
  await page.getByRole("button", { name: "Retry save" }).click();
  await page.waitForFunction(async ({ id, title: expectedTitle, content: expectedContent }) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    if (!response.ok) return false;
    const note = await response.json();
    return note.title === expectedTitle && (note.contentText || "").includes(expectedContent);
  }, { id: noteId, title, content });
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  await page.unroute(`**/api/v1/notes/${noteId}`);
  const recovered = await api(`/notes/${noteId}`);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.title, title);
  assert.ok(recovered.data.contentText.includes(content));
  await page.reload();
  await page.getByRole("textbox", { name: "Note title" }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), title);
  assert.ok((await page.getByRole("textbox", { name: "Note content" }).innerText()).includes(content));
});

it("toggles and persists a checklist item and supports keyboard undo and redo", async () => {
  await page.goto(`${baseUrl}/notes`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: "Create new note" }).click();
  await page.waitForURL(/\/notes\/[^/]+$/);
  noteId = new URL(page.url()).pathname.split("/").at(-1);
  const title = `${marker} checklist and history`;
  const titleField = page.getByRole("textbox", { name: "Note title" });
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  await titleField.fill(title);

  const editor = page.getByRole("textbox", { name: "Note content" });
  await editor.fill("Keyboard history probe");
  await editor.press("Control+z");
  await page.waitForFunction(() => document.querySelector('[aria-label="Note content"]')?.innerText.trim() === "");
  await editor.press("Control+Shift+z");
  await page.waitForFunction(() => document.querySelector('[aria-label="Note content"]')?.innerText.includes("Keyboard history probe"));
  assert.match(await editor.innerText(), /Keyboard history probe/, "Ctrl+Shift+Z should redo the editor insertion");

  await editor.press("Control+a");
  const selectionBeforeChecklist = await page.evaluate(() => window.getSelection()?.toString() || "");
  assert.equal(selectionBeforeChecklist, "Keyboard history probe", "the editor text is selected before applying checklist formatting");
  await page.getByRole("button", { name: "Checklist" }).click();
  const taskItem = page.locator('.ProseMirror ul[data-type="taskList"] li');
  await taskItem.waitFor();
  assert.match(await taskItem.innerText(), /Keyboard history probe/);
  const checkbox = taskItem.locator('input[type="checkbox"]');
  await checkbox.check();
  await page.waitForFunction(async ({ id, text }) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    if (!response.ok) return false;
    const note = await response.json();
    const content = JSON.parse(note.content || "{}");
    const task = content.content?.find((node) => node.type === "taskList")?.content?.[0];
    return task?.attrs?.checked === true && task.content?.[0]?.content?.[0]?.text === text;
  }, { id: noteId, text: "Keyboard history probe" });
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();

  await page.getByRole("button", { name: "Back to notes" }).click();
  await page.getByRole("link", { name: `Open ${title}` }).click();
  await page.waitForFunction((text) => {
    const task = document.querySelector('.ProseMirror ul[data-type="taskList"] li');
    return Boolean(task?.innerText.includes(text) && task?.querySelector('input[type="checkbox"]')?.checked);
  }, "Keyboard history probe");
  const reopened = await api(`/notes/${noteId}`);
  const reopenedContent = JSON.parse(reopened.data.content);
  assert.equal(reopenedContent.content.find((node) => node.type === "taskList")?.content?.[0]?.attrs?.checked, true);
  assert.equal(reopenedContent.content.find((node) => node.type === "taskList")?.content?.[0]?.content?.[0]?.content?.[0]?.text, "Keyboard history probe");
});

it("applies supported formatting toolbar operations and persists the resulting structure", async () => {
  await page.goto(`${baseUrl}/notes`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: "Create new note" }).click();
  await page.waitForURL(/\/notes\/[^/]+$/);
  noteId = new URL(page.url()).pathname.split("/").at(-1);
  const title = `${marker} formatting toolbar`;
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  await page.getByRole("textbox", { name: "Note title" }).fill(title);
  const editor = page.getByRole("textbox", { name: "Note content" });
  const samples = ["Heading sample", "Bold sample", "Italic sample", "Underline sample", "Strike sample", "Bullet sample", "Numbered sample", "Quote sample", "Code sample"];
  await editor.fill(samples.join("\n"));
  await page.waitForFunction((count) => document.querySelectorAll(".ProseMirror > p").length === count, samples.length);

  async function selectParagraph(text) {
    const paragraph = page.locator(".ProseMirror > p").filter({ hasText: text });
    await paragraph.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    assert.equal(await page.evaluate(() => window.getSelection()?.toString() || ""), text);
  }

  await selectParagraph(samples[0]);
  await page.getByRole("button", { name: "Text style: Normal text" }).click();
  await page.getByRole("menuitemradio", { name: "Heading 1" }).click();
  await page.locator(".ProseMirror h1").filter({ hasText: samples[0] }).waitFor();

  for (const [index, toolbarName, expectedTag] of [
    [1, "Bold", "strong"],
    [2, "Italic", "em"],
    [3, "Underline", "u"],
    [4, "Strikethrough", "s"],
  ]) {
    await selectParagraph(samples[index]);
    await page.getByRole("button", { name: toolbarName }).click();
    await page.locator(`.ProseMirror ${expectedTag}`).filter({ hasText: samples[index] }).waitFor();
  }

  for (const [index, toolbarName, expectedSelector] of [
    [5, "Bullet list", ".ProseMirror ul:not([data-type='taskList'])"],
    [6, "Numbered list", ".ProseMirror ol"],
    [7, "Quote", ".ProseMirror blockquote"],
    [8, "Code block", ".ProseMirror pre"],
  ]) {
    await selectParagraph(samples[index]);
    await page.getByRole("button", { name: toolbarName }).click();
    await page.locator(expectedSelector).filter({ hasText: samples[index] }).waitFor();
  }

  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  const persisted = await api(`/notes/${noteId}`);
  assert.equal(persisted.status, 200);
  const content = JSON.parse(persisted.data.content);
  const types = content.content.map((node) => node.type);
  assert.ok(types.includes("heading"));
  assert.ok(types.includes("bulletList"));
  assert.ok(types.includes("orderedList"));
  assert.ok(types.includes("blockquote"));
  assert.ok(types.includes("codeBlock"));
  const collectMarks = (node) => [
    ...(node.marks || []).map((mark) => mark.type),
    ...(node.content || []).flatMap(collectMarks),
  ];
  const marks = collectMarks(content);
  for (const mark of ["bold", "italic", "underline", "strike"]) assert.ok(marks.includes(mark), `${mark} formatting is persisted`);
  await page.reload();
  await page.getByRole("textbox", { name: "Note title" }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), title);
  for (const [index, , expectedTag] of [
    [1, "Bold", "strong"], [2, "Italic", "em"], [3, "Underline", "u"], [4, "Strikethrough", "s"],
  ]) await page.locator(`.ProseMirror ${expectedTag}`).filter({ hasText: samples[index] }).waitFor();
  for (const [index, , selector] of [
    [5, "Bullet list", ".ProseMirror ul:not([data-type='taskList'])"],
    [6, "Numbered list", ".ProseMirror ol"], [7, "Quote", ".ProseMirror blockquote"], [8, "Code block", ".ProseMirror pre"],
  ]) await page.locator(selector).filter({ hasText: samples[index] }).waitFor();
  await page.locator(".ProseMirror h1").filter({ hasText: samples[0] }).waitFor();
});

it("pastes formatted content while dropping unsafe and unsupported markup", async () => {
  await page.goto(`${baseUrl}/notes`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: "Create new note" }).click();
  await page.waitForURL(/\/notes\/[^/]+$/);
  noteId = new URL(page.url()).pathname.split("/").at(-1);
  const title = `${marker} formatted paste`;
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  await page.getByRole("textbox", { name: "Note title" }).fill(title);
  await page.evaluate(() => {
    const editor = document.querySelector('[aria-label="Note content"]');
    const clipboard = new DataTransfer();
    clipboard.setData("text/html", '<p>Pasted <strong>formatting</strong><script>unsafe()</script><img src="x" onerror="unsafe()"></p>');
    clipboard.setData("text/plain", "Pasted formatting");
    editor?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await page.locator(".ProseMirror strong").filter({ hasText: "formatting" }).waitFor();
  assert.equal(await page.locator(".ProseMirror script, .ProseMirror img").count(), 0, "unsafe script and unsupported image markup are removed");
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  const persisted = await api(`/notes/${noteId}`);
  assert.equal(persisted.status, 200);
  assert.ok(persisted.data.content.includes('"bold"'), "supported formatting is saved");
  assert.ok(!persisted.data.content.includes("<script"), "unsafe HTML is not stored as note content");
  assert.ok(!persisted.data.content.includes("onerror"), "event-handler markup is not stored as note content");
  await page.reload();
  await page.getByRole("textbox", { name: "Note title" }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  assert.equal(await page.getByRole("textbox", { name: "Note title" }).inputValue(), title);
  await page.locator(".ProseMirror strong").filter({ hasText: "formatting" }).waitFor();
  assert.equal(await page.locator(".ProseMirror script, .ProseMirror img").count(), 0);
});

it("assigns and removes a Note label and keeps picker keyboard controls usable at phone width", async () => {
  const labelName = `${marker} note label`;
  const labelResponse = await api("/labels", "POST", { name: labelName, color: null, scopes: ["NOTE"] });
  assert.equal(labelResponse.status, 201);
  const labelId = labelResponse.data.id;
  await page.goto(`${baseUrl}/notes`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: "Create new note" }).click();
  await page.waitForURL(/\/notes\/[^/]+$/);
  noteId = new URL(page.url()).pathname.split("/").at(-1);
  const title = `${marker} label assignment`;
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  await page.getByRole("textbox", { name: "Note title" }).fill(title);
  await page.getByRole("button", { name: "Open label picker" }).click();
  const labelSearch = page.getByRole("combobox", { name: "Note labels" });
  await labelSearch.fill(labelName);
  const labelOption = page.getByRole("option").filter({ hasText: labelName });
  await labelOption.click();
  await page.getByRole("button", { name: `Remove ${labelName}` }).waitFor();
  await page.waitForFunction(async ({ id, name }) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return response.ok && (await response.json()).tags.includes(name);
  }, { id: noteId, name: labelName });
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();

  await page.reload();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  await page.getByRole("button", { name: `Remove ${labelName}` }).waitFor();
  const labelCheck = await api(`/labels?scope=NOTE`);
  assert.ok(labelCheck.data.some((label) => label.id === labelId), "the Note label remains available after reopening the note");

  await page.getByRole("button", { name: `Remove ${labelName}` }).click();
  await page.waitForFunction(async ({ id, name }) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return response.ok && !(await response.json()).tags.includes(name);
  }, { id: noteId, name: labelName });
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  assert.ok((await api("/labels?scope=NOTE")).data.some((label) => label.id === labelId), "removing the association leaves the label available");
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  await page.getByRole("button", { name: `Remove ${labelName}` }).waitFor({ state: "detached" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open label picker" }).click();
  const narrowSearch = page.getByRole("combobox", { name: "Note labels" });
  assert.equal(await narrowSearch.evaluate((input) => Number.parseFloat(getComputedStyle(input).fontSize)), 16);
  await narrowSearch.fill(labelName);
  await page.getByRole("option").filter({ hasText: labelName }).click();
  await page.getByRole("button", { name: `Remove ${labelName}` }).waitFor();
  await page.waitForFunction(async ({ id, name }) => {
    const response = await fetch(`/api/v1/notes/${id}`, { cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return response.ok && (await response.json()).tags.includes(name);
  }, { id: noteId, name: labelName });
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Note title"]')?.disabled);
  await page.getByRole("button", { name: `Remove ${labelName}` }).waitFor();
  await page.getByRole("button", { name: "Open label picker" }).click();
  const reopenedSearch = page.getByRole("combobox", { name: "Note labels" });
  await reopenedSearch.fill(labelName);
  const reopenedOption = page.getByRole("option").filter({ hasText: labelName });
  await reopenedOption.waitFor();
  assert.equal(await reopenedOption.getAttribute("aria-selected"), "true");
  await reopenedSearch.press("Escape");
  await page.getByRole("combobox", { name: "Note labels" }).waitFor({ state: "detached" });
  const pickerBounds = await page.locator(".tag-editor .label-picker-control").boundingBox();
  assert.ok(pickerBounds && pickerBounds.x >= 0 && pickerBounds.x + pickerBounds.width <= 390, JSON.stringify(pickerBounds));
});

it("rejects foreign note reads and keeps missing or foreign deep links private", async () => {
  assert.ok(noteId, "the primary browser journey created a note to protect");
  const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
  const otherPage = await otherContext.newPage();
  otherPage.setDefaultTimeout(10000);
  await otherPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await otherPage.getByRole("button", { name: /New here\? Create an account/ }).click();
  await otherPage.getByRole("textbox", { name: "Email" }).fill(`notes-owner-check-${Date.now()}@example.com`);
  await otherPage.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await otherPage.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await otherPage.getByRole("button", { name: "Create account", exact: true }).click();
  await otherPage.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
  const result = await otherPage.evaluate(async (id) => {
    const response = await fetch(`/api/v1/notes/${id}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, body: await response.text() };
  }, noteId);
  assert.equal(result.status, 404, "foreign note IDs are not readable from a second user's browser session");
  assert.ok(!result.body.includes(marker), "the foreign response must not disclose the note's title or content marker");

  await otherPage.goto(`${baseUrl}/notes/${noteId}`, { waitUntil: "domcontentloaded" });
  const foreignAlert = otherPage.getByRole("alert");
  await foreignAlert.filter({ hasText: "Unable to open this note." }).waitFor();
  assert.equal(await foreignAlert.innerText(), "Unable to open this note.");
  assert.ok(!(await otherPage.locator(".notes-page").innerText()).includes(marker));

  const missingPage = await otherContext.newPage();
  missingPage.setDefaultTimeout(10000);
  const missingId = `missing-${Date.now()}`;
  await missingPage.goto(`${baseUrl}/notes/${missingId}`, { waitUntil: "domcontentloaded" });
  const missingAlert = missingPage.getByRole("alert");
  await missingAlert.filter({ hasText: "Unable to open this note." }).waitFor();
  assert.equal(await missingAlert.innerText(), "Unable to open this note.");
  assert.equal(new URL(missingPage.url()).pathname, `/notes/${missingId}`);
  assert.ok(!(await missingPage.locator(".notes-page").innerText()).includes(marker));
  await otherContext.close();
});
