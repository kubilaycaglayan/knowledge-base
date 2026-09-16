import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

// Reproducible mobile web reference with synthetic data; never touches an account.
const out = mkdtempSync(join(tmpdir(), "knowledge-base-sessions-web-"));
const server = await createServer({
  server: { host: "127.0.0.1", port: 5193, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme,
    });
    await context.addInitScript(() =>
      localStorage.setItem("know_token", "synthetic-reference"),
    );
    await context.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        "/api/v1",
        "",
      );
      const fixtures = {
        "/paths": [
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Distributed systems",
            status: "ACTIVE",
            color: "#2188FF",
          },
        ],
        "/labels": [
          {
            id: "00000000-0000-4000-8000-000000000002",
            name: "Study day",
            color: "#2878D5",
            scopes: ["TIME_ENTRY"],
          },
        ],
        "/timers/current": null,
        "/time-entries": {
          sessions: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              pathId: "00000000-0000-4000-8000-000000000001",
              labelIds: ["00000000-0000-4000-8000-000000000002"],
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              durationSeconds: 3600,
              description: "Replication and consistency models",
              source: "WEB",
              running: false,
            },
          ],
          page: 0,
          totalPages: 1,
          totalSessions: 1,
        },
      };
      const data = Object.hasOwn(fixtures, path) ? fixtures[path] : [];
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5193/sessions");
    await page
      .getByText("Replication and consistency models", { exact: true })
      .waitFor();
    await page.screenshot({
      path: join(out, `${colorScheme}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Edit session", exact: true })
      .click();
    await page.screenshot({
      path: join(out, `${colorScheme}-edit.png`),
      fullPage: true,
    });
    await context.close();
  }
  console.log(out);
} finally {
  await browser.close();
  await server.close();
}
