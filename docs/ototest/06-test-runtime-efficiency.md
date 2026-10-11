# OTOTEST-06 — Test runtime efficiency

**Priority:** Medium
**Status:** In progress
**Dependencies:** None to start. Coordinate edits to
`frontend/scripts/nav-shell.acceptance.test.mjs` and
`frontend/scripts/board.acceptance.test.mjs` with the in-progress OTOTEST-03
branch to avoid conflicting changes.

## Goal

Make every existing test suite finish faster, locally and in CI, without
removing assertions, weakening coverage, or adding flakiness. Every change is
measured: record a baseline, apply one improvement, measure again, and
compare. A change that does not produce a measurable gain is reverted or
recorded as “no effect” rather than kept for its own sake.

The run records live in the
[OTOTEST-06 runtime records and acceptance checklist](06-acceptance-checklist.md).

## Scope

The milestone covers all automated suites that run on Linux, not only the
frontend. Each one is measured in the baseline and has an owning task.

| Suite | Command / CI job | Task |
| --- | --- | --- |
| Web unit/component (Vitest) | `cd frontend && npm test`; CI `web-and-extension` | T1, T2 |
| Web build | `cd frontend && npm run build` | T0 (measure), T7 |
| Mocked browser acceptance | `npm run test:tracker`, `test:board`, `test:nav`, `test:ui` | T3, T4 |
| Backend unit, `@WebMvcTest`, H2 integration | Gradle `test`; CI `backend` | T5 |
| Backend guarded PostgreSQL | Gradle `test` with `KB_TEST_POSTGRES_*`; CI `backend-postgres` | T5 |
| Chrome extension | `cd chrome-extension && npm test && npm run build`, `node --test chrome-extension/*.test.js` | T8 |
| Repository checks | `scripts/check-*.mjs`, `check-image-prune.sh`, shell syntax, Caddy validation | T8 |
| Smoke (deployed-shaped) | `scripts/run-smoke-tests.sh` (plain and `SMOKE_FULL_STACK=1`); CI `smoke` | T6 |
| Real-stack browser E2E | `run-board-e2e.sh`, `run-search-e2e.sh`, `run-timer-websocket-e2e.sh`, `run-line-history-e2e.sh`, `run-line-history-orca.sh`; CI `timer-websocket-e2e`, `line-history-e2e`, `line-history-orca` | T6 |
| Aggregate local run | `scripts/test-run-all.sh` (`--quick` and full) | T0, milestone comparison |
| CI workflow as a whole | `.github/workflows/verify.yml` | T7 |

iOS suites, including the `ios`, `ios-note-document`, and
`hard06-notes-focused` workflows, are out of scope, consistent with the
#ototest scope rule.

## Ground rules

- **Same coverage before and after.** Test file count, test count, and
  assertion intent must be unchanged unless a task explicitly splits or moves
  tests. A split must preserve every test name. Record counts in each run row.
- **No new flakiness.** After each improvement, run the affected suite five
  times in a row; all five must pass. A suite that was already flaky is
  recorded in the baseline, not hidden.
- **Prefer removing waiting over adding parallelism.** Replace real sleeps
  with fake/controlled clocks or event-based waits first; then parallelize.
- **Fake time must still exercise the real timer path.** Do not stub
  debounce/autosave functions out of the component; advance the clock so the
  production `setTimeout` code runs.
- **One improvement per commit** so its measured effect is attributable.
- **Keep isolation rules.** Parallel or shared stacks still use disposable
  Compose projects, unique ports and accounts, and project-scoped cleanup as
  required by [`AGENTS.md`](../../AGENTS.md). Never touch the production
  PostgreSQL volume.
- **Do not edit `backend/` tests while the development API is running from
  it** without the backend-copy approach used for local Gradle runs; Gradle
  writes there and restarts the dev API through DevTools.

## Measurement protocol

The agent doing this milestone records run times before and after every task.

1. **Environment line.** Record the commit, host (`art`, 16 cores /
   32 threads, see the root machine profile) or CI runner type, Node.js,
   npm, Docker, and Gradle image versions, and whether caches were cold or
   warm.
2. **Wall time.** Run each command three times and record the median wall
   time from `/usr/bin/time -f '%e'` (or the `test-run-all.sh` step summary).
   Record cold-cache numbers separately when a task targets caching.
