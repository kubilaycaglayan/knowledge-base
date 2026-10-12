# OTOTEST-06 runtime records and acceptance checklist

Records for [OTOTEST-06 — Test runtime efficiency](06-test-runtime-efficiency.md).
Fill these tables while working; follow the measurement protocol in the
milestone document. Times are medians of three runs unless stated otherwise.
Keep raw reports out of the repository.

## Environment

| Field | Baseline | After milestone |
| --- | --- | --- |
| Commit | 4ff6b07895d50063536360ff7e85980179f4a9bf | 25e5cefd614f659280c24f44c6d1df1e8c3d9a4b |
| Date | 2026-10-11 | 2026-10-12 |
| Host / CI runner | art (Linux x86_64) | art (Linux x86_64); GitHub Actions `ubuntu-latest` |
| CPU threads | 32 | 32 |
| Node.js / npm | v22.23.3 / 10.9.9 | v22.23.3 / 10.9.9 |
| Docker / Compose | 29.8.2 / v5.6.0 | 29.8.2 / v5.6.0 |
| Gradle image | gradle:8.13-jdk21 (image present) | gradle:8.13-jdk21 (warm local cache) |
| Cache state (cold/warm) | Warm frontend dependencies and OS caches | Warm Node, Gradle, Docker layer, and Playwright browser caches |

## Suite baseline (OTOTEST-06-T0)

| Suite / command | Files | Tests | Wall median (s) | CPU % | Slowest file/class (s) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Frontend `npm test` | 70 | 866 | 23.54 | 653 | NotesView.test.ts 18.5 | Three warm runs on art |
| CI policy/meta tests | 11 | 41 | 0.21 | — | — | Vitest scope, OTOTEST contracts, browser artifact checks; batched three runs |
| Frontend `npm run build` | — | — | 1.16 | — | — | Three warm runs: 1.28, 1.16, 1.15 s |
| `npm run test:tracker` | 1 | 10 | 8.29 | 90 | browser acceptance | Three baseline runs at concurrency 4: 8.29, 8.32, 8.27 s |
| `npm run test:board` | 1 | 155 | 120.08 | 80 | browser acceptance | Three baseline runs; one known lazy-boundary flake in one run |
| `npm run test:nav` | 1 | 176 | 313.28 | 70 | browser acceptance | Three serial baseline runs; no known failures |
| `npm run test:ui` | 1 | 168 audits | 171.68 | 39 | route/theme/state scenarios | Three runs: 169.91, 171.75, 171.68 s; zero failures |
| Extension `npm test` | 9 | 55 | 0.20 | 276 | — | Three runs; direct all-files `node --test` also 55/55 at 0.12 s |
| Extension build | — | — | 0.64 | 174 | — | Three warm runs: 0.84, 0.64, 0.58 s |
| Repository checks (`check-*`, shell syntax) | — | 278 checks | 0.98 | 170 | — | Three runs; Caddy validation separately 0.30 s median |
| Backend Gradle test, H2 (warm) | 98 | 610 (89 skipped) | 45.54 | 340 | KnowIntegrationTest 6.1 | Three warm runs; Gradle 8.13 JDK 21 container |
| Backend Gradle test, H2 (cold) | 98 | 610 (89 skipped) | 71.41 | — | KnowIntegrationTest 6.1 | First run also resolved dependencies and compiled |
| Backend Gradle test, PostgreSQL | 98 | 610 | 54.93 | — | KnowIntegrationTest 7.7 | Disposable local PostgreSQL 16, empty database; one run |
| Smoke `run-smoke-tests.sh` | — | — | 75.46 | — | — | After 71.36 s: image/start 50.28 s, ready 5.43 s, checks 13.81 s; one isolated plain stack |
| Smoke `SMOKE_FULL_STACK=1` | — | — | 75.97 | — | — | After 75.91 s: image/start 53.58 s, ready 5.42 s, checks 14.65 s; includes backup/restore |
| `run-board-e2e.sh` | 1 | 29 | 70.47 | — | — | After 31.67 s: build/start 3.36 s, ready 5.31 s, tests 22.98 s |
| `run-search-e2e.sh` | 1 | 13 | 55.82 | — | — | After 53.86 s: build/start 3.53 s, ready 5.30 s, tests 45.03 s |
| `run-timer-websocket-e2e.sh` | 1 | 4 + 2 auth UI runs | 33.17 | — | — | After 29.85 s: build/start 3.34 s, ready 5.03 s, auth + WebSocket + tests 21.48 s |
| `run-line-history-e2e.sh` | 4 | 13 | 24.96 | — | — | After 22.52 s: build/start 3.33 s, ready 5.30 s, tests 13.89 s |
| `run-line-history-orca.sh` | — | — | 33.62 | — | — | After 30.76 s: image/start 3.49 s, ready 4.52 s, acceptance 22.75 s |
| `test-run-all.sh --quick` | — | — | 219 | — | — | Passed in 3m39s; no comparable successful clean baseline retained |
| `test-run-all.sh` (full) | — | — | 300 | 401 | — | After full aggregate includes 168 UI audits and Orca; matching core step set previously measured 248 s before those suites were added |
| CI `verify` workflow (3 runs) | — | — | 433 | 288 | -145 | Baseline median 433 s; after same-SHA runs 215, 288, 311 s (median 288 s) |

