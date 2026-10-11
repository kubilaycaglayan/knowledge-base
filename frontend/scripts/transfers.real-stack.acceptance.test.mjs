import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.TRANSFERS_E2E_BASE_URL;
const email = process.env.TRANSFERS_E2E_EMAIL;
const password = process.env.TRANSFERS_E2E_PASSWORD;
const phoneProfile = process.env.BROWSER_PROFILE === "iphone";
if (!baseUrl || !email || !password) throw new Error("TRANSFERS_E2E_BASE_URL, TRANSFERS_E2E_EMAIL, and TRANSFERS_E2E_PASSWORD are required");

let browser;
let page;
async function activate(locator) {
  if (phoneProfile) {
    await locator.evaluate((element) => element.scrollIntoView({ block: "center", inline: "center" }));
    return locator.tap();
  }
  return locator.click();
}
async function batches(source) {
  return page.evaluate(async (source) => {
    const response = await fetch(`/api/v1/imports/${source}/batches`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  }, source);
}

before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || undefined,
    headless: process.env.BROWSER_HEADLESS !== "false",
  });
  const context = await browser.newContext({
    viewport: phoneProfile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    ...(phoneProfile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
    colorScheme: "light",
    reducedMotion: "reduce",
  });
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

it("exports and reimports Knowledge Base CSV, validates input, and imports Clockify sessions", async () => {
  const pathName = `Transfer fixture ${Date.now()}`;
  const pathDescription = "Exported by the OTOTEST transfer journey";
  const createdPath = await page.evaluate(async ({ name, description }) => {
    const response = await fetch("/api/v1/paths", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, color: null, textColor: null }),
    });
    return { status: response.status, data: await response.json() };
  }, { name: pathName, description: pathDescription });
  assert.equal(createdPath.status, 201);

  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await activate(page.getByRole("tab", { name: "Account", exact: true }));
  await page.getByRole("tabpanel", { name: "Account" }).waitFor();
  await activate(page.getByRole("tab", { name: "Import", exact: true }));
  await page.getByRole("tabpanel", { name: "Import" }).waitFor();
  await activate(page.getByRole("tab", { name: "Export" }));
  await page.getByRole("tabpanel", { name: "Export" }).waitFor();
  await activate(page.getByRole("button", { name: "Download Knowledge Base CSV" }));
  const csv = await page.evaluate(async () => {
    const response = await fetch("/api/v1/imports/knowledge-base/export", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    if (!response.ok) throw new Error(`Export returned ${response.status}`);
    return response.text();
  });
  assert.match(csv, /^entity,id,payload\n/);
  assert.ok(csv.includes(pathName), "the export contains the source account's Path");
  // A separate production database has no knowledge of the source IDs. Give
  // the fixture a fresh stable ID to model that portable import boundary.
  const destinationCsv = csv.replace(createdPath.data.id, randomUUID());
  await page.getByRole("status").filter({ hasText: "export is ready" }).waitFor();

  const importContext = await browser.newContext({
    viewport: phoneProfile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    ...(phoneProfile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  importContext.setDefaultTimeout(10000);
  const importPage = await importContext.newPage();
  await importPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await importPage.getByRole("button", { name: /New here\? Create an account/ }).click();
  await importPage.getByRole("textbox", { name: "Email" }).fill(`transfer-import-${Date.now()}@example.com`);
  await importPage.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await importPage.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await importPage.getByRole("button", { name: "Create account", exact: true }).click();
  await importPage.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
  await importPage.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await activate(importPage.getByRole("tab", { name: "Import" }));
  const csvInput = importPage.getByRole("textbox", { name: "Knowledge Base CSV" });
  await csvInput.fill(destinationCsv);
  const knowledgeBaseImportResponse = importPage.waitForResponse((response) => response.url().includes("/api/v1/imports/knowledge-base") && response.request().method() === "POST");
  await activate(importPage.getByRole("button", { name: "Import Knowledge Base data" }));
  const importResponse = await knowledgeBaseImportResponse;
  const importSummary = await importResponse.json();
  assert.equal(importResponse.status(), 200, JSON.stringify(importSummary));
  assert.equal(importSummary.imported, 1);
  await importPage.getByRole("status").filter({ hasText: "Imported" }).waitFor();
  const kbBatches = await importPage.evaluate(async () => {
    const response = await fetch("/api/v1/imports/knowledge-base/batches", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  });
  assert.equal(kbBatches.status, 200);
  assert.equal(kbBatches.data.length, 1);
  const importedPaths = await importPage.evaluate(async () => {
    const response = await fetch("/api/v1/paths", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  });
  assert.equal(importedPaths.status, 200);
  assert.ok(importedPaths.data.some((path) => path.name === pathName && path.description === pathDescription));
  await importPage.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await importPage.getByText(pathName, { exact: true }).waitFor();
  await importPage.reload();
  await importPage.getByText(pathName, { exact: true }).waitFor();
  await importPage.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await activate(importPage.getByRole("tab", { name: "Import" }));

  const filePathIds = [randomUUID(), randomUUID()];
  const filePathNames = ["File import Path A", "File import Path B"].map((name) => `${name} ${Date.now()}`);
  const makePathCsv = (names) => `entity,id,payload\n${filePathIds.map((id, index) => {
    const payload = JSON.stringify({ name: names[index], description: `Disposable import fixture ${index + 1}`, color: "#5a78a8", textColor: null, status: "ACTIVE" }).replaceAll('"', '""');
    return `path,${id},"${payload}"`;
  }).join("\n")}\n`;
  const fileCsv = makePathCsv(filePathNames);
  const conflictingCsv = makePathCsv(filePathNames.map((name) => `Changed ${name}`));
  await importPage.locator('input[type="file"]').setInputFiles({ name: "paths.csv", mimeType: "text/csv", buffer: Buffer.from(fileCsv) });
  await importPage.waitForFunction((expected) => document.querySelector('textarea[aria-label="Knowledge Base CSV"]')?.value === expected, fileCsv);
  assert.equal(await csvInput.inputValue(), fileCsv, "the selected file populates the Knowledge Base CSV editor");
  const fileImportResponse = importPage.waitForResponse((response) => response.url().includes("/api/v1/imports/knowledge-base") && response.request().method() === "POST");
  await activate(importPage.getByRole("button", { name: "Import Knowledge Base data" }));
  const fileImport = await fileImportResponse;
  const fileSummary = await fileImport.json();
  assert.equal(fileImport.status(), 200, JSON.stringify(fileSummary));
  assert.deepEqual([fileSummary.imported, fileSummary.skipped, fileSummary.createdPaths], [2, 0, 2]);
  await importPage.getByRole("status").filter({ hasText: "Imported 2 records, skipped 0 duplicates, and created 2 paths." }).waitFor();

  await csvInput.fill(conflictingCsv);
  const conflictResponse = importPage.waitForResponse((response) => response.url().includes("/api/v1/imports/knowledge-base") && response.request().method() === "POST");
  await activate(importPage.getByRole("button", { name: "Import Knowledge Base data" }));
  const conflict = await conflictResponse;
  const conflictSummary = await conflict.json();
  assert.equal(conflict.status(), 200, JSON.stringify(conflictSummary));
  assert.deepEqual([conflictSummary.imported, conflictSummary.skipped, conflictSummary.createdPaths], [0, 2, 0]);
  await importPage.getByRole("status").filter({ hasText: "Imported 0 records, skipped 2 duplicates, and created 0 paths." }).waitFor();

  await csvInput.fill("entity,id,payload\nunsupported,not-a-uuid,not-json");
  const malformedResponse = importPage.waitForResponse((response) => response.url().includes("/api/v1/imports/knowledge-base") && response.request().method() === "POST");
  await activate(importPage.getByRole("button", { name: "Import Knowledge Base data" }));
  assert.equal((await malformedResponse).status(), 400);
  await importPage.getByRole("alert").filter({ hasText: "Could not import Knowledge Base data." }).waitFor();
  assert.equal(await importPage.getByRole("status").count(), 0, "a failed import must not leave a completed-import status visible");

  const retryPathId = randomUUID();
  const retryPathName = `Import retry Path ${Date.now()}`;
  const retryPayload = JSON.stringify({ name: retryPathName, description: "Recovered after rejected import", color: null, textColor: null }).replaceAll('"', '""');
  await csvInput.fill(`entity,id,payload\npath,${retryPathId},"${retryPayload}"\n`);
  const retryImportResponse = importPage.waitForResponse((response) => response.url().includes("/api/v1/imports/knowledge-base") && response.request().method() === "POST");
  await activate(importPage.getByRole("button", { name: "Import Knowledge Base data" }));
  const retryImport = await retryImportResponse;
  const retrySummary = await retryImport.json();
  assert.equal(retryImport.status(), 200);
  assert.deepEqual([retrySummary.imported, retrySummary.skipped, retrySummary.createdPaths], [1, 0, 1]);
  await importPage.getByRole("status").filter({ hasText: "Imported 1 records, skipped 0 duplicates, and created 1 paths." }).waitFor();
  assert.equal(await importPage.getByRole("alert").count(), 0, "a successful retry clears the previous error");
  const completedKbBatches = await importPage.evaluate(async () => {
    const response = await fetch("/api/v1/imports/knowledge-base/batches", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  });
  assert.equal(completedKbBatches.status, 200);
  assert.equal(completedKbBatches.data.length, 4, "each successful Knowledge Base request creates one batch");
  const kbBatchById = new Map(completedKbBatches.data.map((batch) => [batch.id, batch]));
  for (const [summary, counts] of [
    [importSummary, [1, 0, 1]],
    [fileSummary, [2, 0, 2]],
    [conflictSummary, [0, 2, 0]],
    [retrySummary, [1, 0, 1]],
  ]) {
    const batch = kbBatchById.get(summary.batchId);
    assert.ok(batch, `batch ${summary.batchId} is present in history`);
    assert.equal(batch.source, "KNOWLEDGE_BASE");
    assert.deepEqual([batch.imported, batch.skipped, batch.createdPaths], counts);
  }

  const emptyCsvSubmit = importPage.getByRole("button", { name: "Import Knowledge Base data" });
  await csvInput.fill("");
  assert.equal(await emptyCsvSubmit.isDisabled(), true, "empty CSV cannot be submitted");
  const updatedPaths = await importPage.evaluate(async () => {
    const response = await fetch("/api/v1/paths", { cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return { status: response.status, data: await response.json() };
  });
  assert.equal(updatedPaths.status, 200);
  assert.ok(updatedPaths.data.some((path) => path.name === pathName), "the earlier pasted import remains unchanged");
  assert.ok(updatedPaths.data.some((path) => path.name === retryPathName), "the corrected retry creates its Path");
  assert.ok(filePathNames.every((name) => updatedPaths.data.some((path) => path.name === name)), "conflicting rows do not replace existing paths");
  assert.ok(filePathNames.every((name) => !updatedPaths.data.some((path) => path.name === `Changed ${name}`)));

  await importPage.reload();
  await activate(importPage.getByRole("tab", { name: "Import" }));
  await importPage.getByRole("tabpanel", { name: "Knowledge Base" }).waitFor();
  const fileBatchRow = importPage.locator(".history-row").filter({ hasText: "2 imported · 0 skipped · 2 paths" });
  await fileBatchRow.waitFor();
  assert.equal(await fileBatchRow.count(), 1);
  const fileBatchDate = (await fileBatchRow.locator("strong").innerText()).trim();
  const cancelDialog = importPage.waitForEvent("dialog");
  const cancelClick = activate(fileBatchRow.getByRole("button", { name: "Undo", exact: true }));
  const cancelPrompt = await cancelDialog;
  assert.match(cancelPrompt.message(), /Undo Knowledge Base import from/);
  assert.ok(cancelPrompt.message().includes(fileBatchDate), "the undo prompt identifies the selected batch date");
  await cancelPrompt.dismiss();
  await cancelClick;
  assert.equal(await fileBatchRow.getByRole("button", { name: "Undo", exact: true }).count(), 1);
  const afterCancelPaths = await importPage.evaluate(async () => {
    const response = await fetch("/api/v1/paths", { cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return response.json();
  });
  assert.ok(filePathNames.every((name) => afterCancelPaths.some((path) => path.name === name)));

  const undoResponse = importPage.waitForResponse((response) => response.url().includes("/api/v1/imports/knowledge-base/batches/") && response.request().method() === "DELETE");
  const acceptDialog = importPage.waitForEvent("dialog");
  const undoClick = activate(fileBatchRow.getByRole("button", { name: "Undo", exact: true }));
  const acceptPrompt = await acceptDialog;
  assert.match(acceptPrompt.message(), /Undo Knowledge Base import from/);
  await acceptPrompt.accept();
  await undoClick;
  const undoResponseResult = await undoResponse;
  assert.equal(undoResponseResult.status(), 200);
  const undoSummary = await undoResponseResult.json();
  assert.equal(undoSummary.batchId, fileSummary.batchId);
  assert.deepEqual(
    [undoSummary.deletedEntries, undoSummary.deletedActivities, undoSummary.deletedLogs, undoSummary.deletedPaths],
    [0, 0, 0, 2],
  );
  await importPage.getByRole("status").filter({ hasText: "Removed 0 imported sessions, 0 timeline records, and 2 paths." }).waitFor();
  await importPage.reload();
  await activate(importPage.getByRole("tab", { name: "Import" }));
  const undoneRow = importPage.locator(".history-row").filter({ hasText: "2 imported · 0 skipped · 2 paths" });
  await undoneRow.getByText("undone", { exact: true }).waitFor();
  assert.equal(await undoneRow.getByRole("button", { name: "Undo" }).count(), 0);
  const afterUndoPaths = await importPage.evaluate(async () => {
    const response = await fetch("/api/v1/paths", { cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return response.json();
  });
  assert.ok(afterUndoPaths.some((path) => path.name === pathName), "undo preserves the other import batch's Path");
  assert.ok(afterUndoPaths.some((path) => path.name === retryPathName), "undo preserves a separate retry batch's Path");
  assert.ok(filePathNames.every((name) => !afterUndoPaths.some((path) => path.name === name)));
  await importContext.close();

  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await activate(page.getByRole("tab", { name: "Import" }));
  await activate(page.getByRole("tab", { name: "Clockify" }));
  const clockifyInput = page.getByRole("textbox", { name: "Clockify JSON" });
  await clockifyInput.fill("{");
  await activate(page.getByRole("button", { name: "Import Clockify sessions" }));
  await page.getByRole("alert").filter({ hasText: "Paste valid Clockify JSON" }).waitFor();
  const oversizedClockify = JSON.stringify({
    timeentries: Array.from({ length: 2001 }, (_, index) => ({
      _id: `ototest-oversized-${index}`,
      timeInterval: { start: "2025-02-03T10:00:00Z", end: "2025-02-03T10:30:00Z" },
    })),
  });
  await clockifyInput.fill(oversizedClockify);
  const oversizedResponse = page.waitForResponse((response) => response.url().includes("/api/v1/imports/clockify") && response.request().method() === "POST");
  await activate(page.getByRole("button", { name: "Import Clockify sessions" }));
  assert.equal((await oversizedResponse).status(), 400);
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("status").count(), 0, "invalid Clockify input must not leave a success status visible");

  const clockifyDescription = `OTOTEST transfer journey ${Date.now()}`;
  const clockifyProject = `OTOTEST Clockify project ${Date.now()}`;
  const clockifyPayload = {
    timeentries: [{
      _id: `ototest-transfer-${randomUUID()}`,
      description: clockifyDescription,
      projectName: clockifyProject,
      timeInterval: { start: "2025-02-03T10:00:00Z", end: "2025-02-03T10:30:00Z" },
    }],
  };
  await clockifyInput.fill(JSON.stringify(clockifyPayload));
  const clockifyImportResponse = page.waitForResponse((response) => response.url().includes("/api/v1/imports/clockify") && response.request().method() === "POST");
  await activate(page.getByRole("button", { name: "Import Clockify sessions" }));
  const clockifyImport = await clockifyImportResponse;
  const clockifySummary = await clockifyImport.json();
  assert.equal(clockifyImport.status(), 200);
  assert.deepEqual([clockifySummary.imported, clockifySummary.skipped, clockifySummary.createdPaths], [1, 0, 1]);
  await page.getByRole("status").filter({ hasText: "Imported 1 sessions, skipped 0 duplicates, and created 1 paths." }).waitFor();

  await clockifyInput.fill(JSON.stringify(clockifyPayload));
  const duplicateClockifyResponse = page.waitForResponse((response) => response.url().includes("/api/v1/imports/clockify") && response.request().method() === "POST");
  await activate(page.getByRole("button", { name: "Import Clockify sessions" }));
  const duplicateClockify = await duplicateClockifyResponse;
  const duplicateSummary = await duplicateClockify.json();
  assert.equal(duplicateClockify.status(), 200);
  assert.deepEqual([duplicateSummary.imported, duplicateSummary.skipped, duplicateSummary.createdPaths], [0, 1, 0]);
  await page.getByRole("status").filter({ hasText: "Imported 0 sessions, skipped 1 duplicates, and created 0 paths." }).waitFor();

  const additionalDuplicateBatchIds = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    await clockifyInput.fill(JSON.stringify(clockifyPayload));
    const repeatedResponse = page.waitForResponse((response) => response.url().includes("/api/v1/imports/clockify") && response.request().method() === "POST");
    await activate(page.getByRole("button", { name: "Import Clockify sessions" }));
    const repeated = await repeatedResponse;
    const repeatedSummary = await repeated.json();
    assert.equal(repeated.status(), 200);
    assert.deepEqual([repeatedSummary.imported, repeatedSummary.skipped, repeatedSummary.createdPaths], [0, 1, 0]);
    additionalDuplicateBatchIds.push(repeatedSummary.batchId);
  }

  const clockifyBatches = await batches("clockify");
  assert.equal(clockifyBatches.status, 200);
  assert.equal(clockifyBatches.data.length, 6);
  assert.ok(clockifyBatches.data.slice(0, 5).every((batch) => batch.imported === 0 && batch.skipped === 1));
  assert.ok(additionalDuplicateBatchIds.every((id) => clockifyBatches.data.some((batch) => batch.id === id)));
  assert.equal(clockifyBatches.data.at(-1).id, clockifySummary.batchId);
  assert.equal(clockifyBatches.data.at(-1).source, "IMPORT");

  const importedSessions = await page.evaluate(async () => {
    const response = await fetch("/api/v1/time-entries?page=0&size=20", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  });
  assert.equal(importedSessions.status, 200);
  assert.ok(importedSessions.data.sessions.some((session) => session.description === clockifyDescription && session.source === "IMPORT"));
  const importedClockifySession = importedSessions.data.sessions.find((session) => session.description === clockifyDescription);
  assert.ok(importedClockifySession?.pathId, "the imported session is assigned to its Clockify Path");
  const importedClockifyPaths = await page.evaluate(async () => {
    const response = await fetch("/api/v1/paths", { cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return response.json();
  });
  assert.ok(importedClockifyPaths.some((path) => path.id === importedClockifySession.pathId && path.name === clockifyProject));

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByText(clockifyDescription, { exact: true }).waitFor();
  await page.reload();
  await page.getByText(clockifyDescription, { exact: true }).waitFor();
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByText(clockifyProject, { exact: true }).waitFor();
  await page.reload();
  await page.getByText(clockifyProject, { exact: true }).waitFor();

  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.reload();
  await activate(page.getByRole("tab", { name: "Import" }));
  await activate(page.getByRole("tab", { name: "Clockify" }));
  await page.locator(".history-row").first().waitFor();
  assert.equal(await page.locator(".history-row").count(), 5, "history pages show no more than five batches");
  if (phoneProfile) {
    const importControlHeights = await page.locator(".import-tabs button, .history-pagination button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    assert.ok(importControlHeights.length >= 4);
    assert.ok(importControlHeights.every((height) => height >= 44), `phone import controls must be at least 44px tall: ${importControlHeights.join(", ")}`);
  }
  await activate(page.getByRole("button", { name: "Next" }));
  await page.getByText("Page 2 of 2", { exact: true }).waitFor();
  const clockifyBatchRow = page.locator(".history-row").filter({ hasText: "1 imported · 0 skipped · 1 paths" });
  await clockifyBatchRow.waitFor();
  const clockifyBatchDate = (await clockifyBatchRow.locator("strong").innerText()).trim();
  const cancelClockifyDialog = page.waitForEvent("dialog");
  const cancelClockifyClick = activate(clockifyBatchRow.getByRole("button", { name: "Undo", exact: true }));
  const cancelClockifyPrompt = await cancelClockifyDialog;
  assert.match(cancelClockifyPrompt.message(), /Undo Clockify import from/);
  assert.ok(cancelClockifyPrompt.message().includes(clockifyBatchDate), "the undo prompt identifies the selected batch date");
  await cancelClockifyPrompt.dismiss();
  await cancelClockifyClick;
  assert.equal(await clockifyBatchRow.getByRole("button", { name: "Undo", exact: true }).count(), 1);
  const pathsAfterCancel = await page.evaluate(async () => {
    const response = await fetch("/api/v1/paths", { cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return response.json();
  });
  assert.ok(pathsAfterCancel.some((path) => path.name === clockifyProject));

  const clockifyUndoResponse = page.waitForResponse((response) => response.url().includes(`/api/v1/imports/clockify/batches/${clockifySummary.batchId}`) && response.request().method() === "DELETE");
  const acceptClockifyDialog = page.waitForEvent("dialog");
  const undoClockifyClick = activate(clockifyBatchRow.getByRole("button", { name: "Undo", exact: true }));
  const acceptClockifyPrompt = await acceptClockifyDialog;
  assert.match(acceptClockifyPrompt.message(), /Undo Clockify import from/);
  await acceptClockifyPrompt.accept();
  await undoClockifyClick;
  const clockifyUndo = await clockifyUndoResponse;
  assert.equal(clockifyUndo.status(), 200);
  const clockifyUndoSummary = await clockifyUndo.json();
  assert.equal(clockifyUndoSummary.batchId, clockifySummary.batchId);
  assert.deepEqual([clockifyUndoSummary.deletedEntries, clockifyUndoSummary.deletedActivities, clockifyUndoSummary.deletedPaths], [1, 0, 1]);
  await page.getByRole("status").filter({ hasText: "Removed 1 imported sessions, 0 timeline records, and 1 paths." }).waitFor();
  await page.reload();
  await activate(page.getByRole("tab", { name: "Import" }));
  await activate(page.getByRole("tab", { name: "Clockify" }));
  await activate(page.getByRole("button", { name: "Next" }));
  await page.getByText("Page 2 of 2", { exact: true }).waitFor();
  const undoneClockifyRow = page.locator(".history-row").filter({ hasText: "1 imported · 0 skipped · 1 paths" });
  await undoneClockifyRow.getByText("undone", { exact: true }).waitFor();
  assert.equal(await undoneClockifyRow.getByRole("button", { name: "Undo" }).count(), 0);
  const pathsAfterUndo = await page.evaluate(async () => {
    const response = await fetch("/api/v1/paths", { cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return response.json();
  });
  assert.ok(!pathsAfterUndo.some((path) => path.name === clockifyProject));
  assert.ok(pathsAfterUndo.some((path) => path.name === pathName), "undo preserves the pre-existing Path");
  const sessionsAfterUndo = await page.evaluate(async () => {
    const response = await fetch("/api/v1/time-entries?page=0&size=20", { cache: "no-store", headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` } });
    return response.json();
  });
  assert.ok(!sessionsAfterUndo.sessions.some((session) => session.description === clockifyDescription));
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  assert.equal(await page.getByText(clockifyDescription, { exact: true }).count(), 0);
  await page.reload();
  assert.equal(await page.getByText(clockifyDescription, { exact: true }).count(), 0);
  await page.goto(`${baseUrl}/paths`, { waitUntil: "domcontentloaded", timeout: 30000 });
  assert.equal(await page.getByText(clockifyProject, { exact: true }).count(), 0);
  await page.reload();
  assert.equal(await page.getByText(clockifyProject, { exact: true }).count(), 0);
  await page.getByText(pathName, { exact: true }).waitFor();
});