3. **Breakdown.** Capture where the time goes, not just the total:
   - Vitest: `npx vitest run --reporter=json --outputFile=<scratch>/vitest.json`
     and list per-file `endTime - startTime` plus the slowest tests.
   - `node --test` browser suites: `--test-reporter=spec` durations, or
     `--test-reporter=junit --test-reporter-destination=<scratch>/x.xml`.
   - Backend: per-class `time` from `backend/build/test-results/test/*.xml`,
     plus total Gradle wall time (startup + dependency resolution + compile +
     test).
   - Docker stages: `test-run-all.sh` step timings, separately for image
     build, stack readiness, and test execution.
   - CI: `gh run view <run-id> --json jobs` job and step durations for the
     `verify` workflow.
4. **CPU usage.** For suites suspected of idling, record average CPU
   utilization (for example `/usr/bin/time -f '%e s %P'`). Low CPU with long
   wall time points at sleeps or serial execution rather than slow code.
5. **Compare.** Each task row in the records table states baseline median,
   after median, absolute and percentage change, and test counts. The
   milestone summary compares the full `test-run-all.sh` and CI `verify`
   totals before and after the whole milestone.

Store raw JSON/XML reports in a scratch directory, not in the repository.
Only the summarized numbers go into the records document.

## Initial findings

Measured on 2026-10-10 on `art` during the planning conversation. Treat these
as starting hints; the baseline task re-measures them on a clean `main`.

| Layer | Observation | Evidence |
| --- | --- | --- |
| Web Vitest (`npm test`) | 24.3 s wall for 70 files / 860 tests. One file is the critical path: `src/views/NotesView.test.ts` took 18.5 s while the next slowest file (`BoardView.test.ts`) took 4.3 s. The rest of the 31 workers sit idle, so CPU usage is low. | Vitest JSON reporter, per-file durations |
| `NotesView.test.ts` | 27 real-time sleeps on the OTOTEST-03 branch (`setTimeout(resolve, 700)` ×22, `280` ×5; 26 on `main` at `fe9467bb`) wait for the autosave and search debounce timers in `NotesView.vue`. About 17 s of its 18.5 s is idle waiting; most of its 44 tests take ~730 ms. | `grep setTimeout(resolve` |
| Other Vitest files | `src/lib/warmup.test.ts` also uses real sleeps. 11 test files already use `vi.useFakeTimers`, so the pattern exists in the codebase. | `grep useFakeTimers` |
| Mocked browser acceptance (`test:nav`, `test:board`) | About 100 tests each, run with `--test-concurrency=1`, a fresh browser context per test, and fixed waits. `nav-shell` has a single `waitForTimeout(6000)`; `board` has 29 fixed waits including 3200, 1700 and 1500 ms waits for a highlight-ring fade animation. Not yet timed. | `grep waitForTimeout` |
| Backend Gradle | 98 classes / 605 tests take 28.8 s of summed test time; the largest are `KnowIntegrationTest` 6.1 s and `SearchIntegrationTest` 3.8 s. Integration tests share one `IntegrationTestSupport` context, but 16 `@WebMvcTest` classes each use their own `@MockBean`/`@TestPropertySource` set and therefore their own Spring context. `build.gradle` sets no `maxParallelForks`. CI runs `gradle:8.13-jdk21` with `--no-daemon` and no dependency cache, so every job downloads dependencies. The `backend` and `backend-postgres` CI jobs both run the full suite. | `build/test-results/test/*.xml`, `.github/workflows/verify.yml` |
| Real-stack runners | `run-board-e2e.sh`, `run-search-e2e.sh`, `run-timer-websocket-e2e.sh`, and `run-line-history-e2e.sh` each run `docker compose up --build` for their own stack, then poll readiness with `sleep 2`. CI jobs `timer-websocket-e2e` and `line-history-e2e` build separate stacks and install Playwright Chromium each time without caching. `test-run-all.sh` already builds once and shares one stack locally. | runner scripts, `verify.yml` |
| Smoke | `run-smoke-tests.sh` builds images and polls readiness with `sleep 2` loops; its full-stack variant rebuilds unless `SMOKE_SKIP_BUILD=1`. | `run-smoke-tests.sh` |
| Chrome extension | `node --test` over 9 files; expected to be small. Measure in the baseline only. | `chrome-extension/package.json` |

## Tasks

Each task records baseline and after numbers in the runtime records document.
Tasks are ordered by expected gain per effort; T0 must come first.

### OTOTEST-06-T0 — Baseline

- [ ] Fast-forward `main`, create the task branch, and record the environment
  line.
