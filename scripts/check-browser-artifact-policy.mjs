import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/verify.yml", "utf8");
const helper = readFileSync("frontend/scripts/browser-failure-artifacts.mjs", "utf8");
const scrubber = readFileSync("frontend/scripts/scrub-playwright-trace.py", "utf8");

function requireUploadPolicy(stepName, artifactName, artifactPath) {
  const start = workflow.indexOf(`- name: ${stepName}`);
  assert.notEqual(start, -1, `verify.yml is missing ${stepName}`);
  const end = workflow.indexOf("      - name:", start + 1);
  const step = workflow.slice(start, end === -1 ? undefined : end);
  assert.match(step, /if:\s*failure\(\)/, `${stepName} must upload only on failure`);
  assert.match(step, new RegExp(`name: ${artifactName}.*github\\.run_id.*github\\.run_attempt`), `${stepName} artifact name must include its workflow run and attempt`);
  assert.match(step, new RegExp(`path: \\$\\{\\{ runner\\.temp \\}\\}/${artifactPath}`), `${stepName} must read from its run-scoped temp directory`);
  assert.match(step, /retention-days:\s*14\b/, `${stepName} must retain failure evidence for 14 days`);
}

requireUploadPolicy(
  "Upload timer WebSocket failure evidence",
  "timer-websocket-e2e-failure-",
  "timer-websocket-e2e-artifacts/",
);
requireUploadPolicy(
  "Upload line history failure evidence",
  "line-history-e2e-failure-",
  "line-history-e2e-artifacts/",
);
assert.match(workflow, /Failure logs and scrubbed browser evidence are attached to this \[workflow run\]\(\$RUN_URL\) and retained for 14 days\./);

for (const filename of ["scripts/run-timer-websocket-e2e.sh", "scripts/run-line-history-e2e.sh"]) {
  const runner = readFileSync(filename, "utf8");
  assert.match(runner, /commit="\$\(git rev-parse HEAD\)"/, `${filename} must capture its source commit`);
  assert.match(runner, /Commit: %s\\n.*runner-failure\.txt/, `${filename} must put the commit in early-failure evidence`);
  assert.match(runner, /Commit: %s\\nBrowser engine: %s\\nBrowser profile: %s\\n.*run-metadata\.txt/, `${filename} must put the commit and browser profile in run metadata`);
}

assert.match(helper, /tracing\.start\(\{ screenshots: false, snapshots: true, sources: true \}\)/);
assert.doesNotMatch(helper, /page\.screenshot\(/, "failure artifacts must not include unsanitized page screenshots");
assert.match(helper, /scrubPlaywrightTrace\(tracePath\)/);
assert.match(helper, /rmSync\(tracePath, \{ force: true \}\)/, "an unsanitizable trace must be removed before upload");
for (const sensitiveField of ["authorization", "cookie", "password", "email", "access_token", "refresh_token"]) {
  assert.ok(scrubber.includes(`"${sensitiveField}"`), `trace scrubber must redact ${sensitiveField}`);
}
assert.match(scrubber, /REDACTED_CREDENTIAL/);
assert.match(scrubber, /REDACTED_ACCOUNT/);

console.log("Browser artifact policy passed (run/commit linkage, failure-only upload, 14-day retention, and trace scrubbing).");
