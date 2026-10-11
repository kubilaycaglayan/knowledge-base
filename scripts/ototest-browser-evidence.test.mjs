import assert from "node:assert/strict";
import test from "node:test";
import { unresolvedNavAcceptanceReferences } from "./ototest-browser-evidence.mjs";

const declaration = 'it("creates a Path using the keyboard", async () => {});';

test("resolves named nav acceptance assertions", () => {
  const rows = [["FLOW-02", "PathsView.vue", "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`", "gap"]];
  assert.deepEqual(unresolvedNavAcceptanceReferences(rows, declaration), []);
});

test("reports an assertion reference after its declaration is renamed", () => {
  const rows = [["FLOW-02", "PathsView.vue", "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`", "gap"]];
  assert.deepEqual(unresolvedNavAcceptanceReferences(rows, 'it("creates a Path by keyboard", async () => {});'), [
    { row: 1, reference: "creates a Path using the keyboard" },
  ]);
});

test("ignores other source and API references following browser assertions", () => {
  const rows = [["FLOW-02", "PathsView.vue", "[`nav-shell.acceptance.test.mjs`](../../frontend/scripts/nav-shell.acceptance.test.mjs): `creates a Path using the keyboard`; `PathAuthorizationApiTest.pathNamesAreValidatedBeforePersistence`; `paths.real-stack.acceptance.test.mjs`", "gap"]];
  assert.deepEqual(unresolvedNavAcceptanceReferences(rows, declaration), []);
});

test("ignores rows with no nav acceptance reference", () => {
  const rows = [["FLOW-02", "PathsView.vue", "`creates a Path using the keyboard`", "gap"]];
  assert.deepEqual(unresolvedNavAcceptanceReferences(rows, ""), []);
});
