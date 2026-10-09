import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium } from "playwright";

const baseUrl = process.env.AUTH_RATE_LIMIT_E2E_BASE_URL;
if (!baseUrl) throw new Error("AUTH_RATE_LIMIT_E2E_BASE_URL is required");

const mobileProfile = process.env.BROWSER_PROFILE === "iphone";
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
});
after(async () => browser?.close());

async function login(email, password) {
  return fetch(new URL("/api/v1/auth/login", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe(`authentication rate-limit feedback (${mobileProfile ? "mobile-size Chromium" : "desktop Chromium"})`, () => {
  it("shows the accessible 429 message and lets the user correct the email and retry", async () => {
    const suffix = crypto.randomUUID();
    const knownEmail = `auth-limit-known-${suffix}@example.invalid`;
    const unknownEmail = `auth-limit-unknown-${suffix}@example.invalid`;
    const correctedEmail = `auth-limit-corrected-${suffix}@example.invalid`;
    const password = `Auth-e2e-${suffix}`;

    const registration = await fetch(new URL("/api/v1/auth/register", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: knownEmail, password }),
    });
    assert.equal(registration.status, 200, "disposable local account registration succeeds");

    for (let attempt = 0; attempt < 9; attempt++) {
      const response = await login(knownEmail, "wrong-password");
      assert.equal(response.status, 401, `known account attempt ${attempt + 1} remains an auth failure`);
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await login(unknownEmail, "wrong-password");
      assert.equal(response.status, 401, `unknown account attempt ${attempt + 1} remains an auth failure`);
    }
    const unknownBlocked = await login(unknownEmail, "wrong-password");
    assert.equal(unknownBlocked.status, 429);
    const unknownBody = await unknownBlocked.json();

    const context = await browser.newContext({
      viewport: mobileProfile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      ...(mobileProfile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      await page.goto(baseUrl);
      await page.getByRole("heading", { name: "Sign in" }).waitFor();
      await page.getByRole("textbox", { name: "Email" }).fill(knownEmail);
      await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
      const blockedResponsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/v1/auth/login",
      );
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const blockedResponse = await blockedResponsePromise;
      assert.equal(blockedResponse.status(), 429);
      const knownBody = await blockedResponse.json();
      assert.deepEqual(knownBody, unknownBody, "the 429 body is the same for known and unknown emails");

      const alert = page.getByRole("alert");
      await alert.waitFor();
      assert.match(await alert.innerText(), /Could not authenticate/);
      const retry = page.getByRole("button", { name: "Try again" });
      await retry.waitFor();
      await page.getByRole("textbox", { name: "Email" }).fill(correctedEmail);
      const retryResponsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/v1/auth/login",
      );
      await retry.click();
      assert.equal((await retryResponsePromise).status(), 401);
      assert.equal(await page.getByRole("textbox", { name: "Email" }).inputValue(), correctedEmail);
      assert.equal(await retry.isEnabled(), true);
    } finally {
      await context.close();
    }
  });
});
