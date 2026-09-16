import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

// Reference-only fixtures: never send credentials to a live API or Google.
const out = mkdtempSync(join(tmpdir(), "knowledge-base-auth-"));
const server = await createServer({
  server: { host: "127.0.0.1", port: 5192, strictPort: true },
});
await server.listen();
const browser = await chromium.launch();
const results = [];
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await context.route("https://accounts.google.com/**", (route) =>
      route.abort(),
    );
    let submissions = 0;
    await context.route("**/api/**", (route) => {
      submissions++;
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: '{"message":"Invalid credentials"}',
      });
    });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5192/");
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    for (const width of [320, 390, 430, 1440, 2560]) {
      await page.setViewportSize({ width, height: 932 });
      for (const registration of [false, true]) {
        if (registration)
          await page
            .getByRole("button", {
              name: "New here? Create an account",
              exact: true,
            })
            .click();
        const label = `${theme}-${width}-${registration ? "register" : "login"}`;
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          label,
        );
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          audit.violations.map((v) => v.id),
          [],
          label,
        );
        await page.screenshot({
          path: join(out, `${label}.png`),
          fullPage: true,
        });
        results.push(label);
        if (registration)
          await page
            .getByRole("button", {
              name: "Already have an account? Sign in",
              exact: true,
            })
            .click();
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    assert.equal(submissions, 0);
    assert.equal(
      await page
        .getByLabel("Email", { exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page
      .getByLabel("Email", { exact: true })
      .fill("fixture@example.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture-password");
    await page
      .getByRole("button", { name: "New here? Create an account", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Password", { exact: true }).inputValue(),
      "fixture-password",
    );
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("fixture-password");
    await page.getByLabel("Password", { exact: true }).press("Enter");
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page.getByRole("alert").innerText(),
      "Could not authenticate. Use a valid email and a password of at least 9 characters.",
    );
    assert.equal(submissions, 1);
    assert.equal(
      await page.getByLabel("Password", { exact: true }).inputValue(),
      "fixture-password",
    );
    await page.screenshot({
      path: join(out, `${theme}-rejected-registration.png`),
      fullPage: true,
    });
    // Browser text enlargement approximates large text; native Dynamic Type is a separate gate.
    await page.addStyleTag({
      content:
        "h1 { font-size: 52px } p, label, input, button { font-size: 26px !important }",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: join(out, `${theme}-large-text.png`),
      fullPage: true,
    });
    await context.close();
  }
  console.log(
    `Passed ${results.length} themed layout/accessibility audits and form behavior checks.`,
  );
} finally {
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  console.log(`Auth reference evidence: ${out}`);
  await browser.close();
  await server.close();
}
