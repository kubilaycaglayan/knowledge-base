# OTOTEST-05 local release gate evidence

| Field | Value |
| --- | --- |
| Milestone / acceptance IDs | OTOTEST-05; gate policy, consistency check, evidence record |
| Reviewed source revision | Baseline: `a488663c` (`Bug fix step 2: Exclude Node suites from Vitest`); later supplements identify their exact source revisions |
| Date (UTC) | 2026-10-10 |
| Owner | Knowledge Base maintainers |
| Browser and profile | Hosted browser evidence is detailed below. Local Playwright runs used desktop Chromium; the packaged extension used a fresh disposable Chrome profile; Orca 46 ran in its disposable container. Phone viewports are browser emulation and are not physical Android evidence. |
| Result | Listed automated checks passed locally unless a limitation is stated below |
| CI run/artifact URL | [Hosted `verify` run 38094837246](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38094837246), passed for commit `f7a9b6ba6aabc6819835a67f0fda0c8452272898` |

## 2026-10-11 supplement — Notes archive recovery and restore state

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Notes component restore duplicate guard | `cd frontend && npx vitest run src/views/NotesView.test.ts` at source revision `30d93f70` | Pass: 43/43 tests; a delayed restore disables the control, shows its spinner, and a repeated activation does not issue a second POST |
| Notes archive and restore real-stack acceptance | `./scripts/run-notes-e2e.sh` at source revision `30d93f70` | Pass: 2/2 tests in the isolated disposable Compose project; desktop Chromium confirms exact archive prompt, forced UI-layer 503 with retained active state and successful retry, fresh active/archive membership reads, then one active copy and no archived copy after restore and reload |
| Frontend production build | `cd frontend && npm run build` at source revision `30d93f70` | Pass: TypeScript and Vite build; existing large Reports chunk warning remains |
| OTOTEST inventory integrity | `node scripts/check-ototest-inventory.mjs` after evidence reconciliation | Pass: 18 documents, 107 API rows, and 307 qualified API test references |

The archive failure is deliberately simulated at the browser/API boundary; it
verifies UI recovery while fresh server reads confirm no persisted archive
occurred. The archived-note label-preservation acceptance remains open.

## 2026-10-11 supplement — referenced identifier ownership

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Foreign Label reference rejection and unchanged owner state | `docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --tests com.know.integration.LogLabelsIntegrationTest --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"` at source revision `91e97d13` | Pass: the two-account integration test rejects the foreign Label ID with 400, then rereads the owner's Log to confirm its prior Label remains and confirms the foreign owner's Label remains in its own catalog |

## 2026-10-11 supplement — browser failure artifact safety

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Trace redaction and failure capture | `cd frontend && node --test scripts/browser-failure-artifacts.test.mjs` at source revision `4f2c8ec8` | Pass: 2/2 tests redact authorization/bearer/basic values, cookies, passwords, access tokens, and email addresses; failure capture disables screenshot recording and deletes an unsanitizable trace |
| Artifact policy and OTOTEST inventory | `node scripts/check-browser-artifact-policy.mjs`; `node scripts/check-ototest-inventory.mjs`; `git diff --check`; `bash -n scripts/run-line-history-e2e.sh scripts/run-timer-websocket-e2e.sh` | Pass: workflow run/attempt and commit linkage, failure-only upload, 14-day retention, trace redaction, inventory integrity (18 docs, 107 API rows, 307 qualified API references), whitespace, and shell syntax |

## 2026-10-11 supplement — required packaged extension browser gate

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Packaged extension browser acceptance | `./scripts/run-extension-browser-e2e.sh` at source revision `2e0e4450` | Pass: 3/3 Chromium tests against the built Manifest V3 package and isolated loopback API fixture; checks popup/options and manifest host permissions, Clockify content-script to service-worker delivery, timer and Notes fixture state, unavailable API recovery, and worker restart in the temporary persistent profile |
| CI registration and reconciled inventory | `node scripts/check-ototest-inventory.mjs`; `git diff --check` | Pass: inventory integrity across 18 docs, 107 API rows, and 307 qualified API references; `verify / web-and-extension` now runs the packaged extension browser suite as a pull-request gate |
| Hosted `verify` | [`verify` run 38100516626](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38100516626) | Pass for commit `fa7029cccaaed28febca35a176b0a3d56098af2e`; the new packaged extension browser step passed along with all active jobs, including smoke, timer WebSocket, line history, Orca, backend, and PostgreSQL/Flyway; historical iOS jobs skipped as configured |

