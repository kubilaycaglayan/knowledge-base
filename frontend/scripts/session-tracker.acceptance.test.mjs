import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));

// Real controls and browser layout, isolated API fixtures; no account or backend writes.
const screenshots = mkdtempSync(
  join(tmpdir(), "knowledge-base-tracker-acceptance-"),
);
let server, browser;
before(async () => {
  server = await createServer({
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || undefined,
    headless: true,
  });
});
after(async () => {
  await browser?.close();
  await server?.close();
  console.log(`Tracker screenshots: ${screenshots}`);
});

async function fixture(
  t,
  { width = 1440, mode = "light", empty = false, long = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    colorScheme: mode,
    reducedMotion: "reduce",
  });
  context.setDefaultTimeout(5000);
  t.after(() => context.close());
  await context.addInitScript((mode) => {
    localStorage.setItem("know_token", "isolated-tracker-fixture");
    localStorage.setItem("knowledge-base-theme", mode);
  }, mode);
  const paths = [
    {
      id: "study",
      name: long ? "LongPath".repeat(60) : "Study",
      status: "ACTIVE",
    },
    { id: "archived", name: "Archived", status: "ARCHIVED" },
  ];
  const labels = empty
    ? []
    : Array.from({ length: 12 }, (_, i) => ({
        id: `label-${i}`,
        name: long && i === 0 ? "LongLabel".repeat(55) : `Label ${i + 1}`,
        scopes: ["TIME_ENTRY"],
      }));
  const writes = [];
  let draft = { pathId: null, labelIds: [], description: null };
  await context.route("https://accounts.google.com/**", (route) =>
    route.abort(),
  );
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    let data = [];
    if (path === "/timers/draft") {
      if (request.method() === "PUT") draft = request.postDataJSON();
      data = draft;
    } else if (request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (path === "/paths") {
        data = { ...body, id: "created-path", status: "ACTIVE" };
        paths.push(data);
      }
      if (path === "/labels") {
        data = { ...body, id: "created-label" };
        labels.push(data);
      }
    } else {
      if (path === "/paths") data = paths;
      if (path === "/labels") data = labels;
      if (path === "/timers/current") data = null;
      if (path === "/time-entries")
        data = { sessions: [], page: 0, totalPages: 0, totalSessions: 0 };
      if (path === "/auth/config") data = { googleClientId: null };
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  const page = await context.newPage();
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/sessions`,
  );
  await page
    .locator(".tracker-field-heading")
    .getByText(`${labels.length} available`, { exact: true })
    .waitFor();
  return { page, paths, labels, writes };
}
async function expanded(page, value) {
  await page.waitForFunction(
    (value) =>
      document
        .querySelector(".label-picker-toggle")
        ?.getAttribute("aria-expanded") === String(value),
    value,
  );
}
async function extensionFixture(t, width = 360) {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  context.setDefaultTimeout(5000);
  t.after(() => context.close());
  const paths = [
    { id: "study", name: "Study", status: "ACTIVE" },
    { id: "archived", name: "Archived", status: "ARCHIVED" },
  ];
  const labels = Array.from({ length: 8 }, (_, i) => ({
    id: `label-${i}`,
    name: i === 0 ? "LongLabel".repeat(8) : `Label ${i + 1}`,
    scopes: ["TIME_ENTRY"],
  }));
  let draft = { pathId: null, labelIds: [], description: null };
  const writes = [];
  await context.addInitScript(() => {
    const state = { token: "isolated" };
    window.chrome = {
      storage: {
        local: {
          async get(keys) {
            const names = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(names.map((key) => [key, state[key]]));
          },
          async set(values) {
            Object.assign(state, values);
          },
          async remove(keys) {
            for (const key of Array.isArray(keys) ? keys : [keys])
              delete state[key];
          },
        },
      },
      runtime: {
        getManifest: () => ({ version: "test" }),
        openOptionsPage() {},
      },
    };
    window.WebSocket = class {
      close() {}
      send() {}
    };
  });
  const html = readFileSync(
    `${repo}/chrome-extension/entrypoints/popup/index.html`,
    "utf8",
  )
    .replace('<script type="module" src="./main.js"></script>', "")
    .replace(
      "</head>",
      `<style>${readFileSync(`${repo}/chrome-extension/popup.css`, "utf8")}</style></head>`,
    );
  const page = await context.newPage();
  await page.setContent(html);
  await page.evaluate(readFileSync(`${repo}/chrome-extension/core.js`, "utf8"));
  await page.evaluate(() => {
    window.KnowApiConfig = {
      apiBase: (value) => value || "http://localhost:8080/api/v1",
    };
    window.KnowGoogleAuth = {};
    window.KnowClockifySettings = {
      KEY: "clockifyImportEnabled",
      isEnabled: (value) => value !== false,
    };
  });
  await page.evaluate(
    ({ paths, labels }) => {
      window.__writes = [];
      window.fetch = async (url, options = {}) => {
        const parsed = new URL(url);
        const path = parsed.pathname.replace("/api/v1", "") + parsed.search;
        if (["POST", "PUT", "DELETE"].includes(options.method))
          window.__writes.push({
            path,
            body: options.body ? JSON.parse(options.body) : null,
          });
        let data = [];
        if (path === "/paths") data = paths;
        if (path === "/labels?scope=TIME_ENTRY") data = labels;
        if (path === "/labels" && options.method === "POST") {
          data = {
            ...JSON.parse(options.body),
            id: `created-${labels.length}`,
          };
          labels.push(data);
        }
        if (path === "/timers/current") data = null;
        if (path === "/timers/draft" && options.method === "PUT")
          data = window.__draft = JSON.parse(options.body);
        if (path === "/timers/draft") data = window.__draft || {};
        if (path.startsWith("/time-entries"))
          data = { sessions: [], page: 0, totalPages: 0, totalSessions: 0 };
        return {
          ok: true,
          status: 200,
          url,
          redirected: false,
          headers: { get: () => "application/json" },
          text: async () => JSON.stringify(data),
        };
      };
    },
    { paths, labels },
  );
  await page.addScriptTag({ path: `${repo}/chrome-extension/popup.js` });
  try {
    await page.locator("#workspace:not([hidden])").waitFor();
  } catch {
    throw new Error(
      `Chrome popup did not load: ${await page.locator("#error").textContent()}`,
    );
  }
  return { page, paths, labels };
}
const chips = (page) => page.locator("#tt-label-options button");
const toggle = (page) => page.locator(".label-picker-toggle");

describe("web session tracker acceptance", () => {
  it("P4–P10, V1/V3: opens the actual menu, renders its separator, selects by keyboard, and creates a path", async (t) => {
    const { page, writes } = await fixture(t);
    const path = page.getByRole("combobox", { name: "Timer path" });
    await path.focus();
    await path.press("ArrowDown");
    const menu = page.locator(".tracker-path-menu");
    await menu.waitFor({ state: "visible" });
    assert.deepEqual(await menu.getByRole("option").allTextContents(), [
      "＋ Add a new path…",
      "Study",
    ]);
    const separator = menu.getByRole("separator");
    assert.equal(await separator.count(), 1);
    assert.ok(await separator.isVisible());
    assert.ok(
      await separator.evaluate(
        (el) =>
          el.previousElementSibling?.textContent.includes("Add a new path") &&
          el.nextElementSibling?.textContent.includes("Study"),
      ),
    );
    assert.ok((await separator.boundingBox()).height >= 1);
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    await path.focus();
    await path.press("ArrowDown");
    await menu.getByRole("option", { name: "Study" }).focus();
    await page.keyboard.press("Enter");
    await menu.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () =>
        document.querySelector(".tracker-path-select .v-select__selection-text")
          ?.textContent === "Study",
    );
    await page.locator(".tracker-path-select .v-field").click();
    await menu.getByRole("option", { name: "＋ Add a new path…" }).click();
    await page
      .getByRole("textbox", { name: "New path name", exact: true })
      .fill("  New study  ");
    await page
      .getByRole("textbox", { name: "New path name", exact: true })
      .press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector(".tracker-path-select .v-select__selection-text")
          ?.textContent === "New study",
    );
    assert.equal(
      writes.find((write) => write.path === "/paths").body.name,
      "New study",
    );
  });

  it("L2–L18: keyboard selection, unselection, counts, compact priority, wrapping, and dismissal", async (t) => {
    const { page } = await fixture(t);
    const picker = page.locator(".label-picker");
    const closedHeight = (await picker.boundingBox()).height;
    await chips(page).first().focus();
    await page.keyboard.press("Space");
    await expanded(page, true);
    await chips(page).nth(4).focus();
    await page.keyboard.press("Enter");
    await page
      .locator(".tracker-field-heading")
      .getByText("12 available · 2 selected", { exact: true })
      .waitFor();
    assert.equal(await chips(page).nth(0).getAttribute("aria-pressed"), "true");
    assert.equal(await chips(page).nth(4).getAttribute("aria-pressed"), "true");
    assert.equal(
      await page.locator(".tracker-field-heading > span").textContent(),
      "12 available · 2 selected",
    );
    const rows = await chips(page).evaluateAll((elements) =>
      elements.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    assert.ok(new Set(rows).size > 1, "expanded labels wrap");
    assert.ok(
      new Set(rows).size < rows.length,
      "multiple chips share each row",
    );
    await page.keyboard.press("Escape");
    await expanded(page, false);
    assert.ok(
      await toggle(page).evaluate((el) => el === document.activeElement),
    );
    assert.equal((await picker.boundingBox()).height, closedHeight);
    assert.deepEqual((await chips(page).allTextContents()).slice(0, 3), [
      "Label 1×",
      "Label 5×",
      "Label 2",
    ]);
    const closedRows = await chips(page).evaluateAll((elements) =>
      elements
        .slice(0, 3)
        .map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    assert.equal(
      new Set(closedRows).size,
      1,
      "selected labels lead the single visible row, followed by an available label",
    );
    await chips(page).first().focus();
    await page.keyboard.press("Enter");
    await expanded(page, true);
    assert.equal(
      await chips(page).nth(0).getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(await chips(page).nth(4).getAttribute("aria-pressed"), "true");
    await toggle(page).focus();
    await page.keyboard.press("Tab");
    await expanded(page, false);
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    await expanded(page, true);
    await page.getByRole("textbox", { name: "Timer description" }).click();
    await expanded(page, false);
  });

  for (const mode of ["light", "dark"])
    for (const width of [390, 1440, 2560]) {
      it(`P1–P3, L1–L5/L13, C3–C4: ${mode} ${width}px layout, long names, targets, and accessibility`, async (t) => {
        const { page } = await fixture(t, { width, mode, long: true });
        const field = page.locator(".tracker-path-select .v-field");
        const picker = page.locator(".label-picker");
        const pathStyle = await field.evaluate((el) => getComputedStyle(el));
        const labelStyle = await picker.evaluate((el) => getComputedStyle(el));
        assert.equal(pathStyle.borderRadius, labelStyle.borderRadius);
        assert.equal(pathStyle.backgroundColor, labelStyle.backgroundColor);
        assert.equal(
          await picker
            .locator("button")
            .first()
            .evaluate((el) => getComputedStyle(el).borderRadius),
          "4px",
        );
        if (width > 640)
          assert.ok(
            Math.abs(
              (await field.boundingBox()).height -
                (await picker.boundingBox()).height,
            ) <= 1,
            "path and labels have equal height",
          );
        await field.click();
        await page.locator(".tracker-path-menu .v-list-item").nth(1).click();
        await page.locator(".tracker-path-menu").waitFor({ state: "hidden" });
        const alignment = await page
          .locator(".tracker-path-select .v-select__selection")
          .evaluate((el) => {
            const text = el.getBoundingClientRect(),
              control = el.closest(".v-field").getBoundingClientRect();
            return {
              centered: Math.abs(
                text.y + text.height / 2 - control.y - control.height / 2,
              ),
              withinField: text.right <= control.right + 1,
              withinTracker:
                control.right <=
                el.closest(".tracker-field").getBoundingClientRect().right + 1,
            };
          });
        assert.ok(
          alignment.centered <= 2,
          `selected path vertically centered (${alignment.centered}px)`,
        );
        assert.ok(
          alignment.withinField && alignment.withinTracker,
          `long path fits control and tracker field: ${JSON.stringify(alignment)}`,
        );
        await toggle(page).click();
        await expanded(page, true);
        assert.equal(
          await page
            .locator(".label-picker-options")
            .evaluate((el) => getComputedStyle(el).display),
          "flex",
        );
        for (const selector of [
          "#tt-label-options button",
          ".label-picker-toggle",
          ".create-label",
          ".tracker-path-select .v-field",
        ]) {
          const boxes = await page.locator(selector).evaluateAll((elements) =>
            elements.map((el) => ({
              width: el.getBoundingClientRect().width,
              height: el.getBoundingClientRect().height,
            })),
          );
          const minimum = width <= 640 ? 44 : 24;
          assert.ok(
            boxes.every((box) => box.width >= minimum && box.height >= minimum),
            `${selector}: ${minimum}px targets`,
          );
        }
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "no horizontal page overflow",
        );
        assert.ok(
          await chips(page)
            .first()
            .evaluate(
              (el) =>
                el.getBoundingClientRect().right <=
                el.closest(".label-picker").getBoundingClientRect().right,
            ),
          "long chip stays inside picker",
        );
        const axe = await new AxeBuilder({ page })
          .include(".floating-tracker")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          axe.violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          })),
          [],
        );
        await page.screenshot({
          path: join(screenshots, `web-${mode}-${width}-expanded.png`),
          fullPage: true,
        });
        await toggle(page).click();
        await page.screenshot({
          path: join(screenshots, `web-${mode}-${width}-compact.png`),
          fullPage: true,
        });
      });
    }

  it("C4, L16–L17: recovers from no labels by creating and selecting the first label", async (t) => {
    const { page, writes } = await fixture(t, { empty: true, width: 390 });
    await page
      .getByRole("textbox", { name: "New session label name" })
      .fill("First label");
    await page.getByRole("button", { name: "Create label" }).click();
    await page
      .locator(".tracker-field-heading")
      .getByText("1 available · 1 selected", { exact: true })
      .waitFor();
    assert.equal(
      await chips(page).first().getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(
      writes.find((write) => write.path === "/labels").body.scopes,
      ["TIME_ENTRY"],
    );
  });

  it("extension P4–P10, L3–L18 and C1/C3: drives compact picker, path menu and label creation at popup touch size", async (t) => {
    const { page, paths } = await extensionFixture(t, 360);
    const path = page.locator("#path");
    assert.deepEqual(await path.locator("option").allTextContents(), [
      "＋ Add a new path…",
      "────────",
      "Study",
    ]);
    assert.equal(await path.locator("option:disabled").count(), 1);
    await path.selectOption("study");
    assert.equal(await path.inputValue(), "study");
    assert.equal(
      await path.evaluate((el) => el.options[el.selectedIndex].textContent),
      "Study",
    );
    const picker = page.locator("#labels-picker");
    const labelButtons = () => page.locator("#selected-labels button");
    const labelToggle = page.locator("#labels-toggle");
    assert.ok(
      Math.abs(
        (await path.boundingBox()).height - (await picker.boundingBox()).height,
      ) <= 1,
      "path and labels controls have the same height",
    );
    assert.equal(
      await page.locator("#labels-summary").textContent(),
      "8 available",
    );
    await labelButtons().first().focus();
    await page.keyboard.press("Enter");
    assert.equal(await labelToggle.getAttribute("aria-expanded"), "true");
    assert.equal(
      await page.locator("#labels-summary").textContent(),
      "8 available · 1 selected",
    );
    await labelButtons().nth(2).click();
    assert.equal(
      await labelButtons().nth(0).getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await labelButtons().nth(2).getAttribute("aria-pressed"),
      "true",
    );
    await labelToggle.focus();
    await page.keyboard.press("Enter");
    assert.deepEqual((await labelButtons().allTextContents()).slice(0, 3), [
      "LongLabelLongLabelLongLabelLongLabelLongLabelLongLabelLongLabelLongLabel×",
      "Label 3×",
      "Label 2",
    ]);
    await page.keyboard.press("Escape");
    assert.equal(await labelToggle.getAttribute("aria-expanded"), "false");
    await labelToggle.click();
    await page.locator("#description").click();
    assert.equal(await labelToggle.getAttribute("aria-expanded"), "false");
    await page.locator("#new-label").fill("Review");
    await page.locator("#create-label").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#labels-summary")?.textContent ===
        "9 available · 3 selected",
    );
    assert.ok(
      await page.evaluate(() =>
        window.__writes.some(
          (write) => write.path === "/labels" && write.body.name === "Review",
        ),
      ),
    );
    assert.deepEqual(
      paths.map((item) => item.status),
      ["ACTIVE", "ARCHIVED"],
    );
    assert.ok(
      await labelToggle.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44;
      }),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: join(screenshots, "extension-mobile-labels.png"),
      fullPage: true,
    });
    const axe = await new AxeBuilder({ page })
      .include("#workspace")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      axe.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
      [],
    );
    await picker.waitFor();
  });
});
