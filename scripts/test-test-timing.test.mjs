import test from "node:test";
import assert from "node:assert/strict";
import { timingViolations } from "./check-test-timing.mjs";

test("allows existing timed behavior only within its reasoned allowance", () => {
  const violations = timingViolations({
    files: [
      {
        path: "component.test.ts",
        kind: "real-timer",
        content: "await new Promise((resolve) => setTimeout(resolve, 100));",
      },
    ],
    allowlist: {
      "component.test.ts": [
        { expression: "setTimeout(resolve, 100)", count: 1, reason: "models active work" },
      ],
    },
  });
  assert.deepEqual(violations, []);
});

test("rejects a new component test sleep and an over-threshold browser wait", () => {
  const violations = timingViolations({
    files: [
      {
        path: "component.test.ts",
        kind: "real-timer",
        content: "setTimeout(resolve, 250);",
      },
      {
        path: "browser.acceptance.test.mjs",
        kind: "browser-wait",
        content: "await page.waitForTimeout(500);",
      },
    ],
    allowlist: {},
  });
  assert.equal(violations.length, 2);
});

test("rejects an unreasoned or exceeded allowlist entry", () => {
  const violations = timingViolations({
    files: [
      {
        path: "component.test.ts",
        kind: "real-timer",
        content: "setTimeout(resolve, 100); setTimeout(resolve, 100);",
      },
    ],
    allowlist: {
      "component.test.ts": [
        { expression: "setTimeout(resolve, 100)", count: 1, reason: "intentional" },
      ],
    },
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /permits 1/);
});
