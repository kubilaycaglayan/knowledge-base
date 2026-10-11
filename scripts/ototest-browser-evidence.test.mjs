import assert from "node:assert/strict";
import test from "node:test";
import { apiRowsMissingNamedEvidence, coveredStateClaimsMissingLayer, invalidEvidenceStatuses, rowsMissingNamedAssertions, unresolvedAcceptanceReferences } from "./ototest-browser-evidence.mjs";

const declaration = 'it("creates a Path using the keyboard", async () => {});';
const sources = { "nav-shell.acceptance.test.mjs": declaration };
const row = (cells, evidenceIndex = 4, rowNumber = 1, document = "01-control-matrix.md") => ({
  cells,
  evidenceIndex,
  row: rowNumber,
  document,
});

test("resolves named browser acceptance assertions", () => {
  const rows = [row([
    "FLOW-02",
    "PathsView.vue",
    "Create Path",
    "Validation and persistence",
    "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`",
    "gap",
  ])];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, sources), []);
});

test("reports an assertion reference after its declaration is renamed", () => {
  const rows = [row([
    "FLOW-02",
    "PathsView.vue",
    "Create Path",
    "Validation and persistence",
    "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`",
    "gap",
  ])];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, {
    "nav-shell.acceptance.test.mjs": 'it("creates a Path by keyboard", async () => {});',
  }), [
    { document: "01-control-matrix.md", row: 1, file: "nav-shell.acceptance.test.mjs", reference: "creates a Path using the keyboard" },
  ]);
});

test("ignores other source and API references following browser assertions", () => {
  const rows = [row([
    "FLOW-02",
    "PathsView.vue",
    "Create Path",
    "Validation and persistence",
    "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`; `PathAuthorizationApiTest.pathNamesAreValidatedBeforePersistence`; `paths.real-stack.acceptance.test.mjs`",
    "gap",
  ])];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, sources), []);
});

test("ignores rows with no browser acceptance reference", () => {
  const rows = [row(["FLOW-02", "PathsView.vue", "Create Path", "No tests cited", "`creates a Path using the keyboard`", "gap"])];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, sources), []);
});

test("resolves assertions against the file named by each matrix reference", () => {
  const rows = [row([
    "FLOW-01",
    "FloatingTimeTracker.vue",
    "Choose Path",
    "Keyboard action",
    "[`session-tracker.acceptance.test.mjs`](../../frontend/scripts/session-tracker.acceptance.test.mjs): `P4–P10, V1/V3: opens the actual menu, renders its separator, selects by keyboard, and creates a path`",
    "gap",
  ])];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, {
    "session-tracker.acceptance.test.mjs": 'it("P4–P10, V1/V3: opens the actual menu, renders its separator, selects by keyboard, and creates a path", async () => {});',
  }), []);
});

test("resolves named extension unit-test assertions", () => {
  const rows = [row([
    "storage",
    "WXT manifest permissions",
    "`options.test.js`: `loads the configured API base or the default`",
    "Persistence is covered",
    "covered",
  ], 2, 1, "01-extension-and-feature-map.md")];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, {
    "options.test.js": 'test("loads the configured API base or the default", async () => {});',
  }), []);
  assert.equal(unresolvedAcceptanceReferences(rows, {
    "options.test.js": 'test("loads a configured API base", async () => {});',
  })[0].reference, "loads the configured API base or the default");
});

test("reports stale route-matrix references with the route inventory location", () => {
  const rows = [row([
    "/paths",
    "PathsView.vue",
    "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`",
    "Mocked browser acceptance",
    "No other gap",
  ], 2, 3, "01-route-matrix.md")];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, {
    "nav-shell.acceptance.test.mjs": 'it("creates a Path with Enter", async () => {});',
  }), [
    { document: "01-route-matrix.md", row: 3, file: "nav-shell.acceptance.test.mjs", reference: "creates a Path using the keyboard" },
  ]);
});

