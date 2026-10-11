import assert from "node:assert/strict";
import test from "node:test";
import { missingInventoryMetadata } from "./ototest-inventory-metadata.mjs";

test("accepts an owner and exact local evidence command", () => {
  assert.deepEqual(missingInventoryMetadata([
    "**Inventory owner:** Knowledge Base maintainers.",
    "**Source revision:** `a1b2c3d`.",
    "**Review trigger:** route behavior or registration changes.",
    "**Evidence command:** `cd frontend && npm run test:nav`.",
    "**Latest evidence run:** [verify](https://example.com/run).",
  ].join("\n")), []);
});

test("accepts local test commands and extension execution commands", () => {
  assert.deepEqual(missingInventoryMetadata([
    "**Inventory owner:** Knowledge Base maintainers.",
    "**Source revision:** `a1b2c3d`.",
    "**Review trigger:** client or permission surface changes.",
    "**Test command:** `cd frontend && npm test`.",
    "**Execution commands:** `./scripts/run-extension-browser-e2e.sh`.",
    "**Latest evidence run:** [verify](https://example.com/run).",
  ].join("\n")), []);
});

test("reports a missing owner and missing exact command independently", () => {
  assert.deepEqual(missingInventoryMetadata("**Source review:** app source."), [
    "inventory owner",
    "reviewed source revision",
    "review trigger",
    "exact evidence command",
    "hosted evidence run link",
  ]);
  assert.deepEqual(missingInventoryMetadata([
    "**Inventory owner:** Knowledge Base maintainers.",
    "**Source revision:** `a1b2c3d`.",
    "**Review trigger:** changes to the API contract.",
    "**Evidence command:** see the testing guidance.",
    "**Latest evidence run:** pending.",
  ].join("\n")), ["exact evidence command", "hosted evidence run link"]);
});