## 2026-10-11 supplement — authenticated route and shell browser gate

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Web route and control browser acceptance | `cd frontend && node --test --test-concurrency=1 scripts/nav-shell.acceptance.test.mjs` at source revision `8a9ee57f` | Pass: 105/105 sequential Chromium tests with an isolated cold Vite cache in about 131 seconds; covers primary-route navigation/title/active state, level-one headings (including the added Labels heading), focus and mobile shell controls, browser history, keyboard/touch interactions, global search empty/error states, theme persistence, and representative page controls against mocked API fixtures. The first test asserts the lazy Vuetify dependencies are optimized before browser checks begin. Route setup uses direct browser navigation and waits for the rendered shell; dedicated client-navigation tests preserve SPA cache assertions. |
| Artifact/gate policy and OTOTEST inventory | `node scripts/check-browser-artifact-policy.mjs`; `node scripts/check-ototest-inventory.mjs`; `git diff --check` | Pass: required route browser command and evidence policy are checked; inventory integrity across 18 documents, 107 API rows, and 307 qualified API references |
| Hosted `verify` after cold-start and extension event repairs | [`verify` run 38102026152](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38102026152) | Pass for commit `3f05a587f6f61306b12a285bf4423c467903b8ba`; the cold-cache route/control suite and packaged extension browser acceptance both passed, as did all active smoke, timer, line-history, Orca, backend, and PostgreSQL/Flyway jobs; historical iOS jobs skipped as configured |
| Hosted `verify` after route-harness repair | [`verify` run 38103365529](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38103365529) | Pass for commit `7a647a42d854d4bda8fd3d398b63063ffd674a19`; all active web/extension, backend, PostgreSQL, smoke, timer, line-history, and Orca jobs passed; historical iOS jobs skipped as configured |
| Hosted `verify` after global-search failure-state acceptance | [`verify` run 38104510528](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38104510528) | Pass for commit `8a9ee57f564e907ca1c6474d1f6c4a7cc1a5a9c1`; the new empty/error/stale-result browser assertion and all other active jobs passed; historical iOS jobs skipped as configured |

## 2026-10-11 supplement — PostgreSQL test target isolation

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| PostgreSQL empty-database suite and migrated-schema startup | [`verify / backend-postgres`, run 38103757836](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38103757836/job/114364831764) | Pass: service database `kb_test_ci_38103757836_1`; the test guard validates the disposable marker, loopback host, resolved database identity and empty schema before migration, then validates successful Flyway history for migrated startup (v67). The PostgreSQL service is scoped to the CI job and is removed by job teardown. |

