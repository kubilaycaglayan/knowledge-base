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
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || undefined,
    headless: process.env.BROWSER_HEADLESS !== "false",
  });
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

async function request(path, method = "GET", body) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api/v1${path}`, { method, cache: "no-store", headers: {
      Authorization: `Bearer ${localStorage.getItem("know_token")}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }, { path, method, body });
}

async function openDay(date) {
  await page.goto(`${baseUrl}/calendar?date=${date}`);
  await page.waitForFunction(() => {
    const input = document.querySelector(".day-editor textarea");
    return input && !input.disabled;
  });
}

function dayButton(date, displayedMonth) {
  const first = new Date(`${displayedMonth}-01T00:00:00Z`);
  const gridStart = first.getTime() - ((first.getUTCDay() + 6) % 7) * 86400000;
  const index = (Date.parse(`${date}T00:00:00Z`) - gridStart) / 86400000;
  assert.ok(index >= 0 && index < 42, "the requested day belongs to the visible grid");
  return page.locator(".calendar-day").nth(index);
}

it("navigates month and year boundaries with aligned grid and controls", async () => {
  await openDay("2026-12-15");
  assert.equal(await page.getByRole("combobox", { name: "Calendar month", exact: true }).inputValue(), "11");
  assert.equal(await page.getByRole("combobox", { name: "Calendar year", exact: true }).inputValue(), "2026");
  assert.equal(await dayButton("2026-12-15", "2026-12").getAttribute("aria-pressed"), "true");
  for (const weekday of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    assert.equal(await page.locator(".calendar-weekday").filter({ hasText: weekday }).count(), 1);
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  assert.equal(await page.getByRole("combobox", { name: "Calendar month", exact: true }).inputValue(), "0");
  assert.equal(await page.getByRole("combobox", { name: "Calendar year", exact: true }).inputValue(), "2027");
  await page.getByRole("heading", { name: "Friday, January 1, 2027", exact: true }).waitFor();
  await page.getByRole("button", { name: "Previous month", exact: true }).click();
  await page.getByRole("heading", { name: "Tuesday, December 1, 2026", exact: true }).waitFor();
  await page.getByRole("combobox", { name: "Calendar month", exact: true }).selectOption("1");
  await page.getByRole("combobox", { name: "Calendar year", exact: true }).selectOption("2024");
  await page.getByRole("heading", { name: "Thursday, February 1, 2024", exact: true }).waitFor();
  assert.equal(await page.locator(".calendar-day:not(.muted)").count(), 29);
  await openDay("invalid-date");
  assert.equal(await page.locator(".calendar-day").count() >= 28, true);
  assert.equal(await page.getByRole("textbox", { name: "Note", exact: true }).isEnabled(), true);
});

it("retains a failed day-save draft and persists one successful retry", async () => {
  const date = "2026-09-17";
  await openDay(date);
  const note = page.getByRole("textbox", { name: "Note", exact: true });
  const draft = `${marker} recovered day draft`;
  await note.fill(draft);
  const endpoint = `**/api/v1/calendar/days/${date}`;
  await page.route(endpoint, async (route) => route.request().method() === "PUT"
    ? route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Injected save failure"}' })
    : route.continue());
  try {
    await page.getByRole("button", { name: "Save day", exact: true }).click();
    await page.getByText("Unable to save this day.", { exact: true }).waitFor();
    assert.equal(await note.inputValue(), draft);
    assert.equal((await api(date)).data.some((day) => day.date === date), false);
  } finally {
    await page.unroute(endpoint);
  }
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/calendar/days/${date}` && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save day", exact: true }).click();
  assert.equal((await saved).status(), 200);
  await openDay(date);
  assert.equal(await page.getByRole("textbox", { name: "Note", exact: true }).inputValue(), draft);
  const days = (await api(date)).data;
  assert.equal(days.filter((day) => day.date === date && day.note === draft).length, 1);
});

it("cancels range drafts and applies reversed keyboard ranges inclusively across leap and year boundaries", async () => {
  const name = `${marker} range allocation`;
  const label = await request("/labels", "POST", { name, color: "#2878D5", scopes: ["CALENDAR"] });
  assert.equal(label.status, 201);
  for (const dates of [
    ["2024-02-28", "2024-02-29", "2024-03-01"],
    ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"],
  ]) {
    const start = dates[0];
    const end = dates.at(-1);
    const month = start.slice(0, 7);
    const outside = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const readRange = () => request(`/calendar/days?startDate=${outside(start, -1)}&endDate=${outside(end, 1)}`);
    const selectRange = async () => {
      await page.getByRole("button", { name: "Start date range selection", exact: true }).click();
      await dayButton(end, month).press("Enter");
      await dayButton(start, month).press("Space");
      assert.equal(await page.locator(".calendar-day.in-range").count(), dates.length);
      await page.getByRole("button", { name: "Apply to range", exact: true }).waitFor();
    };
    await openDay(start);
    const before = (await readRange()).data;
    await selectRange();
    await page.getByRole("textbox", { name: "Note", exact: true }).fill(`${marker} cancelled range`);
    await page.getByRole("checkbox", { name, exact: true }).check();
    await page.getByRole("button", { name: "Cancel range", exact: true }).click();
    assert.deepEqual((await readRange()).data, before);
    await selectRange();
    await page.getByRole("checkbox", { name, exact: true }).check();
    await page.getByRole("combobox", { name: `${name} day portion`, exact: true }).selectOption("0.25");
    const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/calendar/days/range" && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Apply to range", exact: true }).click();
    assert.equal((await saved).status(), 200);
    const result = await readRange();
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.map((day) => day.date).sort(), dates);
    for (const day of result.data) {
      assert.equal(day.labels.length, 1);
      assert.equal(day.labels[0].labelId, label.data.id);
      assert.equal(day.labels[0].portion, 0.25);
    }
    await openDay(start);
    assert.equal(await page.getByRole("checkbox", { name, exact: true }).isChecked(), true);
    assert.equal(await page.getByRole("combobox", { name: `${name} day portion`, exact: true }).inputValue(), "0.25");
  }
});

it("creates a day label in the picker, changes its color, and removes only its assignment", async () => {
  const date = "2026-07-21";
  const name = `${marker} picker-created label`;
  await openDay(date);
  await page.getByRole("button", { name: "Open label picker", exact: true }).click();
  await page.getByRole("combobox", { name: "Add or create calendar label", exact: true }).fill(name);
  const created = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/labels" && response.request().method() === "POST");
  await page.getByRole("option", { name: `Create ${name}`, exact: true }).click();
  assert.equal((await created).status(), 201);
  await page.getByRole("checkbox", { name, exact: true }).waitFor();
  await page.keyboard.press("Escape");
  const label = (await request("/labels")).data.find((entry) => entry.name === name);
  assert.ok(label.scopes.includes("CALENDAR"));
  assert.equal(await page.getByRole("checkbox", { name, exact: true }).isChecked(), true);
  await page.getByRole("combobox", { name: `${name} day portion`, exact: true }).selectOption("0.5");
  const saveDay = async () => {
    const saved = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/calendar/days/${date}` && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Save day", exact: true }).click();
    assert.equal((await saved).status(), 200);
  };
  await saveDay();
  await openDay(date);
  assert.equal(await page.getByRole("combobox", { name: `${name} day portion`, exact: true }).inputValue(), "0.5");
  let savedDay = (await api(date)).data.find((day) => day.date === date);
  assert.equal(savedDay.labels[0].name, name);
  assert.equal(savedDay.labels[0].portion, 0.5);
  await page.getByRole("button", { name: `Change ${name} color`, exact: true }).click();
  const recolored = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/labels/${label.id}` && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Set label color: Red (#EF4444)", exact: true }).click();
  assert.equal((await recolored).status(), 200);
  await openDay(date);
  assert.equal((await request("/labels")).data.find((entry) => entry.id === label.id).color, "#EF4444");
  const cue = dayButton(date, date.slice(0, 7)).locator(".calendar-label").filter({ hasText: name });
  await cue.waitFor();
  assert.equal((await cue.getAttribute("style")).includes("#EF4444"), true);
  if (process.env.CALENDAR_E2E_SCREENSHOT_PREFIX)
    await page.screenshot({ path: `${process.env.CALENDAR_E2E_SCREENSHOT_PREFIX}-desktop.png`, fullPage: true });
  await page.getByRole("checkbox", { name, exact: true }).uncheck();
  await saveDay();
  await openDay(date);
  assert.equal(await page.getByRole("checkbox", { name, exact: true }).isChecked(), false);
  savedDay = (await api(date)).data.find((day) => day.date === date);
  assert.equal(savedDay?.labels.length ?? 0, 0);
  assert.ok((await request("/labels")).data.some((entry) => entry.id === label.id));
  await page.goto(`${baseUrl}/labels`);
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).waitFor();
});

it("selects and cancels an equivalent range using emulated touch taps", async () => {
  const desktopPage = page;
  const context = await browser.newContext({
    storageState: await desktopPage.context().storageState(),
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    colorScheme: "light", reducedMotion: "reduce",
  });
  context.setDefaultTimeout(10000);
  page = await context.newPage();
  try {
    await openDay("2024-02-28");
    const before = (await request("/calendar/days?startDate=2024-02-27&endDate=2024-03-02")).data;
    await page.getByRole("button", { name: "Start date range selection", exact: true }).tap();
    await dayButton("2024-03-01", "2024-02").tap();
    await dayButton("2024-02-28", "2024-02").tap();
    assert.equal(await page.locator(".calendar-day.in-range").count(), 3);
    await page.getByRole("button", { name: "Apply to range", exact: true }).waitFor();
    if (process.env.CALENDAR_E2E_SCREENSHOT_PREFIX)
      await page.screenshot({ path: `${process.env.CALENDAR_E2E_SCREENSHOT_PREFIX}-touch.png`, fullPage: true });
    await page.getByRole("button", { name: "Cancel range", exact: true }).tap();
    assert.deepEqual((await request("/calendar/days?startDate=2024-02-27&endDate=2024-03-02")).data, before);
  } finally {
    page = desktopPage;
    await context.close();
  }
});

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
