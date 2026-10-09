#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: API_BASE_URL=... API_TOKEN=... node scripts/performance-api-baseline.mjs <manifest.json>");
  process.exit(2);
}

const baseUrl = process.env.API_BASE_URL;
const token = process.env.API_TOKEN;
const outputPath = resolve(process.env.PERFORMANCE_OUTPUT ?? "performance-api-samples.json");
const warmups = Number(process.env.PERFORMANCE_WARMUPS ?? 3);
const samples = Number(process.env.PERFORMANCE_SAMPLES ?? 30);
const profile = process.env.PERFORMANCE_PROFILE ?? "unspecified";
const runId = process.env.PERFORMANCE_RUN_ID ?? new Date().toISOString().replaceAll(":", "-");
if (!baseUrl || !token) throw new Error("API_BASE_URL and API_TOKEN are required; use a disposable local account");
if (!Number.isInteger(warmups) || warmups < 0 || !Number.isInteger(samples) || samples < 1) {
  throw new Error("Warmups must be a non-negative integer and samples must be a positive integer");
}

const manifest = JSON.parse(await readFile(resolve(configPath), "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.workloads) || !manifest.workloads.length) {
  throw new Error("Manifest must have version: 1 and a non-empty workloads array");
}
const origin = new URL(baseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(origin.hostname) && process.env.ALLOW_NONLOCAL_API !== "1") {
  throw new Error("Refusing non-local API_BASE_URL; set ALLOW_NONLOCAL_API=1 only for an authorized isolated test environment");
}

const rows = [];
for (const workload of manifest.workloads) {
  if (!workload.name || !workload.method || !workload.path) throw new Error("Every workload needs name, method, and path");
  const method = workload.method.toUpperCase();
  const isMutation = !["GET", "HEAD"].includes(method);
  if (isMutation && (process.env.PERFORMANCE_ALLOW_MUTATIONS !== "1" || !workload.safeToRepeat)) {
    throw new Error(`${workload.name}: mutating workload requires PERFORMANCE_ALLOW_MUTATIONS=1 and safeToRepeat: true`);
  }
  const renderedPath = workload.path.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_match, name) => {
    const value = process.env[name];
    if (!value) throw new Error(`${workload.name}: missing ${name} path value`);
    return encodeURIComponent(value);
  });
  const url = new URL(renderedPath, origin);
  if (url.origin !== origin.origin) throw new Error(`${workload.name}: path must stay on API_BASE_URL origin`);
  for (let index = 0; index < warmups + samples; index += 1) {
    const measured = index >= warmups;
    const startedAt = new Date().toISOString();
    const start = performance.now();
    let status = null;
    let responseBytes = null;
    let expectedResult = null;
    let failure = null;
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(workload.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(workload.body ? { body: JSON.stringify(workload.body) } : {}),
        signal: AbortSignal.timeout(workload.timeoutMs ?? 15000),
      });
      status = response.status;
      const bytes = await response.arrayBuffer();
      responseBytes = bytes.byteLength;
      if (workload.expectedStatus && !workload.expectedStatus.includes(status)) {
        failure = `unexpected HTTP ${status}`;
      }
      if (workload.resultCountPointer) {
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        expectedResult = workload.resultCountPointer.split(".").reduce((value, key) => value?.[key], payload);
        if (expectedResult !== workload.expectedResultCount) {
          failure = `expected result count ${workload.expectedResultCount}, received ${expectedResult}`;
        }
      }
      if (!response.ok && !failure) failure = `HTTP ${status}`;
    } catch (error) {
      failure = error?.name === "TimeoutError" ? "timeout" : `${error?.name ?? "Error"}: ${error?.message ?? error}`;
    }
    const durationMs = performance.now() - start;
    rows.push({
      runId, profile, workload: workload.name, method, path: `${url.pathname}${url.search}`,
      phase: measured ? "measured" : "warmup", sampleIndex: measured ? index - warmups + 1 : index + 1,
      startedAtUtc: startedAt, durationMs: Number(durationMs.toFixed(3)), status,
      responseBytes, expectedResult, failure,
    });
  }
}

const quantile = (values, fraction) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)];
const summaries = manifest.workloads.map(({ name }) => {
  const measured = rows.filter((row) => row.workload === name && row.phase === "measured");
  const successes = measured.filter((row) => !row.failure).map((row) => row.durationMs).sort((a, b) => a - b);
  return {
    workload: name,
    samples: measured.length,
    successes: successes.length,
    failuresOrTimeouts: measured.length - successes.length,
    medianMs: successes.length ? quantile(successes, 0.5) : null,
    p95Ms: successes.length ? quantile(successes, 0.95) : null,
    minMs: successes.length ? successes[0] : null,
    maxMs: successes.length ? successes.at(-1) : null,
  };
});
const report = {
  schemaVersion: 1,
  createdAtUtc: new Date().toISOString(),
  runId,
  profile,
  baseOrigin: origin.origin,
  measurement: "API client request duration using performance.now(); includes local network and response body download, excludes browser rendering and server-only time",
  connectionSetup: "Not isolated; fetch connection reuse is uncontrolled",
  warmups,
  requestedSamplesPerWorkload: samples,
  outlierPolicy: "No outliers excluded; raw rows are retained",
  fixture: manifest.fixture ?? null,
  rows,
  summaries,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ outputPath, summaries }, null, 2));
if (summaries.some((summary) => summary.failuresOrTimeouts > 0)) process.exitCode = 1;