## 2026-10-11 supplement — unknown URL fallback

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Unknown URL browser acceptance | `cd frontend && node --test --test-concurrency=1 --test-name-pattern='shows a safe not-found page' scripts/nav-shell.acceptance.test.mjs` at source revision `11a887ce` | Pass: 1/1 Chromium assertion at 1440px desktop and 390px phone-width emulation; page title and identity are explicit, unrelated protected views are absent, Sessions recovery works, and its target is at least 44px high |
| Protected deep-link sign-in and safe redirect | `cd frontend && node --test --test-concurrency=1 --test-name-pattern='keeps protected deep-link content hidden while signed out and restores it after sign-in|rejects external and protocol-relative post-login redirects' scripts/nav-shell.acceptance.test.mjs` at source revision `f69519de` | Pass: 2/2 Chromium assertions; signed-out `/reports` content is hidden, successful sign-in restores the internal route and query, and external/protocol-relative redirect values land at same-origin Sessions |
| URL-backed Reports filters and browser history | `cd frontend && node --test --test-concurrency=1 --test-name-pattern='restores report filters after navigation and browser Back/Forward|loads report filters from a direct query URL and keeps them on reload|switches report aggregation by keyboard and preserves Path and Label filters' scripts/nav-shell.acceptance.test.mjs` at source revision `84622df3` | Pass: 3/3 Chromium assertions; selection updates query, reload and Back/Forward restore the date, aggregation, Path and Label controls and selected chips, and the mock returns the matching visible Path breakdown and total |
| User-visible mutation failure, retry, and duplicate prevention | `cd frontend && node --test --test-concurrency=1 --test-name-pattern='keeps a Note draft open when autosave fails during navigation and recovers on retry' scripts/nav-shell.acceptance.test.mjs` at source revision `5a866446` | Pass: 1/1 Chromium assertion; a forced failed update is visibly “Not saved,” retains the draft and blocks navigation; Retry becomes “Saved,” navigation succeeds, and exactly one Note remains in the list |
| Navigation and route browser suite | `cd frontend && npm run test:nav` at source revision `11a887ce` | Pass: 102/102 sequential Chromium tests. Two prior suite runs exposed an immediate Notes archive excerpt assertion before asynchronous rendering completed; the assertion now waits for the excerpt, and the full suite passed after that change. |
| Frontend production build | `cd frontend && npm run build` at source revision `11a887ce` | Pass: TypeScript and Vite build; existing large Reports chunk warning remains |
| App shell route-title regression | `cd frontend && npx vitest run src/App.test.ts src/App.warmup.test.ts`; `cd frontend && npm run build` at source revision `150dcfb6` | Pass: 15 tests across both files and production build. The not-found page title now reads the injected route location, which also supports the router stub used by the warm-up tests. |
| Accessibility and inventory | `node scripts/check-accessibility.mjs`; `node scripts/check-ototest-inventory.mjs`; `git diff --check` | Pass: 38 accessibility checks; inventory integrity across 18 docs, 107 API rows, and 307 qualified API references |

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
| Notes deep-link, persistence, restore, and ownership journey | `./scripts/run-notes-e2e.sh` at commit `3a6950b8` | Pass: 2 tests against a unique disposable Compose project and PostgreSQL database; desktop Chromium 1440 × 900 for note create/edit/deep-link/archive/restore, and a second 390 × 844 browser context for foreign/missing IDs | `creates, edits, deep-links, archives, restores, and reloads a note with persisted API state` verifies the visible save, reload and direct `/notes/:id` load against fresh API state; `rejects foreign note reads and keeps missing or foreign deep links private` verifies API 404, identical generic route errors, and no generated title marker disclosure; the runner removed its isolated project on exit |
| Repository checks | `node scripts/check-accessibility.mjs`; `node scripts/check-security.mjs`; `node scripts/check-smoke-cleanup.mjs`; `node scripts/check-hardening-status.mjs`; `node --check chrome-extension/popup.js`; `node --check chrome-extension/options.js`; `bash -n scripts/run-smoke-tests.sh deployment/backup.sh deployment/preflight.sh`; `./scripts/check-image-prune.sh`; `git diff --check` | Pass: accessibility 38 checks, security 49, cleanup 17; syntax and image-prune checks passed |
| Hosted `verify` | [GitHub Actions run 38094837246](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38094837246) | Pass for commit `f7a9b6ba6aabc6819835a67f0fda0c8452272898`: backend, PostgreSQL/Flyway, web and extension build/integrity, deployed-shaped smoke, timer WebSocket, line history, and Orca jobs passed; historical iOS jobs skipped as configured |
| Hosted `verify` on updated evidence record | [GitHub Actions run 38095089167](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38095089167) | Pass for commit `b484034e3ba51cd045dda33c2af0247d0a8a04b1`; all active jobs passed, including OTOTEST integrity; iOS jobs skipped as configured |
| Hosted `verify` with matrix-owner enforcement | [GitHub Actions run 38095487142](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38095487142) | Pass for commit `ad3534efb457221ec68da95551cf6572cfcbeea2`; all active jobs passed, including owner metadata validation; iOS jobs skipped as configured |
| Hosted `verify` with route and browser evidence | [GitHub Actions run 38095729135](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38095729135) | Pass for commit `de2f1aaead21547ef1b731232333190776ffe050`; all active jobs passed, including browser jobs linked below |
| Hosted `verify` after unknown URL fallback and title regression repair | [GitHub Actions run 38097563609](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38097563609) | Pass for commit `1403be0c5035a1ffe85a8afbd5c01999be7e9d29`; all active jobs passed, including web build and OTOTEST inventory integrity; iOS jobs skipped as configured |

## Hosted real-browser evidence

