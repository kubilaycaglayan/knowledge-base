# OTOTEST-05 local release gate evidence

| Field | Value |
| --- | --- |
| Milestone / acceptance IDs | OTOTEST-05; gate policy, consistency check, evidence record |
| Reviewed source revision | `a488663c` (`Bug fix step 2: Exclude Node suites from Vitest`); docs and inventory edits were in the worktree during the run |
| Date (UTC) | 2026-10-10 |
| Owner | Knowledge Base maintainers |
| Browser and profile | Playwright desktop Chromium; packaged extension used a fresh disposable profile; Orca 46 in its disposable container |
| Result | Listed automated checks passed locally unless a limitation is stated below |
| CI run/artifact URL | [Hosted `verify` run 38094837246](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38094837246), passed for commit `f7a9b6ba6aabc6819835a67f0fda0c8452272898` |

## Gate results

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Inventory integrity | `node scripts/check-ototest-inventory.mjs` | Pass: local links, duplicate route/API keys, source/evidence classifications, milestone status synchronization, and all 307 unique qualified API evidence references resolving to Java test methods |
| Frontend component and build | `cd frontend && node --test scripts/vitest-scope.test.mjs && npm test && npm run build` | Pass: scope regression test; Vitest 69 files / 853 tests; production build. Build reports the existing large Reports chunk warning. |
| Backend unit/API integration | `docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"` | Pass |
| PostgreSQL and Flyway | Disposable PostgreSQL 16 container and unique `kb_test_ototest_05_*` database on loopback port 25432; full Gradle suite with `KB_TEST_POSTGRES_MODE=empty`, then `gradle test --no-daemon --tests '*SearchPostgresIntegrationTest'` with `KB_TEST_POSTGRES_MODE=migrated`; both used `KB_TEST_POSTGRES_DISPOSABLE=true` and the isolated Gradle cache | Pass; evidence target `kb_test_ototest_05_20261010230529_2941486`, PostgreSQL 16.15; test container stopped and removed by the run trap |
| Extension module and build | `(cd chrome-extension && npm test && npm run build)` | Pass: 55 tests; packaged Manifest V3 build |
| Extension browser | `./scripts/run-extension-browser-e2e.sh` | Pass: 3 Chromium tests covering popup/options configuration, Clockify message bridge, timer sync, and unavailable API recovery |
| Deployed-shaped smoke | `SMOKE_FULL_STACK=1 SMOKE_BACKUP_RESTORE=1 COMPOSE_PROJECT_NAME=ototest05-smoke-local JWT_SECRET='<local-only secret>' POSTGRES_PASSWORD='<local-only password>' ./scripts/run-smoke-tests.sh` | Pass; isolated Compose project cleanup completed |
| Timer browser | `./scripts/run-timer-websocket-e2e.sh` | Pass: browser journey and WebSocket round trips |
| Line-history browser | `./scripts/run-line-history-e2e.sh` | Pass: 13 tests |
| Screen reader browser | `./scripts/run-line-history-orca.sh` | Pass: Orca 46 read the line history states and did not announce gutter timestamps |
| OTOTEST-04 feature browser journeys | `./scripts/run-notes-e2e.sh`; `./scripts/run-paths-e2e.sh`; `./scripts/run-logs-e2e.sh`; `./scripts/run-labels-e2e.sh`; `./scripts/run-calendar-e2e.sh`; `./scripts/run-reports-settings-e2e.sh`; `./scripts/run-transfers-e2e.sh` | Pass sequentially; Notes 2 tests and each other suite 1 test. The wrappers share local HTTPS port 26443, so the initial parallel Notes/Transfers attempts collided; both passed when rerun sequentially. |
| Repository checks | `node scripts/check-accessibility.mjs`; `node scripts/check-security.mjs`; `node scripts/check-smoke-cleanup.mjs`; `node scripts/check-hardening-status.mjs`; `node --check chrome-extension/popup.js`; `node --check chrome-extension/options.js`; `bash -n scripts/run-smoke-tests.sh deployment/backup.sh deployment/preflight.sh`; `./scripts/check-image-prune.sh`; `git diff --check` | Pass: accessibility 38 checks, security 49, cleanup 17; syntax and image-prune checks passed |
| Hosted `verify` | [GitHub Actions run 38094837246](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38094837246) | Pass for commit `f7a9b6ba6aabc6819835a67f0fda0c8452272898`: backend, PostgreSQL/Flyway, web and extension build/integrity, deployed-shaped smoke, timer WebSocket, line history, and Orca jobs passed; historical iOS jobs skipped as configured |

## Source reconciliation

- `frontend/src/main.ts` contains 19 route declarations and
  `01-route-matrix.md` has 19 route rows. The route registry is unchanged
  since the recorded inventory baseline.
- The API matrix has 107 composed method/path rows, matching the 107 pairs in
  the generated `/v3/api-docs` reconciliation recorded at `80fecc6c`. API
  controller sources have no changes between that reconciliation and this
  reviewed source revision. The current matrix has 385 qualified evidence
  references (307 unique class/method pairs); the inventory check resolved all
  307 pairs to existing Java test methods.
- The product-source delta from `origin/main` on this branch is limited to
  `CalendarView.vue` and `NotesView.vue`. The route/control matrices now link
  the Calendar saved-day journey and Notes delayed-load/persistence journey;
  their remaining behavior gaps are still explicit.
- Route, control, and extension matrices classify their rows and assign
  unresolved gaps to Knowledge Base maintainers. The extension implementation
  and manifest are unchanged from `origin/main`; its feature map now links the
  packaged desktop Chromium evidence and its remaining live-provider limits.

## Limits and follow-up

- Hosted `verify` passed for the pushed revision (linked above). The workflow
  does not cover physical Android acceptance.
- This is desktop Chromium evidence. It does not claim physical Android Chrome
  acceptance, Google account consent, a live Clockify session, or host
  permission prompt rendering.
- The source matrices still contain behavior gaps; their presence is not a
  failed gate. Release readiness must retain the documented owners and review
  triggers for those gaps.
- The broad product acceptance flows in `05-acceptance-checklist.md` have not
  all been manually performed; this record only supports the named automated
  assertions and evidence layers above.
