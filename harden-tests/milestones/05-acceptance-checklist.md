# HARD-05 acceptance checklist: performance baselines

**Status:** Complete

Use this checklist with [HARD-05](05-performance-baselines.md). Start with
report-only measurements; thresholds require repeatable evidence.

## Current coverage and evidence boundary

- [x] Confirm the run report template has a performance slot, but does not yet
  define a sampling method or include measured values: see
  [`runs/README.md`](../runs/README.md).
- [x] Confirm the current real-stack browser acceptance scripts cover board
  pagination and Gantt requests, timer requests/WebSocket behavior, and note
  line history, but do not currently retain duration samples. Treat functional
  pass/fail as separate evidence from performance data.
- [x] Confirm the local runbook identifies desktop Chromium and the 390×844
  touch-enabled `iphone` profile; the latter is Chromium emulation when paired
  with Chromium, not physical Android Chrome. Keep emulated iPhone WebKit in a
  separate comparison group.
- [x] Before collecting values, refresh local machine resource/version
  metadata from [`local-browser-validation.md`](../local-browser-validation.md)
  and record the measurement commit, fixture revision, and active Compose
  project. Initial preflight and follow-up benchmark environment are recorded
  in [`2026-10-09-hard05-environment-preflight.md`](../runs/2026-10-09-hard05-environment-preflight.md),
  with profile-specific metadata and immutable image IDs in the run reports.
  The development stack remained active; its resource use is reported as
  multi-core host context, not a blocker.

## Workload contract

For every row, define fixture setup separately from the timed interval. Record
the route, action, completion signal, API request(s), returned item count, and
whether the observation is browser, API-client, or server-side. Use stable
semantic/network signals; arbitrary sleeps and total suite duration do not
qualify as journey measurements.

| Journey | Start and completion boundary | Data and result dimensions | Required profile / companion metric |
| --- | --- | --- | --- |
| Authenticated app startup | Start navigation with a fresh page and a valid disposable session; end when the shell and selected landing view are usable and required initial requests settle. | Record cold browser context separately from warm reload; include initial API request count and failed requests. | Desktop Chromium and mobile-size Chromium; report browser-observed time and API request timings. |
| Global search, exact | Start after the search view is ready and query input is focused; end when exact-match results and loading state settle. | Fixed query with known result count; record result count, pagination/limit, and query types. | Desktop and mobile-size Chromium; pair with authenticated `GET /api/v1/search` timing. |
| Global search, near match | Same boundary as exact search, with a deterministic typo/near-match query that exercises fuzzy fallback. | Keep corpus and fuzzy option fixed; record whether fallback ran and returned count. | Desktop and mobile-size Chromium; separate client interaction from API endpoint latency. |
| Board first page | Start direct navigation to the seeded board; end when first page cards render and required board/status/card requests settle. | Fixed board, status/card counts, first page size, ordering mode, and card content lengths. | Desktop and mobile-size Chromium; pair with `GET /api/v1/boards/{id}/cards/page`. |
| Board next page | Start at the visible next-page action; end when the next page is rendered and cursor state settles. | Seed beyond one page; record requested cursor, returned count, and total cards. | Desktop and mobile-size Chromium; time the page request separately from render completion. |
| Gantt range | Start when switching to Gantt or changing range; end when range response settles and chart rows/bars render. | Fixed board/card counts, date span, cards with/without dates, and visible row count. | Desktop and mobile-size Chromium; pair with `GET /api/v1/boards/{id}/gantt?from=…&to=…`. |
| Report range | Start when opening reports or changing period/range; end when report data and charts finish rendering. | Fixed period, selected paths, number of sessions/notes/cards, and returned series/row counts. | Desktop and mobile-size Chromium; pair with `GET /api/v1/reports`. |
| Note save | Start on explicit Save/submit; end on successful response and saved-version UI state. | Fixed note body length and line count; record payload bytes and response status. | Desktop and mobile-size Chromium; capture the actual `POST`/`PUT /api/v1/notes` route and separate click-to-confirm time from API duration. |
| Timer start/stop | Start at user action; end at successful API response and visible running/stopped state. | Disposable user and one-running-timer state; retain server timestamps and avoid treating test setup as latency. | Desktop and mobile-size Chromium; capture the actual `POST /api/v1/timers` start and stop routes plus UI confirmation. |
| WebSocket update | Start when the initiating timer mutation is acknowledged; end when the corresponding update is observed by a second authorized page. | Two pages for the same disposable user; record connection-ready boundary, event type, and event delivery outcome. | Desktop and mobile-size Chromium; report mutation latency and event-delivery latency as distinct metrics. |

If an endpoint or route name differs from the current API mapping, record the
observed method and path with the run rather than assuming a planned endpoint.
Do not include authentication/setup latency in a journey unless the journey
explicitly measures it.

The current source mapping is documented in
[`SearchController`](../../backend/src/main/java/com/know/api/SearchController.java),
[`ReportController`](../../backend/src/main/java/com/know/api/ReportController.java),
[`BoardController`](../../backend/src/main/java/com/know/api/BoardController.java),
[`NoteController`](../../backend/src/main/java/com/know/api/NoteController.java),
and [`TimerController`](../../backend/src/main/java/com/know/api/TimerController.java).

