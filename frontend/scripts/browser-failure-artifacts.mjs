import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const safePath = (value) => {
  const url = new URL(value);
  return `${url.pathname}${url.search ? `?${[...url.searchParams.keys()].sort().join("&")}` : ""}`;
};

const traceScrubber = fileURLToPath(new URL("./scrub-playwright-trace.py", import.meta.url));

export function scrubPlaywrightTrace(tracePath) {
  execFileSync("python3", [traceScrubber, tracePath], { stdio: "ignore" });
}

export function browserFailureArtifacts({ directory, engine, profile }) {
  const outputDirectory = resolve(directory);
  let active;

  async function addContext(context) {
    if (!active || active.contexts.has(context)) return;
    active.contexts.add(context);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    context.on("page", (page) => attachPage(page));
    for (const page of context.pages()) attachPage(page);
  }

  function attachPage(page) {
    if (!active || active.pages.has(page)) return;
    const session = active;
    session.pages.add(page);
    page.on("requestfailed", (request) => {
      session.failures.push({ kind: "requestfailed", method: request.method(), path: safePath(request.url()) });
    });
    page.on("response", (response) => {
      if (response.status() >= 400) session.failures.push({ kind: "http", status: response.status(), method: response.request().method(), path: safePath(response.url()) });
    });
  }

  return {
    async begin(testName, contexts = []) {
      active = { testName, contexts: new Set(), pages: new Set(), failures: [] };
      for (const context of contexts) if (context) await addContext(context);
    },
    addContext,
    async end(error) {
      if (!active) return;
      const current = active;
      active = null;
      let sequence = 0;
      if (error) mkdirSync(outputDirectory, { recursive: true });
      for (const context of current.contexts) {
        if (error) {
          for (const page of context.pages()) {
            sequence += 1;
            try { await page.screenshot({ path: join(outputDirectory, `${sequence}-${Date.now()}-failure.png`), fullPage: true }); } catch { /* retain trace if a page closed */ }
          }
          const tracePath = join(outputDirectory, `${sequence || 1}-${Date.now()}-failure.zip`);
          try {
            await context.tracing.stop({ path: tracePath });
            try {
              scrubPlaywrightTrace(tracePath);
            } catch (error) {
              rmSync(tracePath, { force: true });
              throw new Error("Playwright trace scrub failed; the unsanitized trace was removed.", { cause: error });
            }
          } catch { /* a closed context may have stopped tracing */ }
        } else {
          try { await context.tracing.stop(); } catch { /* a test may have closed the context */ }
        }
      }
      if (error) {
        const stem = `${Date.now()}-${current.testName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64)}`;
        writeFileSync(join(outputDirectory, `${stem}-diagnostics.json`), JSON.stringify({
          test: current.testName,
          engine,
          profile,
          capturedAt: new Date().toISOString(),
          failureName: error.name || "Error",
          requests: current.failures,
        }, null, 2));
      }
    },
  };
}