test("matches apostrophes and parameterized unit-test titles", () => {
  const rows = [row([
    "FLOW-09",
    "NotesView.vue",
    "Keep a failed draft",
    "Retry navigation",
    "[`NotesView.test.ts`](../../frontend/src/views/NotesView.test.ts): `keeps a failed draft in the editor, retries it, then permits navigation`; [`LabelHistoryRecords.test.ts`](../../frontend/src/components/LabelHistoryRecords.test.ts): `links a related record kind to its route`; [`apostrophe.test.ts`](../../frontend/src/views/apostrophe.test.ts): `keeps a user's path name`",
    "gap",
  ])];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, {
    "NotesView.test.ts": 'it("keeps a failed draft in the editor, retries it, then permits navigation", async () => {});',
    "LabelHistoryRecords.test.ts": 'it.each([[0]])("links a related record kind to its route", async () => {});',
    "apostrophe.test.ts": 'it("keeps a user\'s path name", async () => {});',
  }), []);
});

test("accepts one recognized evidence status per row", () => {
  assert.deepEqual(invalidEvidenceStatuses([
    ["/a", "src", "evidence", "class", "covered", "gap note"],
    ["/b", "src", "evidence", "class", "gap", "gap note"],
    ["/c", "src", "procedure", "manual", "manual", "steps"],
    ["/d", "src", "decision", "excluded", "unsupported/excluded", "reason"],
    ["/e", "src", "decision", "decision-needed", "decision-needed", "owner"],
  ], 4), []);
});

test("rejects missing, unknown, or multiple evidence statuses", () => {
  assert.deepEqual(invalidEvidenceStatuses([
    ["/a", "src", "evidence", "class", "", "gap note"],
    ["/b", "src", "evidence", "class", "probably covered", "gap note"],
    ["/c", "src", "evidence", "class", "covered; gap", "gap note"],
  ], 4), [
    { row: 1, status: "" },
    { row: 2, status: "probably covered" },
    { row: 3, status: "covered; gap" },
  ]);
});

test("requires each API operation row to name a qualified test assertion", () => {
  assert.deepEqual(apiRowsMissingNamedEvidence([
    ["GET `/api/v1/paths`", "PathController.list", "`PathApiTest.listReturnsOwnedPaths`", "Owner-scoped list"],
    ["DELETE `/api/v1/paths/{id}`", "PathController.delete", "No assertion mapped yet", "Deletion effect needs evidence"],
  ]), [
    { row: 2, operation: "DELETE `/api/v1/paths/{id}`" },
  ]);
});

test("requires covered inventory rows to name an assertion rather than only a test file", () => {
  assert.deepEqual(rowsMissingNamedAssertions([
    ["covered frontend", "[`example.test.mjs`](example.test.mjs): `saves the item`", "covered"],
    ["covered Java", "ThingApiTest.savesTheItem", "covered"],
    ["Java filename only", "ThingApiTest.java", "covered"],
    ["filename only", "`example.test.mjs` verifies the flow", "covered"],
    ["gap may cite file", "`example.test.mjs`", "gap"],
  ], 1, 2), [
    { row: 3, identity: "Java filename only" },
    { row: 4, identity: "filename only" },
  ]);
});

test("requires persisted and ownership claims to cite an integration evidence layer", () => {
  assert.deepEqual(coveredStateClaimsMissingLayer([
    ["UI-only persistence claim", "ItemView.test.ts: `shows saved state`", "persisted item is returned after reload", "covered"],
    ["actual integration", "ItemIntegrationTest.itemPersistsAfterUpdate", "persisted item is returned after reload", "covered"],
    ["real browser integration", "item.real-stack.acceptance.test.mjs: `saves and reloads item`", "owner sees persisted item after reload", "covered"],
    ["render-only UI behavior", "ItemView.test.ts: `shows the saved badge`", "save button shows loading feedback", "covered"],
    ["gap", "ItemView.test.ts", "persisted item unavailable", "gap"],
  ], 1, 2, 3), [
    { row: 1, identity: "UI-only persistence claim" },
  ]);
});