## Environment capture

- [x] Record commit, Compose project, image tags and immutable IDs, OS,
  architecture, CPU/memory limits, Node/JDK/PostgreSQL versions, browser and
  Playwright versions, viewport/profile, network conditions, and cache state.
- [x] State that the machine had competing services and record host/container
  resource constraints. The persistent development stack was left running; no
  unrelated builds, tests, or benchmarks ran during timed samples.

## Measurement method

- [x] Use one versioned deterministic fixture profile per workload. Define
  sparse and dense account sizes as explicit counts for paths, notes, sessions,
  boards, statuses, cards, labels, and search terms; define card counts that
  cross the 20-card UI page boundary and include a documented larger case.
  Record seeded text lengths, date distribution, exact/near-match terms, and
  expected result counts. Do not use wall-clock/random data to decide fixture
  contents. See [`performance-fixtures.md`](../performance-fixtures.md) and
  its linked versioned generator.
- [x] Record fixture seed/version, setup command, cleanup owner/project, and a
  post-setup count summary. Assert fixture counts before timing, and verify the
  benchmark user/data are disposable before and after the run. The generator
  validates its account's counts and records the unique project for scoped
  Compose teardown; generated fixture artifacts are ignored and mode `0600`.
- [x] Define at least 3 unmeasured warmups followed by at least 30 measured
  samples per proposed gated journey and profile; record every raw sample.
  If setup or run cost prevents this, label the smaller sample set exploratory
  and do not propose a gate from it.
- [x] Report sample count, median, p95, min/max, and a declared outlier policy.
  Preserve outliers in raw data; do not silently trim them. Explain any
  exclusion with an observable cause such as an unrelated host load spike.
- [x] Separate cold startup/cache observations from steady-state samples.
- [x] Use the completion boundaries above and bounded timeouts; do not time
  arbitrary sleeps or include fixture setup unless the metric explicitly
  measures setup. Record timeout/failure samples as outcomes, not dropped rows.
- [x] For browser timing, use a monotonic high-resolution clock and retain the
  raw browser trace/network log needed to distinguish request wait from render
  wait. For API timing, record request start/end, status, response bytes, and
  whether connection setup is included. Do not call browser-observed duration
  “server latency.”
- [x] Record raw samples or a retained, secret-free artifact sufficient to
  recompute the summary statistics. Keep raw sample rows associated with
  profile, journey, fixture, run, and sample index.
- [x] Collect at least two comparable same-profile runs for every proposed
  gated metric, each meeting the sample protocol, and quantify within-run and
  between-run variation/noise sources.
- [x] Keep comparisons within the same fixture, machine class, browser profile,
  and measurement method; label incomparable runs.
- [x] Run profiles serially on this machine after capturing CPU/memory
  availability and competing load. Do not run build/test suites, Docker image
  builds, or unrelated benchmarks concurrently with timed samples. Record
  throttling, power profile, browser background state, viewport, device scale,
  touch mode, cache state, and network shaping.
- [x] Keep desktop Chromium and mobile-size Chromium as independent result
  populations even when both use the same browser binary. Keep WebKit results
  separate; a mobile-size viewport does not make a WebKit sample a Chrome
  sample.

## Reporting and gates

- [x] Append results to dated per-profile reports using the run template and link raw
  artifacts without committing large generated output.
- [x] Include a summary table with profile, journey/API, fixture profile,
  warmups, sample count, median, p95, min/max, failure/timeout count, and
  artifact path. Include the exact machine/software metadata, not only the
  dated local runbook snapshot.
- [x] Initial baseline collection is report-only and cannot fail CI.
- [x] For the browser-only candidate 20% gate, state the baseline commit/run IDs, baseline
  median and p95, absolute and relative thresholds, minimum material slowdown,
  rationale, measured variance, rerun policy, and override owner. Define the
  comparison statistic and avoid multiplying a noisy p95 by 1.2 without
  supporting data.
- [x] Dry-run the proposed browser median rule against repeated data and a
  controlled +101 ms regression example; no CI gate is enabled.
  include a controlled regression example if practical.
- [x] Verify the proposal has a clear failure message, does not compare
  incompatible profile/fixture classes, and handles missing/failed samples
  explicitly. Document how a baseline is intentionally refreshed and reviewed.
- [x] Do not claim a gate protects an unmeasured journey/profile; API and
  censored WebSocket residual metrics are explicitly excluded.
- [x] Remove temporary accounts/data with the benchmark project's scoped
  volume teardown and verify artifact reports
  contain no secrets or personal content.

## Product-quality guardrails

- [x] Keep timings paired with functional assertions for correct result counts,
  ownership, saved state, and timer/WebSocket behavior; a fast wrong response
  is a failed workload.
- [x] Check desktop app and mobile-size Chromium separately for overflow,
  hidden controls, loading states, keyboard/touch operability, and console or
  request errors during timed journeys. Performance results do not waive
  accessibility or browser acceptance criteria.
- [x] Record whether a slow observation is repeatable and the evidence for
  attributing it to browser rendering, network, API, database, or machine load;
  do not assign a cause from one end-to-end duration alone.
