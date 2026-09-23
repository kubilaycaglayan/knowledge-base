import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";
import { chromium } from "playwright";

let server, browser;
before(async () => { server = await createServer({ server: { host: "127.0.0.1", port: 0 } }); await server.listen(); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await server?.close(); });

async function labelsPage(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  t.after(() => context.close());
  const labels = [{ id: "label-1", name: "Study", color: "#2878D5", scopes: ["NOTE", "BOARD"] }];
  await context.addInitScript(() => localStorage.setItem("know_token", "labels-test-token"));
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const body = path === "/labels" ? labels : path === "/timers/current" ? null : path === "/timers/draft" ? {} : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/labels`);
  await page.locator(".label-row", { hasText: "Study" }).waitFor();
  return page;
}

describe("labels page", () => {
  it("keeps the scope names unselectable while their checkboxes still toggle", async (t) => {
    const page = await labelsPage(t);
    await page.locator(".label-row", { hasText: "Study" }).getByRole("button", { name: "Edit" }).click();
    const option = page.locator(".scope-editor label", { hasText: "Calendar" });
    await option.waitFor();
    assert.equal(await option.evaluate((element) => getComputedStyle(element).userSelect), "none", "Scope names cannot be selected");
    assert.equal(await option.locator("input").evaluate((input) => getComputedStyle(input).userSelect === "none"), true);
    const box = await option.boundingBox();
    await page.mouse.dblclick(box.x + box.width - 6, box.y + box.height / 2);
    assert.equal(await page.evaluate(() => String(window.getSelection())), "", "Double-clicking a scope name selects no text");
    await page.getByRole("button", { name: "Add label" }).click().catch(() => {});
    const createOption = page.locator(".scope-selector label").first();
    if (await createOption.count()) assert.equal(await createOption.evaluate((element) => getComputedStyle(element).userSelect), "none", "The create form's scope names too");
  });
});
