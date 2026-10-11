import assert from "node:assert/strict";
import test from "node:test";
import { unresolvedAcceptanceReferences } from "./ototest-browser-evidence.mjs";

const declaration = 'it("creates a Path using the keyboard", async () => {});';
const sources = { "nav-shell.acceptance.test.mjs": declaration };

test("resolves named browser acceptance assertions", () => {
  const rows = [[
    "FLOW-02",
    "PathsView.vue",
    "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`",
    "gap",
  ]];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, sources), []);
});

test("reports an assertion reference after its declaration is renamed", () => {
  const rows = [[
    "FLOW-02",
    "PathsView.vue",
    "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`",
    "gap",
  ]];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, {
    "nav-shell.acceptance.test.mjs": 'it("creates a Path by keyboard", async () => {});',
  }), [
    { row: 1, file: "nav-shell.acceptance.test.mjs", reference: "creates a Path using the keyboard" },
  ]);
});

test("ignores other source and API references following browser assertions", () => {
  const rows = [[
    "FLOW-02",
    "PathsView.vue",
    "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`; `PathAuthorizationApiTest.pathNamesAreValidatedBeforePersistence`; `paths.real-stack.acceptance.test.mjs`",
    "gap",
  ]];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, sources), []);
});

test("ignores rows with no browser acceptance reference", () => {
  const rows = [["FLOW-02", "PathsView.vue", "`creates a Path using the keyboard`", "gap"]];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, sources), []);
});

test("resolves assertions against the file named by each matrix reference", () => {
  const rows = [[
    "FLOW-01",
    "FloatingTimeTracker.vue",
    "[`session-tracker.acceptance.test.mjs`](../../frontend/scripts/session-tracker.acceptance.test.mjs): `P4–P10, V1/V3: opens the actual menu, renders its separator, selects by keyboard, and creates a path`",
    "gap",
  ]];
  assert.deepEqual(unresolvedAcceptanceReferences(rows, {
    "session-tracker.acceptance.test.mjs": 'it("P4–P10, V1/V3: opens the actual menu, renders its separator, selects by keyboard, and creates a path", async () => {});',
  }), []);
});
