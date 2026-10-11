import assert from "node:assert/strict";
import test from "node:test";
import { manualRowsMissingProcedureLink } from "./ototest-manual-evidence.mjs";

test("accepts manual evidence with a linked procedure", () => {
  assert.deepEqual(manualRowsMissingProcedureLink([
    ["Clockify permission", "Follow the [permission procedure](../testing.md#extension-permission)", "manual"],
  ], 2), []);
});

test("reports manual evidence without a procedure link", () => {
  assert.deepEqual(manualRowsMissingProcedureLink([
    ["Clockify permission", "The prompt needs a manual check", "manual"],
    ["Storage permission", "Covered by the generated manifest", "covered"],
  ], 2), [{ row: 1, identity: "Clockify permission" }]);
});
