import assert from "node:assert/strict";
import test from "node:test";
import { missingInventoryMetadata } from "./ototest-inventory-metadata.mjs";

test("accepts an owner and exact local evidence command", () => {
  assert.deepEqual(missingInventoryMetadata([
    "**Inventory owner:** Knowledge Base maintainers.",
    "**Evidence command:** `cd frontend && npm run test:nav`.",
  ].join("\n")), []);
});

test("accepts local test commands and extension execution commands", () => {
  assert.deepEqual(missingInventoryMetadata([
    "**Inventory owner:** Knowledge Base maintainers.",
    "**Test command:** `cd frontend && npm test`.",
    "**Execution commands:** `./scripts/run-extension-browser-e2e.sh`.",
  ].join("\n")), []);
});

test("reports a missing owner and missing exact command independently", () => {
  assert.deepEqual(missingInventoryMetadata("**Source review:** app source."), [
    "inventory owner",
    "exact evidence command",
  ]);
  assert.deepEqual(missingInventoryMetadata([
    "**Inventory owner:** Knowledge Base maintainers.",
    "**Evidence command:** see the testing guidance.",
  ].join("\n")), ["exact evidence command"]);
});
