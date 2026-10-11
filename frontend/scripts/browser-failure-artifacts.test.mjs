import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { browserFailureArtifacts, scrubPlaywrightTrace } from "./browser-failure-artifacts.mjs";

test("scrubs account credentials, email addresses, cookies, and bearer tokens from trace data", () => {
  const directory = mkdtempSync(join(tmpdir(), "knowledge-base-trace-scrub-"));
  try {
    const tracePath = join(directory, "trace.zip");
    const fixture = {
      headers: [
        { name: "authorization", value: "Bearer private-token-value" },
        { name: "cookie", value: "session=private-cookie-value" },
      ],
      form: { email: "fixture-owner@example.test", password: "fixture-password-value", access_token: "fixture-access-token" },
      body: "Authorization: Basic cHJpdmF0ZS1jcmVkZW50aWFs",
      text: "Account: fixture-owner@example.test",
    };
    execFileSync("python3", [
      "-c",
      "import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1], 'w') as archive: archive.writestr('trace.trace', json.dumps(json.loads(sys.argv[2])))",
      tracePath,
      JSON.stringify(fixture),
    ]);

    scrubPlaywrightTrace(tracePath);
    const scrubbed = execFileSync("python3", [
      "-c",
      "import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as archive: sys.stdout.write(archive.read('trace.trace').decode())",
      tracePath,
    ], { encoding: "utf8" });

    for (const secret of [
      "private-token-value",
      "private-cookie-value",
      "fixture-owner@example.test",
      "fixture-password-value",
      "fixture-access-token",
      "cHJpdmF0ZS1jcmVkZW50aWFs",
    ]) assert.ok(!scrubbed.includes(secret), `trace must not retain ${secret}`);
    assert.match(scrubbed, /\[REDACTED_ACCOUNT\]/);
    assert.match(scrubbed, /\[REDACTED_CREDENTIAL\]/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failure capture omits screenshots and removes an unsanitizable trace", async () => {
  const directory = mkdtempSync(join(tmpdir(), "knowledge-base-failure-artifacts-"));
  let traceOptions;
  let screenshotCalled = false;
  const page = {
    on() {},
    async screenshot() { screenshotCalled = true; },
  };
  const context = {
    on() {},
    pages: () => [page],
    tracing: {
      async start(options) { traceOptions = options; },
      async stop({ path }) { writeFileSync(path, "not a zip archive"); },
    },
  };
  try {
    const capture = browserFailureArtifacts({ directory, engine: "chromium", profile: "desktop" });
    await capture.begin("fixture failure", [context]);
    assert.deepEqual(traceOptions, { screenshots: false, snapshots: true, sources: true });
    await capture.end(new Error("fixture failure"));
    assert.equal(screenshotCalled, false);
    const files = readdirSync(directory);
    assert.equal(files.length, 1);
    assert.match(files[0], /fixture-failure-diagnostics\.json$/);
    assert.doesNotMatch(files.join(" "), /\.png$|\.zip$/);
    assert.ok(readFileSync(join(directory, files[0]), "utf8").includes("fixture failure"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
