# HARD-05: Fixed-data performance baselines

**Priority:** Medium  
**Status:** Planned  
**Scope:** Measurement and test infrastructure documentation only.

Track completion in the [HARD-05 acceptance checklist](05-acceptance-checklist.md).

## Why this milestone exists

Run reports currently have a performance section but no measured baseline.
Without repeated, fixed-data measurements, a regression gate would be noisy and
hard to interpret. This milestone first makes the inputs and environment
reproducible, then establishes report-only measurements.

## Tasks

- [ ] Select representative journeys: authenticated app startup/warmup, global
  search for exact and near-match queries, board first page and next page,
  Gantt range load, report range load, note save, timer start/stop and WebSocket
  update. Include API-only timings for the corresponding expensive endpoints.
- [ ] Specify deterministic seed data sizes and content, including sparse and
  dense accounts, enough board cards to cross page boundaries, and search data
  that exercises indexes. Keep the fixture generator versioned and disposable.
- [ ] Capture client and server environment: commit, image digests, browser and
  Playwright versions, viewport/profile, CPU/memory limits, Node/JDK/PostgreSQL
  versions, network conditions, and warm/cold cache state.
- [ ] Define sample count, warmup count, median, p95, and outlier handling.
  Separate startup/cold-cache observations from steady-state samples.
- [ ] Add a report-only runner and append results to the per-run report format
  in `harden-tests/runs/README.md`; never compare measurements from different
  environment/profile classes as though they were equivalent.
- [ ] Run enough repeat commits or repeated same-commit batches to estimate
  natural variance. Record noise sources and a rerun policy.
- [ ] Only after the baseline is stable, propose per-journey regression bands
  (the current planning target is 20%) with rationale, minimum absolute/relative
  thresholds, and a documented override path. Do not enable a failing CI gate
  until the evidence supports it.

## Acceptance evidence

- A committed or artifact-linked report contains reproducible fixture
  instructions, environment metadata, sample counts, median and p95 values.
- At least two comparable runs establish variance for each gated metric.
- Initial collection is report-only. Any gate is separately reviewed against
  observed noise and has a documented rerun/override policy.
- No personal records or credentials appear in generated fixtures or reports.

## Relevant sources

- `harden-tests/runs/README.md`
- `scripts/test-run-all.sh`
- `scripts/run-smoke-tests.sh`
- `frontend/scripts/`
- `backend/src/main/java/com/know/service/SearchService.java`
- `backend/src/main/java/com/know/service/ReportService.java`
