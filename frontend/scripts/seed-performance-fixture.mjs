#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const baseUrl = process.env.API_BASE_URL;
const project = process.env.PERFORMANCE_COMPOSE_PROJECT;
const profile = process.env.PERFORMANCE_FIXTURE_PROFILE ?? "sparse";
const output = resolve(process.env.PERFORMANCE_FIXTURE_OUTPUT ?? "harden-tests/local-artifacts/performance/fixture.json");
if (!baseUrl || !project) throw new Error("Set API_BASE_URL and PERFORMANCE_COMPOSE_PROJECT to a disposable local perf project");
const origin = new URL(baseUrl);
if (!(["localhost", "127.0.0.1", "::1"].includes(origin.hostname)) || !/perf/i.test(project)) {
  throw new Error("Fixture seeding is restricted to localhost and a Compose project name containing 'perf'");
}
if (!output.includes(`${resolve("harden-tests/local-artifacts")}/`)) {
  throw new Error("PERFORMANCE_FIXTURE_OUTPUT must stay under harden-tests/local-artifacts/");
}
const sizes = {
  sparse: { paths: 3, notes: 12, sessions: 20, boards: 1, statuses: 3, cardsPerBoard: 48, labels: 4 },
  dense: { paths: 12, notes: 120, sessions: 200, boards: 2, statuses: 5, cardsPerBoard: 120, labels: 12 },
};
const size = sizes[profile];
if (!size) throw new Error("PERFORMANCE_FIXTURE_PROFILE must be sparse or dense");
const runId = process.env.PERFORMANCE_RUN_ID ?? `perf-${Date.now()}-${randomBytes(3).toString("hex")}`;
const email = `${runId}@example.test`;
const password = randomBytes(24).toString("base64url");
const json = (value) => JSON.stringify(value);
const range = (values) => ({ minChars: Math.min(...values.map((value) => value.length)), maxChars: Math.max(...values.map((value) => value.length)) });
let token;
async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(new URL(`/api/v1${path}`, origin), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: json(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function create(path, body) {
  return api(path, { method: "POST", body });
}

const registered = await api("/auth/register", { method: "POST", body: { email, password } });
token = registered.token;
if (!token) throw new Error("Registration did not return an access token");

const paths = [];
for (let index = 0; index < size.paths; index += 1) {
  paths.push(await create("/paths", {
    name: `Perf ${profile} path ${String(index + 1).padStart(3, "0")}`,
    description: index === 0 ? "PerfExactAnchor searchable fixture" : `Deterministic ${profile} fixture path ${index + 1}`,
    color: "#3467A8",
    textColor: "#FFFFFF",
  }));
}
const labels = [];
for (let index = 0; index < size.labels; index += 1) {
  labels.push(await create("/labels", {
    name: `Perf ${profile} label ${String(index + 1).padStart(3, "0")}`,
    color: "#3467A8",
    scopes: ["NOTE", "TIME_ENTRY", "LOG", "BOARD"],
  }));
}
const notes = [];
const noteText = (index) => index === 0
  ? "PerfExactAnchor perfexactanchr near-match fixture text."
  : `Deterministic ${profile} note ${String(index + 1).padStart(4, "0")} with searchable PerfExactAnchor corpus.`;
for (let index = 0; index < size.notes; index += 1) {
  const title = `Perf ${profile} note ${String(index + 1).padStart(4, "0")}`;
  const text = noteText(index);
  const content = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  notes.push(await create("/notes", {
    pathId: paths[index % paths.length].id,
    title,
    content,
    contentText: text,
    tags: [`PerfFixture-${profile}`],
  }));
}

const sessions = [];
const epoch = Date.parse("2026-01-01T09:00:00Z");
for (let index = 0; index < size.sessions; index += 1) {
  const start = new Date(epoch + index * 86_400_000);
  const end = new Date(start.getTime() + 30 * 60_000);
  sessions.push(await create("/time-entries", {
    pathId: paths[index % paths.length].id,
    labelIds: [],
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    description: `Deterministic ${profile} session ${String(index + 1).padStart(4, "0")}`,
    source: "MANUAL",
  }));
}

const boards = [];
for (let boardIndex = 0; boardIndex < size.boards; boardIndex += 1) {
  const board = await create("/boards", { name: `Perf ${profile} board ${String(boardIndex + 1).padStart(2, "0")}` });
  const statuses = await api(`/boards/${board.id}/statuses`);
  const statusIds = statuses.map((status) => status.id);
  while (statusIds.length < size.statuses) {
    const status = await create(`/boards/${board.id}/statuses`, { name: `Perf status ${statusIds.length + 1}` });
    statusIds.push(status.id);
  }
  for (let cardIndex = 0; cardIndex < size.cardsPerBoard; cardIndex += 1) {
    const dayOffset = cardIndex % 60;
    const startDate = `2026-${String(Math.floor(dayOffset / 28) + 1).padStart(2, "0")}-${String((dayOffset % 28) + 1).padStart(2, "0")}`;
    const dueDate = `2026-${String(Math.floor((dayOffset + 1) / 28) + 1).padStart(2, "0")}-${String(((dayOffset + 1) % 28) + 1).padStart(2, "0")}`;
    await create(`/boards/${board.id}/cards`, {
      statusId: statusIds[0],
      title: `Perf ${profile} card ${String(cardIndex + 1).padStart(4, "0")}`,
      body: `Deterministic board fixture card ${cardIndex + 1}`,
      priority: ["LOW", "MEDIUM", "HIGH"][cardIndex % 3],
      startDate,
      dueDate,
      pathIds: [paths[cardIndex % paths.length].id],
      labelIds: [],
    });
  }
  boards.push({ id: board.id, statusIds, cards: size.cardsPerBoard });
}

const counts = {
  paths: paths.length,
  notes: notes.length,
  sessions: sessions.length,
  boards: boards.length,
  statuses: boards.reduce((total, board) => total + board.statusIds.length, 0),
  cards: boards.reduce((total, board) => total + board.cards, 0),
  labels: labels.length,
};
const observedPaths = await api("/paths");
const observedNotes = await api("/notes");
const observedSessions = await api("/time-entries");
const observedBoards = await api("/boards");
const observedLabels = await api("/labels");
const observedStatuses = await Promise.all(boards.map((board) => api(`/boards/${board.id}/statuses`)));
const observedCards = await Promise.all(boards.map(async (board) => {
  const result = await api(`/boards/${board.id}/cards?statusId=${board.statusIds[0]}`);
  return result.length;
}));
const verifiedCounts = {
  paths: observedPaths.length,
  notes: observedNotes.length,
  sessions: observedSessions.length,
  boards: observedBoards.length - size.paths,
  statuses: observedStatuses.reduce((total, values) => total + values.length, 0),
  cards: observedCards.reduce((total, value) => total + value, 0),
  labels: observedLabels.length,
};
if (json(counts) !== json(verifiedCounts)) {
  throw new Error(`Fixture count verification failed: expected ${json(counts)}, got ${json(verifiedCounts)}`);
}
const exactSearch = await api("/search?q=PerfExactAnchor&fuzzy=false&limit=50");
const nearSearch = await api("/search?q=PerfExactAnchro&fuzzy=true&limit=50");
const exactNoteCount = exactSearch.groups.find((group) => group.type === "NOTE")?.total ?? 0;
const nearNoteCount = nearSearch.groups.find((group) => group.type === "NOTE")?.total ?? 0;
if (exactNoteCount !== size.notes || !nearSearch.fuzzy || nearNoteCount < 1) {
  throw new Error(`Search fixture validation failed: exact notes=${exactNoteCount}, near notes=${nearNoteCount}, fuzzy=${nearSearch.fuzzy}`);
}
const pageChecks = await Promise.all(boards.map(async (board) => {
  const first = await api(`/boards/${board.id}/cards/page?statusId=${board.statusIds[0]}&cursor=-1&limit=20`);
  if (first.items.length !== 20 || first.nextCursor === null) throw new Error(`Board ${board.id} did not produce a valid first page`);
  const next = await api(`/boards/${board.id}/cards/page?statusId=${board.statusIds[0]}&cursor=${first.nextCursor}&limit=20`);
  if (next.items.length !== 20) throw new Error(`Board ${board.id} did not produce a valid next page`);
  return { boardId: board.id, firstPageItems: first.items.length, nextPageItems: next.items.length };
}));
const expected = {
  ...counts,
  exactSearchNoteCount: exactNoteCount,
  nearSearchNoteCount: nearNoteCount,
  nearSearchFuzzyFallback: nearSearch.fuzzy,
  boardPageChecks: pageChecks,
  reportSessionsInFixed2026Range: sessions.filter((session) => session.startedAt.startsWith("2026-")).length,
};
const textDimensions = {
  pathNames: range(paths.map((_path, index) => `Perf ${profile} path ${String(index + 1).padStart(3, "0")}`)),
  pathDescriptions: range(paths.map((_path, index) => index === 0 ? "PerfExactAnchor searchable fixture" : `Deterministic ${profile} fixture path ${index + 1}`)),
  noteTitles: range(notes.map((_note, index) => `Perf ${profile} note ${String(index + 1).padStart(4, "0")}`)),
  noteBodies: range(notes.map((_note, index) => noteText(index))),
  cardTitles: range(Array.from({ length: size.cardsPerBoard }, (_, index) => `Perf ${profile} card ${String(index + 1).padStart(4, "0")}`)),
  cardBodies: range(Array.from({ length: size.cardsPerBoard }, (_, index) => `Deterministic board fixture card ${index + 1}`)),
  sessionDescriptions: range(Array.from({ length: size.sessions }, (_, index) => `Deterministic ${profile} session ${String(index + 1).padStart(4, "0")}`)),
  searchTerms: { exactChars: "PerfExactAnchor".length, nearMatchChars: "PerfExactAnchro".length },
};
const fixture = {
  schemaVersion: 1,
  generator: "knowledge-base-performance-fixture-v1",
  runId,
  profile,
  project,
  createdAtUtc: new Date().toISOString(),
  accountEmail: email,
  token,
  counts,
  expected,
  textDimensions,
  search: { exact: "PerfExactAnchor", nearMatch: "PerfExactAnchro" },
  paths: paths.map(({ id }) => id),
  boards,
  labels: labels.map(({ id }) => id),
  noteIds: notes.map(({ id }) => id),
};
fixture.apiManifest = {
  version: 1,
  fixture: { id: fixture.generator, profile, counts, expected, textDimensions },
  workloads: [
    { name: "search-exact-api", method: "GET", path: "/api/v1/search?q=PerfExactAnchor&fuzzy=false&limit=50", expectedStatus: [200] },
    { name: "search-near-match-api", method: "GET", path: "/api/v1/search?q=PerfExactAnchro&fuzzy=true&limit=50", expectedStatus: [200] },
    ...boards.flatMap((board, index) => [
      { name: `board-${index + 1}-first-page-api`, method: "GET", path: `/api/v1/boards/${board.id}/cards/page?statusId=${board.statusIds[0]}&cursor=-1&limit=20`, expectedStatus: [200] },
      { name: `board-${index + 1}-next-page-api`, method: "GET", path: `/api/v1/boards/${board.id}/cards/page?statusId=${board.statusIds[0]}&cursor=19&limit=20`, expectedStatus: [200] },
      { name: `board-${index + 1}-gantt-range-api`, method: "GET", path: `/api/v1/boards/${board.id}/gantt?from=2026-01-01&to=2026-12-31`, expectedStatus: [200] },
    ]),
    { name: "report-range-api", method: "GET", path: "/api/v1/reports?startDate=2026-01-01&endDate=2026-12-31&aggregation=MONTH", expectedStatus: [200] },
    { name: "timer-current-api", method: "GET", path: "/api/v1/timers/current", expectedStatus: [200] },
  ],
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o600 });
const manifestOutput = resolve(dirname(output), "api-manifest.json");
await writeFile(manifestOutput, `${JSON.stringify(fixture.apiManifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ output, manifestOutput, project, profile, counts, expected }, null, 2));
