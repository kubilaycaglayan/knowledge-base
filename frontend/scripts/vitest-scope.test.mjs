import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Vitest does not collect standalone Node acceptance suites", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(frontendRoot, "node_modules/vitest/vitest.mjs"), "list"],
    { cwd: frontendRoot, encoding: "utf8", timeout: 60_000 },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /scripts\/[^\n]*\.acceptance\.test\.mjs/);
});