## Per-task comparison

One row per kept or reverted change. “Δ” is after minus baseline; a negative
value is an improvement.

| Task | Change (commit) | Suite measured | Tests before → after | Baseline (s) | After (s) | Δ (s) | Δ % | Stability evidence | Kept? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Fake NotesView timers (7fc67590) | Frontend `npm test` | 866 → 866 | 23.54 | 11.25 | -12.29 | -52.2% | Yes; focused suite 5/5 | Yes |
| T2 | Vitest `threads` pool (29786515) | Frontend `npm test` | 866 → 866 | 11.25 | 10.90 | -0.35 | -3.1% | Yes; full suite 5/5 | Yes |
| T3 | Playwright controlled clocks (e89f6926) | `test:board`, `test:nav` | 155 → 155; 176 → 176 | 120.08; 313.28 | 124.36; 295.69 | +4.28; -17.59 | +3.6%; -5.6% | Board 5/5; nav covered in T4 5/5 | Yes; the board ring test fell from 7.1s to 0.8s, though suite wall time varied |
| T4 | Parallel nav (7), tracker (30), and aggregate browser suites; pre-optimize board Vite | `test:nav`, `test:tracker`, `test:board`, aggregate trio | 176 → 176; 10 → 10; 155 → 155; 341 → 341 | 295.69; 8.29; 120.08; 221.64 summed | 100 at nav 7; 7.15 at tracker 30; 123.39 board; 191 combined in final full aggregate | -195.69; -1.14; +3.31; -30.64 | -66.2%; -13.8%; +2.8%; -13.8% | Five final nav runs passed; tracker, board, and earlier trio each passed five-run checks | Yes; nav 30 was slower/flaky; tracker 30 is its six-case cap; suites keep independent servers/fixtures; board pre-optimization fixes cold-start failure without a runtime claim |
| T4 UI | Run the ten isolated UI audit scenarios concurrently, with a serial cold-start warmup | `npm run test:ui` | 168 → 168 audits | 171.68 | 54 median at concurrency 10 | -117.68 | -68.6% | Five final runs passed | Yes; concurrency 4 took 66.33 s before warmup; ten is the independent scenario cap |
| T5 | H2 Gradle forks (4), PostgreSQL serial guard, CI Gradle cache | Backend Gradle | 610 → 610 (H2: 89 skipped; PG: 0 skipped) | 45.54 warm H2; 54.93 PG | 37.75 H2; 55.48 PG | -7.79 H2; +0.55 PG | -17.1% H2; +1.0% PG | Yes; H2 5/5 and PG 5/5 | Yes; 8 forks took 41.0s; PG stays serial to preserve the empty-database guard |
| T6 | 250 ms readiness polling, GHA BuildKit cache reuse, shared local stack | Smoke + real-stack E2E | 61 per concurrent group | 98 serial sum | 45 s observed group; 44.67 s median search critical path | -53 | -54.1% | Five groups passed all 61 tests | Yes; exact compose cleanup preserved; standalone phase timings recorded above |
| T7 | Separate nav browser job, run cancellation, Playwright cache, combined Caddy checks | CI `verify` workflow | Same Linux test suite coverage | 433 whole-workflow median | 288 median (215, 288, 311) | -145 | -33.5% | 3/3 full same-SHA runs green | Yes |
| T8 | Remove duplicate extension test invocation; one-container Caddy validation; probe parallel repository checks | Extension, repository checks | 55 → 55; 278 repository checks | 0.20 extension tests; 0.98 repository checks | 0.20; 0.98 serial baseline | 0 | 0% | Three parallel probes passed | Kept duplicate removal and Caddy consolidation; repository parallelism showed no gain and was reverted |
| T8 probe | Parallel repository-check wrapper | Repository checks | 278 checks unchanged | 0.98 | 0.98 median (1.07, 0.98, 0.84) | 0 | 0% | Three runs | No; no measurable gain |

