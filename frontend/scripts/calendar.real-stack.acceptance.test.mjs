import assert from "node:assert/strict";
import { chromium } from "playwright";
import { after, before, it } from "node:test";

const baseUrl = process.env.CALENDAR_E2E_BASE_URL;
const email = process.env.CALENDAR_E2E_EMAIL;
const password = process.env.CALENDAR_E2E_PASSWORD;
if (!baseUrl || !email || !password) throw new Error("CALENDAR_E2E_BASE_URL, CALENDAR_E2E_EMAIL, and CALENDAR_E2E_PASSWORD are required");

const marker = `CalendarJourney-${Date.now()}`;
let browser;
let page;

async function api(date) {
  return page.evaluate(async (date) => {
    const response = await fetch(`/api/v1/calendar/days?startDate=${date}&endDate=${date}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("know_token")}` },
    });
    return { status: response.status, data: await response.json() };
  }, date);
}

async function waitForDay(date, expectedNote) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await api(date);
    const saved = result.data.find((day) => day.date === date);
    if (result.status === 200 && (expectedNote === null ? !saved : saved?.note === expectedNote)) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Calendar day ${date} did not reach its expected persisted state`);
}

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  context.setDefaultTimeout(10000);
  page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: /New here\? Create an account/ }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("know_token")));
});

after(async () => browser?.close());

it("creates, edits, clears, and reloads a Calendar day note with persisted API state", async () => {
  const date = new Date();
  date.setDate(15);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  let releaseDayRead;
  let signalDayRead;
  let dayReadBlocked = false;
  const dayReadStarted = new Promise((resolve) => { signalDayRead = resolve; });
  const dayReadGate = new Promise((resolve) => { releaseDayRead = resolve; });
  await page.route(/\/api\/v1\/calendar\/days\?/, async (route) => {
    if (route.request().method() === "GET" && !dayReadBlocked) {
      dayReadBlocked = true;
      signalDayRead();
      await dayReadGate;
    }
    await route.continue();
  });
  await page.goto(`${baseUrl}/calendar?date=${day}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Calendar" }).waitFor();
  await dayReadStarted;
  const note = page.getByRole("textbox", { name: "Note" });
  const noteDisabledDuringLoad = await note.isDisabled();
  const loadingStatusCount = await page.getByRole("status").filter({ hasText: "Loading calendar records…" }).count();
  releaseDayRead();
  assert.equal(noteDisabledDuringLoad, true, "the Calendar note stays unavailable until the selected range loads");
  assert.equal(loadingStatusCount, 1, "the user can tell that Calendar data is loading");
  await page.waitForFunction(() => !document.querySelector(".day-editor textarea")?.disabled);

  const firstNote = `${marker} first day note`;
  await note.fill(firstNote);
  await page.getByRole("button", { name: "Save day" }).click();
  let savedDays = await waitForDay(day, firstNote);
  assert.equal(savedDays.status, 200);
  assert.equal(savedDays.data.find((saved) => saved.date === day)?.note, firstNote);
  assert.equal(new URL(page.url()).searchParams.get("date"), day);

  const editedNote = `${marker} edited day note`;
  await note.fill(editedNote);
  await page.getByRole("button", { name: "Save day" }).click();
  savedDays = await waitForDay(day, editedNote);
  assert.equal(savedDays.data.find((saved) => saved.date === day)?.note, editedNote);
  await page.reload();
  await page.getByRole("textbox", { name: "Note" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Note" }).inputValue(), editedNote);

  await page.getByRole("textbox", { name: "Note" }).fill("");
  await page.getByRole("button", { name: "Save day" }).click();
  savedDays = await waitForDay(day, null);
  assert.equal(savedDays.data.some((saved) => saved.date === day), false);
  await page.reload();
  assert.equal(await page.getByRole("textbox", { name: "Note" }).inputValue(), "");
});