| Journey | Command and CI job | Browser/profile and viewport | Named assertions and result |
| --- | --- | --- | --- |
| Timer synchronization and auth rate-limit recovery | `./scripts/run-timer-websocket-e2e.sh`; [`verify / timer-websocket-e2e`](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38095729135/job/114341105047) | Headless Chromium; timer app 1280 × 800; auth rate-limit desktop 1440 × 900 and mobile-size emulation 390 × 844 | 5 passed: authenticated rate-limit recovery in desktop and mobile-size profiles; timer socket sync without polling, HTTP polling fallback, and failed-save draft retry |
| Note and board-card line history | `./scripts/run-line-history-e2e.sh`; [`verify / line-history-e2e`](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38095729135/job/114341105094) | Headless Chromium; desktop 1280 × 900 and phone emulation 390 × 844 with touch; dark-mode phone layout | 13 passed across Notes, line history assistive behavior, cross-client conversion compatibility, and board-card line history; includes fresh API readback, reload, conflict/retry, and Axe assertions |

These successful jobs expose their test logs through the linked job pages and
do not upload passing artifacts. On failure, the workflow uploads scrubbed
traces and diagnostics for 14 days. Trace screenshot capture is disabled;
traces redact credentials, tokens, cookies, and account email, and run metadata
uses generated disposable accounts. No physical Android device is represented
by the emulated viewport.

## Failed-gate repair record

The first hosted run, [38094630686](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38094630686/job/114337903037), failed at **Check OTOTEST inventory integrity**. The checker correctly found a Markdown link to `backend/build/reports/tests/test/index.html`; that report is generated locally and is not committed, so the link appeared valid only in the developer worktree. This was a documentation/inventory integrity failure, not a product behavior failure. The checklist now describes the generated report as a local path while preserving links to hosted test runs as reviewable evidence. The repaired inventory check passed in [run 38094837246](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38094837246) and again in [run 38095089167](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38095089167).

The hosted run [38097371137](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38097371137) failed in `web-and-extension` while running `App.warmup.test.ts`: the new title check accessed `router.currentRoute`, which that test's injected router stub does not provide. Revision `150dcfb6` reads the route name from the already-injected route location instead and adds a title regression test. Both App test files then passed locally (15 tests), and the full hosted rerun passed in [run 38097563609](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38097563609).

The new required route/control gate first failed in [run 38101172915](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38101172915): after 1 of 103 browser cases passed, Vite optimized lazy Vuetify imports and reloaded the page while the 1440px navigation-bar assertion was reading it. A warm-cache local run had passed, so the CI failure exposed a cold-start test-harness race. Revision `c18d730b` adds an isolated cold Vite cache and a regression assertion that fails unless the shell's lazy Vuetify dependencies are optimized before browser assertions. Revision `b21347f8` explicitly pre-optimizes those dependencies in the acceptance harness; the regression, route-specific assertions, and full cold-cache suite then passed locally (104/104). The route/control step passed in [run 38101643595](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38101643595/job/114358606586); a later step in that job failed as recorded below.

In [run 38101643595](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38101643595), the packaged extension browser test missed the Options tab event because it registered `waitForEvent("page")` after clicking the item that opens the tab; the first test timed out while the other two passed. Revision `3f05a587` registers the event waiter before the click. The local packaged extension suite then passed 3/3, and the fixed suite passed in hosted [run 38102026152](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38102026152). The same failed run's unrelated backend job could not resolve four Gradle classpath artifacts from the Plugin Portal and exited during project configuration; the next full run passed backend and PostgreSQL jobs, confirming it was transient dependency resolution.

Hosted route gate [38102316159](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38102316159) timed out when its `visit()` helper changed the URL by dispatching a synthetic `popstate`; disabling Vite HMR and using a cold cache in `ed4a4477` did not resolve a second occurrence in [run 38102780396](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38102780396). Revision `7a647a42` changes `visit()` to use direct browser navigation and waits for the application shell to render. The logo and warm-up cache assertions use actual navigation links so they continue to test client-side routing and cache reuse. The full cold-cache route suite passed locally (104/104), including the WU-10 warm-up check, and the complete hosted `verify` workflow passed in [run 38103365529](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38103365529); its active jobs passed, with the two historical iOS jobs skipped.

## Source reconciliation

- At the 2026-10-10 baseline, `frontend/src/main.ts` had 19 route declarations.
  Revision `11a887ce` adds the catch-all not-found route; `01-route-matrix.md`
  now records all 20 route entries/patterns.
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
