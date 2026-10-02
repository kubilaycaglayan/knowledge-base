import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { createServer } from "vite";
import { chromium } from "playwright";

let server, browser;
before(async () => {
  server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await server?.close(); });

for (const width of [390, 1440, 2880]) {
  it(`label history scroll ends at visible content at ${width}px`, async (t) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    t.after(() => context.close());
    await context.addInitScript(() => localStorage.setItem("know_token", "label-history-fixture"));
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
      let body = [];
      if (path === "/labels") body = [{ id: "study", name: "Study", color: "#2878D5", scopes: ["TIME_ENTRY"] }];
      if (path === "/timers/current") body = null;
      if (path === "/labels/study/history/records") {
        const kind = new URL(route.request().url()).searchParams.get("kind");
        body = { items: [
          { id: "one", date: kind === "dates" ? "2026-05-02" : "2026-05-02T14:00:00Z", title: kind === "notes" ? "What I learned" : "Reading and reflecting on the week", preview: "A few ideas to revisit in the next study session." },
          { id: "two", date: kind === "dates" ? "2026-05-01" : "2026-05-01T09:00:00Z", title: "Exploring a new topic and collecting useful references", preview: "" },
        ], hasMore: false };
      }
      if (path === "/labels/study/history") body = {
        labelId: "study", name: "Study", color: "#2878D5",
        firstUsedAt: "2026-01-20T00:00:00Z", lastUsedAt: "2026-05-02T14:00:00Z",
        totalUses: 6, trackedSeconds: 9000,
        uses: { sessions: 2, logs: 1, notes: 1, calendarDays: 2, cards: 0 },
        timeline: [{ month: "2026-05", uses: 6, trackedSeconds: 9000 }],
        hours: Array.from({ length: 24 }, (_, hour) => ({ hour, uses: 1, trackedSeconds: 375 })),
        related: [{ id: "reading", name: "Reading", color: "#2878D5", together: 3, trackedSeconds: 5400 }],
      };
      await route.fulfill({ json: body });
    });
    const page = await context.newPage();
    await page.goto(server.resolvedUrls.local[0] + "labels");
    await page.getByRole("button", { name: "Show history of Study" }).click();
    await page.locator(".history-related").waitFor();
    await page.locator(".records-body li").first().waitFor();
    const dialog = page.locator(".label-history-dialog");
    const geometry = await dialog.evaluate((el) => {
      const last = el.querySelector(".history-records");
      return {
        scrollHeight: el.scrollHeight,
        contentEnd: last.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop - el.clientTop + parseFloat(getComputedStyle(el).paddingBottom),
      };
    });
    await page.getByRole("button", { name: "Notes 1", exact: true }).click();
    await page.getByText("What I learned", { exact: true }).waitFor();
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false);
    if (process.env.LABEL_HISTORY_SCREENSHOTS) await page.screenshot({ path: `/tmp/label-history-${width}.png` });
    assert.ok(geometry.scrollHeight <= Math.ceil(geometry.contentEnd) + 1, JSON.stringify(geometry));
    assert.equal(await dialog.locator(".history-hours table tbody tr").count(), 24);
  });
}
