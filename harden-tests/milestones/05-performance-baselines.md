# HARD-05: Fixed-data performance baselines

**Priority:** Medium  
**Status:** In progress
**Scope:** Measurement and test infrastructure documentation only.

Track completion in the [HARD-05 acceptance checklist](05-acceptance-checklist.md).

## Why this milestone exists

Run reports currently have a performance section but no measured baseline.
Without repeated, fixed-data measurements, a regression gate would be noisy and
hard to interpret. This milestone first makes the inputs and environment
reproducible, then establishes report-only measurements.

## Tasks

- [x] Implement or document the workload boundaries in the
  [acceptance checklist](05-acceptance-checklist.md): startup, exact and fuzzy
  search, first/next board page, Gantt range, reports, note save, timer
  start/stop, and second-page WebSocket receipt. Record the observed method and
  path for each API request; current source mappings include
  `GET /api/v1/search`, `GET /api/v1/reports`,
  `GET /api/v1/boards/{id}/cards/page`,
  `GET /api/v1/boards/{id}/gantt`, and timer endpoints under `/api/v1/timers`.
- [x] Specify and implement a versioned deterministic fixture generator and sparse/dense
  fixture profiles with explicit counts for paths, notes, sessions, boards,
  statuses, cards, labels, search terms, and text lengths. Include expected
  result counts, at least one board beyond the 20-card UI page boundary, date
  distribution, exact/near-match search content, setup/count validation, and
  scoped cleanup instructions. Keep all generated accounts/data disposable.
  See [`performance-fixtures.md`](../performance-fixtures.md) and
  [`seed-performance-fixture.mjs`](../../frontend/scripts/seed-performance-fixture.mjs).
- [ ] Capture client and server environment: commit, image digests, browser and
  Playwright versions, viewport/profile, CPU/memory limits, Node/JDK/PostgreSQL
  versions, network conditions, and warm/cold cache state.
- [ ] Use at least 3 warmups and 30 measured samples per candidate journey and
  profile; report median, p95, min/max, all failures/timeouts, and raw samples.
  Lower-count exploratory data cannot justify a CI gate. Preserve outliers and
  document any exclusion rule before collecting data.
- [ ] Separate browser-observed journey time, API request duration, and server
  duration. Define monotonic clock and start/end events; retain traces/network
  data sufficient to identify request wait versus render wait without claiming
  end-to-end time is server latency.
- [x] Add a report-only API collection path and extend the per-run report template
  in `harden-tests/runs/README.md` with environment metadata, fixture profile,
  workload boundaries, sampling method, summary table, artifact links, and
  comparison class. Keep initial measurements non-gating. The API collector is
  [`performance-api-baseline.mjs`](../../frontend/scripts/performance-api-baseline.mjs);
  it does not measure browser rendering or perform fixture setup.
- [ ] Run profiles serially on the current machine, capture host/Docker CPU and
  memory availability and competing load, and repeat at least two comparable
  batches per candidate metric. Estimate both within-run and between-run
  variability; label different browser, viewport, fixture, or machine classes
  incomparable.
- [ ] Only after stable evidence, propose per-journey regression bands (20% is
  a planning target, not an approved universal threshold). State baseline
  commit/run IDs, median and p95 values, absolute floor, relative threshold,
  observed noise, rerun policy, failure handling, refresh procedure, and
  override owner. Demonstrate detection on controlled regression data when
  practical; do not enable a failing CI gate before review.

## Acceptance evidence

- A committed or artifact-linked report contains reproducible fixture
  instructions and count verification, exact journey/API boundaries,
  environment metadata, raw samples, sample counts, median/p95/min/max, and
  timeout/failure outcomes.
- At least two comparable runs, each following the declared sample protocol,
  establish within-run and between-run variance for each gated metric.
- Initial collection is report-only. Any gate is separately reviewed against
  observed noise and has an absolute floor, profile/fixture compatibility
  check, clear failure message, baseline refresh procedure, and documented
  rerun/override policy.
- No personal records or credentials appear in generated fixtures or reports.
- Desktop Chromium and mobile-size Chromium each have their own results;
  emulated iPhone WebKit is kept in a separate comparison population.

## Relevant sources

- `harden-tests/runs/README.md`
- `scripts/test-run-all.sh`
- `scripts/run-smoke-tests.sh`
- `frontend/scripts/`
- `backend/src/main/java/com/know/service/SearchService.java`
- `backend/src/main/java/com/know/service/ReportService.java`
