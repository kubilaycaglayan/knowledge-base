// Drives the note editor with line history on while Orca listens; run inside
// the scripts/orca image by scripts/run-line-history-orca.sh.
const { chromium } = require("playwright");
const { baseUrl, email, password } = { baseUrl: process.env.ORCA_BASE_URL, email: process.env.ORCA_EMAIL, password: process.env.ORCA_PASSWORD };
const doc = (...lines) => JSON.stringify({ type: "doc", content: lines.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) });

(async () => {
  const browser = await chromium.launch({ headless: false, args: ["--force-renderer-accessibility", "--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US", timezoneId: "UTC" })).newPage();
  const registered = await fetch(`${baseUrl}/api/v1/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!registered.ok) throw new Error(`register -> ${registered.status}`);
  await page.goto(`${baseUrl}/`);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
  const note = await page.evaluate(async (content) => {
    const response = await fetch("/api/v1/notes", { method: "POST", headers: { authorization: `Bearer ${localStorage.getItem("know_token")}`, "content-type": "application/json" }, body: JSON.stringify({ title: "Orca", content, contentText: "", tags: [] }) });
    return response.json();
  }, doc("Spoken first line", "Spoken second line"));
  await page.goto(`${baseUrl}/notes/${note.id}?lines=1`);
  await page.locator(".rich-editor .line-history-stamp time").first().waitFor();
  await page.waitForTimeout(1500);
  // Each step pauses so Orca can speak before the next one.
  await page.locator(".rich-editor p", { hasText: "Spoken first line" }).click();
  await page.waitForTimeout(2500);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(2500);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Fresh");
  await page.waitForTimeout(3000);
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