- [ ] Measure three times each, covering every suite in the scope table:
  `npm test` and `npm run build` (frontend); `npm run test:tracker`,
  `test:board`, `test:nav`, and `test:ui`; extension `npm test`, build, and
  `node --test` files; repository checks; backend Gradle test on H2 (from a
  copy of `backend/`, with a unique `--project-cache-dir`) and against a
  disposable PostgreSQL database; and `./scripts/test-run-all.sh --quick`.
- [ ] Measure once each (they are long): plain and full-stack
  `run-smoke-tests.sh`, every real-stack runner script, and a full
  `./scripts/test-run-all.sh`.
- [ ] Capture per-file/per-class breakdowns and CPU usage as described in the
  protocol.
- [ ] Pull job and step durations for the last three green `verify` runs on
  `main`.
- [ ] Record test counts per suite; these are the coverage reference for every
  later task.

### OTOTEST-06-T1 — Fake timers in `NotesView.test.ts`

- [ ] Replace real sleeps with `vi.useFakeTimers()` and
  `await vi.advanceTimersByTimeAsync(<debounce>)`, followed by
  `flushPromises()` where the test already uses it. Restore real timers in
  `afterEach`.
- [ ] Take the debounce values from `NotesView.vue` (or export named
  constants) instead of hard-coding 700/280 again, so a production timing
  change cannot silently desynchronize the tests.
- [ ] Check tests that combine timers with TipTap, router navigation, or
  `beforeunload` behavior; keep real timers in a specific test only if fake
  timers break real behavior, and note the reason in the test.
- [ ] Expected effect: file from ~18 s to ~1–2 s; `npm test` wall time from
  ~24 s to the next critical path (~5–8 s).

### OTOTEST-06-T2 — Remaining real sleeps in Vitest

- [ ] Apply the T1 approach to `src/lib/warmup.test.ts` and any other test
  that waits on a real timer.
- [ ] Re-run the per-file breakdown. If one file still dominates (for example
  `BoardView.test.ts` at 4.3 s with 116 tests), consider splitting it by
  feature area so Vitest can schedule the parts in parallel. Keep test names
  unchanged.
- [ ] Measure Vitest environment and import overhead from the JSON reporter.
  Evaluate, one at a time: `css: false` or `css: { include: [...] }` for files
  that do not assert styles, `pool: 'threads'` versus the default `forks`,
  and dependency optimization for Vuetify. Keep only options that measurably
  help and keep every test green.

### OTOTEST-06-T3 — Controlled clock in mocked browser suites

- [x] Replace fixed `page.waitForTimeout(...)` calls in
  `board.acceptance.test.mjs` and `nav-shell.acceptance.test.mjs` with
  condition waits (`locator.waitFor`, `expect.poll`-style polling, or
  `page.waitForFunction`) when they wait for state.
- [x] Use Playwright's clock API (`page.clock.install()` /
  `page.clock.runFor()`) for waits that test time-based behavior, such as the
  3-second highlight-ring fade and the `waitForTimeout(6000)` in
  `nav-shell`. Assert the same intermediate and final states.
- [x] Expected effect: removes about 10 s of fixed waits from `test:board` and
  6 s from `test:nav` before any parallelism.

### OTOTEST-06-T4 — Parallel mocked browser suites

- [x] Find out why `test:nav` and `test:board` use `--test-concurrency=1`
  (shared Vite server, shared browser, port, or mocked-route state). Record
  the reason.
- [x] If tests are independent per browser context, run them with a bounded
  concurrency (for example 4–8 locally, matching CI vCPUs in CI) or split each
  file into several files that share the Vite server setup through a helper.
- [x] Reuse one Vite dev server and one Chromium process per worker; keep a
  fresh context per test for isolation.
- [x] Run each suite five times at the new concurrency; any order-dependent
  failure blocks the change.

Measured outcome: `test:nav` keeps one Vite server and Chromium process, gives
each case a fresh browser context, and runs the independent acceptance cases
at concurrency 7. Five runs passed (176 tests each), with a 91.10 s median
versus 295.69 s after T3 at the original serial setting. A 30-worker probe was
slower and exposed render, focus, and request-order races; those assertions
were made readiness-based where possible, while auth and browser tab cases
remain serial. The board suite already had four concurrency-4 groups, so
raising them to 8 and 12 did not produce a repeatable enough gain to keep.

### OTOTEST-06-T5 — Backend Gradle runtime

- [ ] Split the baseline Gradle wall time into JVM/Gradle startup, dependency
  resolution, compilation, Spring context startup, and test execution.