## Milestone comparison

| Measure | Baseline | After | Δ | Δ % |
| --- | --- | --- | --- | --- |
| Frontend `npm test` wall time | 23.54 | 10.90 | -12.64 | -53.7% |
| UI route/theme/state audit | 171.68 | 54 | -117.68 | -68.6% |
| Mocked browser suites (tracker + board + nav) | 221.64 summed | 191 combined in final full run | -30.64 | -13.8% |
| Backend Gradle test wall time (H2 / PostgreSQL) | 45.54 / 54.93 | 37.75 / 55.48 | -7.79 / +0.55 | -17.1% / +1.0% |
| Extension and repository checks | 0.20 / 0.98 | 0.20 / 0.98 | 0 / 0 | 0% / 0% |
| Smoke and real-stack stage | Plain/full smoke 75.46/75.97; serial E2E 98 s | Plain/full smoke 71.36/75.91; parallel E2E 45 s | -4.10/-0.06; -53 | -5.4%/-0.1%; -54.1% |
| `test-run-all.sh --quick` | No successful comparable clean baseline | 219 s | — | — |
| `test-run-all.sh` (full) | 300 s core set | 401 s with UI and Orca coverage | +101 s raw total | +33.7% with added coverage; matching core steps previously measured 248 s (-17.3%) |
| CI `verify` workflow wall time | 433 s median (three baseline runs) | 288 s median (three same-SHA after runs) | -145 s | -33.5% |

## Acceptance checklist

- [x] T0 baseline recorded for every suite in the table above, with test
  counts and environment line.
- [x] Every task row has baseline and after medians from the same environment.
- [x] Test counts are unchanged, or every difference is explained by a
  documented split or move that keeps all test names.
- [x] Every changed suite passed five consecutive runs after its change.
- [x] Changes without measurable gain were reverted and recorded with
  `Kept? = no`.
- [x] No real-time sleep remains in `frontend/src/**/*.test.ts` without a
  documented reason.
- [x] Mocked browser suites have no unexplained fixed `waitForTimeout` above
  the agreed threshold.
- [x] Isolation rules hold: disposable Compose projects and accounts,
  project-scoped cleanup, `node scripts/check-smoke-cleanup.mjs` passes, and
  the production PostgreSQL volume was never touched.
- [x] The milestone comparison table is complete and states the overall
  percentage change for `test-run-all.sh` and CI `verify`.
- [x] `docs/testing.md`, the roadmap, and the milestone index are updated.
