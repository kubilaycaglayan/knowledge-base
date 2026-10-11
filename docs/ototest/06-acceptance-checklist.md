# OTOTEST-06 runtime records and acceptance checklist

Records for [OTOTEST-06 — Test runtime efficiency](06-test-runtime-efficiency.md).
Fill these tables while working; follow the measurement protocol in the
milestone document. Times are medians of three runs unless stated otherwise.
Keep raw reports out of the repository.

## Environment

| Field | Baseline | After milestone |
| --- | --- | --- |
| Commit | 4ff6b07895d50063536360ff7e85980179f4a9bf | |
| Date | 2026-10-11 | |
| Host / CI runner | art (Linux x86_64) | |
| CPU threads | 32 | |
| Node.js / npm | v22.23.3 / 10.9.9 | |
| Docker / Compose | 29.8.2 / v5.6.0 | |
| Gradle image | gradle:8.13-jdk21 (image present) | |
| Cache state (cold/warm) | Warm frontend dependencies and OS caches | |

## Suite baseline (OTOTEST-06-T0)

| Suite / command | Files | Tests | Wall median (s) | CPU % | Slowest file/class (s) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Frontend `npm test` | 70 | 866 | 23.54 | 653 | NotesView.test.ts 18.5 | Three warm runs on art |
| Frontend `npm run build` | — | — | | | — | |
| `npm run test:tracker` | | | | | | |
| `npm run test:board` | | | | | | |
| `npm run test:nav` | | | | | | |
| `npm run test:ui` | | | | | | |
| Extension `npm test` + build + `node --test` files | | | | | | |
| Repository checks (`check-*`, shell syntax, Caddy) | — | — | | | | |
| Backend Gradle test, H2 (warm) | | | | | | |
| Backend Gradle test, H2 (cold) | | | | | | |
| Backend Gradle test, PostgreSQL | | | | | | |
| Smoke `run-smoke-tests.sh` | — | — | | | — | build / ready / test split: |
| Smoke `SMOKE_FULL_STACK=1` | — | — | | | — | build / ready / test split: |
| `run-board-e2e.sh` | | | | | | build / ready / test split: |
| `run-search-e2e.sh` | | | | | | build / ready / test split: |
| `run-timer-websocket-e2e.sh` | | | | | | build / ready / test split: |
| `run-line-history-e2e.sh` | | | | | | build / ready / test split: |
| `run-line-history-orca.sh` | | | | | | |
| `test-run-all.sh --quick` | — | — | | | — | |
| `test-run-all.sh` (full) | — | — | | | — | |
| CI `verify` workflow (3 runs) | — | — | | — | — | critical-path job: |

## Per-task comparison

One row per kept or reverted change. “Δ” is after minus baseline; a negative
value is an improvement.

| Task | Change (commit) | Suite measured | Tests before → after | Baseline (s) | After (s) | Δ (s) | Δ % | 5× green | Kept? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Fake NotesView timers (pending commit) | Frontend `npm test` | 866 → 866 | 23.54 | 11.25 | -12.29 | -52.2% | Yes; focused suite 5/5 | Yes |
| T2 | | Frontend `npm test` | | | | | | | |
| T3 | | `test:board`, `test:nav` | | | | | | | |
| T4 | | `test:board`, `test:nav` | | | | | | | |
| T5 | | Backend Gradle, CI backend jobs | | | | | | | |
| T6 | | Smoke, real-stack runners, CI e2e jobs | | | | | | | |
| T7 | | CI `verify` workflow | | | | | | | |
| T8 | | Extension, repository checks | | | | | | | |

## Milestone comparison

| Measure | Baseline | After | Δ | Δ % |
| --- | --- | --- | --- | --- |
| Frontend `npm test` wall time | | | | |
| Mocked browser suites (tracker + board + nav) | | | | |
| Backend Gradle test wall time (H2 / PostgreSQL) | | | | |
| Extension and repository checks | | | | |
| Smoke and real-stack stage | | | | |
| `test-run-all.sh --quick` | | | | |
| `test-run-all.sh` (full) | | | | |
| CI `verify` workflow wall time | | | | |

## Acceptance checklist

- [ ] T0 baseline recorded for every suite in the table above, with test
  counts and environment line.
- [ ] Every task row has baseline and after medians from the same environment.
- [ ] Test counts are unchanged, or every difference is explained by a
  documented split or move that keeps all test names.
- [ ] Every changed suite passed five consecutive runs after its change.
- [ ] Changes without measurable gain were reverted and recorded with
  `Kept? = no`.
- [ ] No real-time sleep remains in `frontend/src/**/*.test.ts` without a
  documented reason.
- [ ] Mocked browser suites have no unexplained fixed `waitForTimeout` above
  the agreed threshold.
- [ ] Isolation rules hold: disposable Compose projects and accounts,
  project-scoped cleanup, `node scripts/check-smoke-cleanup.mjs` passes, and
  the production PostgreSQL volume was never touched.
- [ ] The milestone comparison table is complete and states the overall
  percentage change for `test-run-all.sh` and CI `verify`.
- [ ] `docs/testing.md`, the roadmap, and the milestone index are updated.