- [ ] CI: cache Gradle dependencies (mount a cache directory into the
  `gradle:8.13-jdk21` container and persist it with `actions/cache`, keyed on
  the build files), or switch to `actions/setup-java` plus
  `gradle/actions/setup-gradle`. Measure cold and warm.
- [ ] Reduce distinct Spring contexts: count contexts started (enable
  `logging.level.org.springframework.test.context.cache=DEBUG` for a run) and
  consolidate identical `@MockBean`/`@TestPropertySource` combinations in the
  16 `@WebMvcTest` classes into a shared base or annotation where the
  configuration is truly the same.
- [ ] Evaluate `maxParallelForks` (for example `Runtime.runtime.availableProcessors().intdiv(2) ?: 1`)
  and JUnit parallel execution separately. Integration tests share H2 and
  registered users; enable parallelism only if tests are proven isolated.
- [ ] CI: decide whether the `backend` (H2) job is still needed when
  `backend-postgres` runs the full suite, or whether `backend` can run only
  the non-PostgreSQL-specific subset. Record the coverage reasoning; do not
  drop a layer silently.

### OTOTEST-06-T6 — Real-stack and smoke stages

- [ ] Measure image build, stack readiness, and test time separately for each
  runner and for the CI jobs.
- [ ] Replace `sleep 2` readiness loops with Compose health checks and
  `docker compose up --wait` where the services define health checks, or a
  shorter poll with the same total timeout.
- [ ] In CI, build the test images once (Buildx with the GitHub Actions cache,
  `cache-from/cache-to: type=gha`) and reuse them for smoke and real-stack
  jobs, or run the real-stack suites against one shared stack as
  `test-run-all.sh` already does locally.
- [ ] Cache Playwright browsers in CI (`~/.cache/ms-playwright`, keyed on the
  Playwright version) and install system dependencies only when needed.
- [ ] Keep disposable Compose project names, generated credentials, and
  project-scoped `down --volumes` cleanup; `node scripts/check-smoke-cleanup.mjs`
  must still pass.

### OTOTEST-06-T7 — CI workflow layout

- [ ] Using the T0 job durations, find the critical path of the `verify`
  workflow.
- [ ] Split `web-and-extension` so the web unit tests, web build, extension
  tests, and repository checks run as parallel jobs if that shortens the
  critical path, or combine short jobs if runner start-up dominates.
- [ ] Use `concurrency` with `cancel-in-progress` for superseded pushes on the
  same branch, so CI capacity is not spent on outdated commits.
- [ ] Record before/after wall time for the whole workflow (first job start to
  last job end) over at least three runs each.

### OTOTEST-06-T8 — Chrome extension and repository checks

- [ ] From the baseline, list the extension tests, extension build, and each
  `scripts/check-*.mjs` / shell / Caddy check with its time. These are
  expected to be short; act only on items that take a noticeable share of
  the run.
- [ ] The extension `npm test` and the CI step run overlapping `node --test`
  file lists. Remove duplicated execution while keeping every file run at
  least once.
- [ ] Run independent repository checks concurrently where their output stays
  readable, and validate all Caddy configs in one container as
  `test-run-all.sh` already does, instead of one `docker run` per config in
  CI.

### OTOTEST-06-T9 — Documentation and guardrails

- [ ] Update `docs/testing.md` with the measured runtimes per suite and the
  timing conventions: fake timers for debounce/autosave in Vitest, Playwright
  clock instead of fixed waits, and when serial execution is required.
- [ ] Add a lightweight check (for example to `scripts/check-*.mjs`) that
  fails on new `setTimeout(resolve, <n>)` sleeps in `frontend/src/**/*.test.ts`
  and new `waitForTimeout(<n>)` above a small threshold in browser suites,
  with an allowlist that requires a reason.
- [ ] Update the roadmap, milestone index, and this document's status
  together.

## Acceptance

- Baseline and after measurements exist for every task, using the protocol
  above, with test counts showing no coverage was removed.
- Each kept change shows a measurable improvement; changes without effect are
  reverted and recorded as such.
- Every changed suite passed five consecutive runs after the change.
- The frontend Vitest suite no longer has a single file that dominates its
  wall time due to real sleeps.
- Mocked browser suites contain no unexplained fixed waits above the agreed
  threshold.
- The full `test-run-all.sh` and the CI `verify` workflow have before/after
  totals recorded in the runtime records, with the overall percentage change.
- `docs/testing.md` documents current runtimes and the timing conventions, and
  the guard check runs in CI.
