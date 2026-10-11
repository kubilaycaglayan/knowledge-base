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
| Web route and control browser acceptance | `cd frontend && npm run test:nav` at source revision `27707465` | Pass: 105/105 sequential Chromium tests with an isolated cold Vite cache in about 132 seconds; covers primary-route navigation/title/active state, level-one page headings, focus and mobile shell controls, browser history, keyboard/touch interactions, global search empty/error states, running timer visibility and rehydration across routes, theme persistence, and representative page controls against mocked API fixtures. The first test asserts the lazy Vuetify dependencies are optimized before browser checks begin. Route setup uses direct browser navigation and waits for the rendered shell; dedicated client-navigation tests preserve SPA cache assertions. The Path merge case waits for the source row to leave the rendered list before asserting the refreshed state. |
| Current timer service/API evidence | `docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --tests com.know.service.TimerServiceEdgeTest --tests com.know.api.TimerApiTest --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"` at source revision `27707465` | Pass: authenticated current-timer API response returns the running timer, service lookup reads the current user's running entry, and existing service assertions preserve the one-running-timer invariant |
| Artifact/gate policy and OTOTEST inventory | `node scripts/check-browser-artifact-policy.mjs`; `node scripts/check-ototest-inventory.mjs`; `git diff --check` | Pass: required route browser command and evidence policy are checked; inventory integrity across 18 documents, 107 API rows, and 307 qualified API references |
| Hosted `verify` after cold-start and extension event repairs | [`verify` run 38102026152](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38102026152) | Pass for commit `3f05a587f6f61306b12a285bf4423c467903b8ba`; the cold-cache route/control suite and packaged extension browser acceptance both passed, as did all active smoke, timer, line-history, Orca, backend, and PostgreSQL/Flyway jobs; historical iOS jobs skipped as configured |
| Hosted `verify` after route-harness repair | [`verify` run 38103365529](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38103365529) | Pass for commit `7a647a42d854d4bda8fd3d398b63063ffd674a19`; all active web/extension, backend, PostgreSQL, smoke, timer, line-history, and Orca jobs passed; historical iOS jobs skipped as configured |
| Hosted `verify` after global-search failure-state acceptance | [`verify` run 38104510528](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38104510528) | Pass for commit `8a9ee57f564e907ca1c6474d1f6c4a7cc1a5a9c1`; the new empty/error/stale-result browser assertion and all other active jobs passed; historical iOS jobs skipped as configured |
| Hosted `verify` after Path merge list-refresh stabilization | [`verify` run 38105402993](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38105402993) | Pass for commit `74486a2f9ad61ed969596bcb7e8dc4967bcb1b43`; all active jobs passed, including the 105-case route/control suite and packaged extension browser acceptance; historical iOS jobs skipped as configured |
| Hosted `verify` with shared current-timer coverage | [`verify` run 38106221421](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38106221421) | Pass for commit `27707465b15e5efd33dac9a1af8220e8d74a1a1f`; all active jobs passed, including the 105-case route/control suite, current-timer service/API tests, packaged extension, backend, PostgreSQL, smoke, timer WebSocket, line-history, and Orca jobs; historical iOS jobs skipped as configured |

## 2026-10-11 supplement — Android manual evidence recording procedure

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Android evidence procedure and inventory integrity | `node scripts/check-ototest-inventory.mjs` at source revision `d2c5df91`; hosted [`verify` run 38106614036](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38106614036) | Pass: the manual procedure names MOBILE-01–33, requires one status per criterion, and keeps partial sweeps explicit. Hosted active jobs passed for the pushed revision. No physical Android run is claimed; `adb` is unavailable in this environment. |

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

The documentation-only hosted run [38104869153](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38104869153) found a timing race in the Path merge browser case: the test saw the target Path title before the awaited Paths refresh had removed the source row. Revision `74486a2f` waits for that row to detach before checking the final list. The cold-cache suite passed locally (105/105), and all active jobs passed in hosted [run 38105402993](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38105402993).

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

## 2026-10-11 supplement — milestone completion guard

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Completion policy tests | `node --test scripts/ototest-completion-guard.test.mjs` at source revision `97d9882f` | Pass: 4/4 cases cover in-progress milestones, unchecked acceptance items, missing hosted evidence, and valid completion evidence |
| Hosted `verify` | [`verify` run 38107861789](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38107861789) | Pass for commit `97d9882f7c2209d1514d4f8e2cd8a6d79ae7212d`; all active jobs passed, including inventory integrity and the new completion-guard test; historical iOS jobs skipped as configured |

## 2026-10-11 supplement — accessible notices and Path Undo window

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Accessible success/failure notification | `cd frontend && npx vitest run src/components/AppSnackbar.test.ts` at source revision `b324104b` | Pass: 1/1 test asserts failure text and error tone in `role="status"`, excludes the success message from the failure announcement, then asserts the saved message in the success status region |
| Named Undo recovery window | `cd frontend && npm run test:nav` at source revision `b324104b` | Pass: 105/105 sequential Chromium tests; `confirms Path removal and restores it through the Undo action` waits seven seconds, asserts the Path-specific status remains visible, activates Undo, and verifies restoration |

## 2026-10-11 supplement — Path dialog keyboard and scroll behavior

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Contained dialog scroll | `cd frontend && node --test --test-concurrency=1 --test-name-pattern='keeps Path dialog content scrollable without scrolling the background' scripts/nav-shell.acceptance.test.mjs` at source revision `ecbb6d61` | Pass: 1/1 Chromium assertion forces the Path dialog to overflow, scrolls its content to the end, and confirms the underlying page's scroll position stays fixed |
| Full route/control browser acceptance | `cd frontend && npm run test:nav` at source revision `ecbb6d61` | Pass: 106/106 sequential Chromium tests; includes Path dialog focus entry, Escape dismissal, trigger focus return, and contained scrolling, plus the 105 previously passing route/control cases |
| Hosted `verify` | [`verify` run 38108987425](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38108987425) | Pass for commit `ecbb6d616158eb3b6cd939bf2a745912e8d1da67`; all active jobs passed, including the 106-case browser suite; historical iOS jobs skipped as configured |

## 2026-10-11 supplement — keyboard Path creation

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Keyboard-only create and persisted reload | `cd frontend && node --test --test-concurrency=1 --test-name-pattern='creates and reloads a Path using only the keyboard' scripts/nav-shell.acceptance.test.mjs` at source revision `ce622c43` | Pass: 1/1 desktop Chromium assertion opens the Path dialog with Enter, enters the value, submits with Enter, and confirms the created Path remains after reload |
| Full route/control browser acceptance | `cd frontend && npm run test:nav` at source revision `ce622c43` | Pass: 107/107 sequential Chromium tests |
| Inventory and browser artifact policies | `node scripts/check-ototest-inventory.mjs`; `node scripts/check-browser-artifact-policy.mjs` at source revision `ce622c43` | Pass: OTOTEST inventory integrity and browser run/commit linkage, failure-only artifact upload, retention, and trace scrubbing checks |
| Hosted `verify` | [`verify` run 38109782044](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38109782044) | Pass for commit `28591f280bf0bba16945b21457219134c8c443af`; all active jobs passed, including the 107-case route/control browser suite; historical iOS jobs skipped as configured |

## 2026-10-11 supplement — API evidence rows and status validation

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| API evidence-reference and status gate | `node --test scripts/ototest-browser-evidence.test.mjs`; `node scripts/check-ototest-inventory.mjs` at source revision `3bc4e8ff` | Pass: 10/10 evidence-helper tests; inventory integrity verifies 107 API rows, one recognized status per row, and 307 qualified API test references. The API matrix classifies 100 behavior-evidenced rows as `covered` and seven supported-client decisions as `decision-needed`. |
| Hosted `verify` | [`verify` run 38111436017](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38111436017) | Pass for commit `3bc4e8ff45577915f01b7e306cf1054813713a47`; all active jobs passed, including web/extension, backend, guarded PostgreSQL, smoke, timer WebSocket, line-history browser, and Orca; historical iOS jobs skipped as configured |

### Non-reproducing hosted browser failures

The route/control browser step in [run 38111035271](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38111035271) failed the Note archive/reload case because the archived row's body text was empty at the final assertion. The focused local Chromium case passed 1/1 without a code change, and the full 107-case route/control suite passed in run 38111436017. No product fix is claimed; retain the case for observation on later runs.

The Orca job in [run 38111266260](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38111266260) did not announce the first edited-line timestamp during that run, while it announced the later line-history states. The Orca job passed in run 38111436017 without a code change. This is recorded as a non-reproducing hosted failure, not as a verified fix.

## 2026-10-11 supplement — row-level status reconciliation and archive reload synchronization

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Detailed control status audit | `node scripts/check-ototest-inventory.mjs` at source revision `38494d36`, rechecked at `0003201b` | Pass: all 142 detailed control rows have one recognized status: 9 `covered`, 131 `gap`, and 2 `unsupported/excluded`. The 15 top-level control families remain `gap` while their detailed actions are individually classified. |
| Full inventory status audit | `node scripts/check-ototest-inventory.mjs` at source revision `0003201b` | Pass: 18 documents, 107 API rows, and 307 qualified Java test references. Status totals: 21 route/shell rows (19 `gap`, one `covered`, one `unsupported/excluded`); 107 API rows (100 `covered`, seven `decision-needed`); 11 extension entrypoint/permission rows (seven `gap`, two `covered`, one `manual`, one `unsupported/excluded`); 13 feature domains and 10 cross-client journeys, all `gap`; one closed support decision, `unsupported/excluded`. |
| Inventory and completion-guard helper tests | `node --test scripts/ototest-browser-evidence.test.mjs scripts/ototest-completion-guard.test.mjs` at source revision `0003201b` | Pass: 14/14 tests cover named frontend assertion resolution, required API test references and valid row statuses, plus completion policy checks. |
| Browser artifact policy and whitespace | `node scripts/check-browser-artifact-policy.mjs`; `git diff --check` at source revision `0003201b` | Pass: workflow run/attempt and commit linkage, failure-only upload, retention, trace scrubbing, and whitespace checks. |
| Hosted `verify` before archive reload synchronization | [`verify` run 38112178879](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38112178879) | Pass for commit `0fd4f5b91b1fbbf6ec4b8e292a94f2663c049409`; all active jobs passed, including browser/extension, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |
| Focused Note archive/reload browser acceptance | `cd frontend && node --test --test-concurrency=1 --test-name-pattern='archives the selected Note after confirmation' scripts/nav-shell.acceptance.test.mjs` at source revision `0003201b` | Pass: 1/1. After reload, the browser test now waits for the archived row's retained content marker before making its final assertion. This synchronizes the test with rendered data and does not claim a product behavior fix. |
| Hosted `verify` with archive reload synchronization | [`verify` run 38112563567](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38112563567) | Pass for commit `0003201be2312190c534aa494b9be6b2ff54eb3d`; all active web/extension, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca jobs passed; historical iOS jobs skipped. |

Physical Android Chrome acceptance remains open. Phone-width desktop emulation does not establish keyboard, touch, zoom, history, or gesture behavior on a device. The detailed unresolved product behavior gaps retain their status and owner in the matrices; this audit records classification completeness rather than claiming those behaviors are covered.

## 2026-10-11 supplement — latest hosted gate and Android sweep procedure

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Hosted `verify` | [`verify` run 38112860825](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38112860825) | Pass for commit `a902ebb1848ee34d3e18ad61f2797f209d0fe67f`; all active jobs passed, including the 107-case route/control browser suite, packaged extension, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |
| Hosted `verify` after Android procedure and evidence-record updates | [`verify` run 38113872671](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38113872671) | Pass for commit `ba8be2b31903e96de2b72c23660a655132a6f7a1`; all active jobs passed, including the route/control browser suite and packaged extension; historical iOS jobs skipped. |
| Physical Android evidence procedure | `docs/testing.md` → Manual and platform-limited evidence; `docs/ototest/05-acceptance-checklist.md` → Android Chrome product counterpart; `docs/ototest/evidence-template.md` | Procedure now directs maintainers to record OTOTEST-04 MOBILE-01 through MOBILE-33 alongside each OTOTEST-05 Android flow, with per-ID pass/fail/blocked/not-run status, device and browser versions, viewport/orientation, input method, and redacted evidence. This prepares the sweep; it does not claim that a device run occurred. |
| Inventory integrity after procedure update | `node scripts/check-ototest-inventory.mjs`; `git diff --check` | Pass: 18 documents, 107 API rows, 307 qualified Java test references, local links and status consistency. |

The device sweep itself remains outstanding pending access to physical Android Chrome. Maintain separate desktop Chromium and on-device evidence records.

## 2026-10-11 supplement — keyboard Path focus visibility

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Keyboard Path creation and focus visibility | `cd frontend && node --test --test-concurrency=1 --test-name-pattern='creates and reloads a Path using only the keyboard' scripts/nav-shell.acceptance.test.mjs` at source revision `9bb0b8b6` | Pass: 1/1. The browser uses Enter to open and submit the Path form, asserts the named input retains focus and has a visible 2px outline before text entry, then verifies the saved Path after reload. This supports one specific keyboard flow; it does not establish keyboard operation for every state-changing control. |
| Inventory integrity | `node scripts/check-ototest-inventory.mjs`; `git diff --check` at source revision `9bb0b8b6` | Pass: 18 documents, 107 API rows, and 307 qualified Java test references; the updated FLOW-02.03 reference resolves to the named browser assertion. |
| Hosted `verify` with keyboard focus assertion | [`verify` run 38113326554](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38113326554) | Pass for commit `da82e72f0102787df86997dfc266219bdeae4d89`; all active jobs passed, including route/control browser acceptance with the 2px input-focus assertion, packaged extension, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |
| Hosted `verify` after final evidence-record update | [`verify` run 38113613144](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38113613144) | Pass for commit `7a89e17073d07575ce8793e5d42b3a1573143c85`; all active jobs passed, including the route/control browser suite and packaged extension; historical iOS jobs skipped. |

The OTOTEST-05 focus visibility item now links this form-entry evidence and the separate shell focus-ring assertion. The universal keyboard-action and drag-alternative criteria remain open.

## 2026-10-11 supplement — inventory metadata and source traceability gate

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Inventory metadata policy regression cases | `node --test scripts/ototest-inventory-metadata.test.mjs scripts/ototest-browser-evidence.test.mjs scripts/ototest-completion-guard.test.mjs` at source revision `b9179c0d` | Pass: 17/17. The metadata cases reject missing owner, reviewed source revision, review trigger, exact local command, or hosted run link and accept the supported command labels. |
| Matrix row integrity | `node scripts/check-ototest-inventory.mjs` at source revision `b9179c0d` | Pass: all four matrices declare an owner, reviewed source revision, review trigger, exact runnable evidence command, and latest hosted run; detailed control rows have unique IDs and nonempty source/expected-behavior fields. Full inventory: 18 documents, 107 API rows, and 307 qualified Java test references. |
| Hosted `verify` with metadata policy gate | [`verify` run 38114585073](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38114585073) | Pass for commit `decf921952c8246eb712f6b640edfb9d6a84f102`; all active jobs passed, including inventory integrity, the metadata policy tests, route/control browser acceptance, packaged extension, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |
| Hosted `verify` after metadata gate evidence was recorded | [`verify` run 38114863518](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38114863518) | Pass for commit `3739eef68f9dc5362c07dee6daa16ccedb326571`; all active jobs passed, including the new inventory metadata policy test; historical iOS jobs skipped. |
| Hosted `verify` after inventory revision and run-link metadata update | [`verify` run 38115226172](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38115226172) | Pass for commit `0211c7eb78f052779ff78c13663cc49b239327d3`; all active jobs passed, including the metadata policy test, route/control browser acceptance, packaged extension, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |
| Hosted `verify` with explicit inventory review triggers | [`verify` run 38115749393](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38115749393) | Pass for commit `b9179c0d53fde076691e7b8e0ddeedd292824275`; all active jobs passed, including the inventory metadata policy tests and route/control browser suite; historical iOS jobs skipped. |

The owner and exact-command acceptance items are checked in OTOTEST-05. This validates traceability metadata and source-row integrity; it does not establish assertion relevance or close the remaining behavioral gaps.

## 2026-10-11 supplement — Java and manual evidence link validation

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Java and manual evidence parser tests | `node --test scripts/ototest-java-evidence.test.mjs scripts/ototest-manual-evidence.test.mjs scripts/ototest-inventory-metadata.test.mjs scripts/ototest-browser-evidence.test.mjs scripts/ototest-completion-guard.test.mjs` at source revision `02d7164d` | Pass: 21/21. Java references must resolve to a unique test class and declared method; manual-status rows must link to a procedure with a resolvable local target. |
| Full inventory integrity | `node scripts/check-ototest-inventory.mjs` at source revision `02d7164d` | Pass: 18 documents, 107 API rows, and 307 qualified Java test references; frontend and Java references, manual procedure links, statuses, and local targets validate. |
| Hosted `verify` with Java and manual evidence gates | [`verify` run 38116150134](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38116150134) | Pass for commit `02d7164da96465cbf513f2f6e4d57355d4d53438`; all active jobs passed, including the five inventory/evidence policy tests, route/control browser acceptance, packaged extension acceptance, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |
| Extension matrix assertion audit | `docs/ototest/01-extension-and-feature-map.md` at source revision `4c4abae7` | Worker and storage rows now name the specific browser and module assertions. The worker row is `gap` because sender validation and timeout behavior have no explicit assertion mapping; storage remains `covered` for the named persistence assertions. |

The extension map update is documentation traceability, not a claim that its full behaviors are covered. The next supplement records the broader assertion gate and closes the filename-only checklist criterion.

## 2026-10-11 supplement — named assertion requirement for covered rows

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Named assertion policy regression cases | `node --test scripts/ototest-browser-evidence.test.mjs scripts/ototest-java-evidence.test.mjs scripts/ototest-manual-evidence.test.mjs scripts/ototest-inventory-metadata.test.mjs scripts/ototest-completion-guard.test.mjs` at source revision `5264830b` | Pass: 23/23. Includes filename-only rejection, renamed frontend/extension assertion failure, and parameterized assertion titles. |
| Inventory integrity and detailed action audit | `node scripts/check-ototest-inventory.mjs` at source revision `5264830b` | Pass: 18 documents, 107 API operations, 307 qualified Java test references; every covered route/API/control/extension row names an assertion, every detailed covered action is checked, and browser/extension titles plus Java methods resolve. |
| Corrected stale or imprecise citations | `docs/ototest/01-route-matrix.md`; `docs/ototest/01-control-matrix.md` | Updated the archived-board test filename and cited the declared parameterized templates for activity-note keyboard submission and Calendar label portions. The new gate caught these references before the correction. |
| Hosted `verify` with covered-row assertion policy | [`verify` run 38116810994](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38116810994) | Pass for commit `5264830b63ef8ee5135547bce14b843017430de4`; all active jobs passed, including expanded inventory integrity, route/control and packaged extension browser acceptance, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |

The checklist criterion rejecting filename-only evidence is now checked. Rendering-only assertions are still insufficient for mutation, persistence, or ownership claims; that separate criterion remains open.

## 2026-10-11 supplement — reject Java filenames as method evidence

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Java filename regression | `node --test scripts/ototest-browser-evidence.test.mjs scripts/ototest-java-evidence.test.mjs scripts/ototest-manual-evidence.test.mjs scripts/ototest-inventory-metadata.test.mjs scripts/ototest-completion-guard.test.mjs` at source revision `a4533ddc` | Pass: 23/23. `ThingApiTest.java` is rejected as a filename-only reference; qualified Java method references remain valid. |
| Inventory integrity | `node scripts/check-ototest-inventory.mjs` at source revision `a4533ddc` | Pass: all covered rows name assertions, and browser/extension test titles and Java method declarations resolve. |
| Hosted `verify` for the Java filename guard | [`verify` run 38117192498](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38117192498) | Pass for commit `a4533ddc4b329fd17a6368a026663adf2bc3d6ab`; all active jobs passed, including the evidence gates, route/control suite, packaged extension, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |

The four inventory matrices now link this latest hosted evidence run. The next supplement audits persisted-state and ownership claims and closes the rendering-only evidence criterion.

## 2026-10-11 supplement — stateful evidence for persistence and ownership claims

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Stateful evidence policy tests | `node --test scripts/ototest-browser-evidence.test.mjs scripts/ototest-java-evidence.test.mjs scripts/ototest-manual-evidence.test.mjs scripts/ototest-inventory-metadata.test.mjs scripts/ototest-completion-guard.test.mjs` at source revision `f7efa6fd` | Pass: 24/24. Covered persistence, readback, and ownership claims must cite a Java integration test or real-stack/real-browser acceptance; rendering-only UI references fail. |
| Inventory integrity | `node scripts/check-ototest-inventory.mjs` at source revision `f7efa6fd` | Pass: 18 documents, 107 API operations, and 308 qualified Java test references. Covered stateful claims meet the required evidence layer, and all links resolve. |
| Corrected stateful evidence links | `docs/ototest/01-api-matrix.md` and `docs/ototest/01-control-matrix.md` | Password replacement now cites `KnowIntegrationTest.changingPasswordRequiresTheCurrentPasswordAndInvalidatesTheOldOne`, which authenticates with the replacement after rejecting the old password. Status reorder cites `BoardStatusOrderIntegrationTest.statusOrderPersistsCompleteOrderAndRejectsDuplicateMissingAndForeignIds`, which verifies the saved order by reading it back. |
| Hosted `verify` with stateful evidence policy | [`verify` run 38118196679](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38118196679) | Pass for commit `f7efa6fd7d9f4b605283ebe0a276cd1e445f4bc8`; all active jobs passed, including inventory/evidence policy checks, route/control browser acceptance, packaged extension, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |

The checklist item rejecting rendering-only evidence for mutation, persistence, or ownership is now checked. Evidence-layer policy improves traceability; the product behavior gaps remain individually classified in the matrices.

## 2026-10-11 supplement — hosted verification after stateful-evidence record

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Hosted `verify` after inventory/run-record updates | [`verify` run 38118548925](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38118548925) | Pass for commit `ede119cfd5bbd03da22160c2977c37a1318c3e24`; all active jobs passed, including the expanded inventory gates, route/control and packaged extension browser suites, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. The first smoke attempt failed during Docker Gradle dependency setup; the failed job was retried and passed. |

## 2026-10-11 supplement — foreign-reference ownership evidence

| Evidence layer | Exact command(s) | Result |
| --- | --- | --- |
| Stateful cross-user regression | `docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"` | Pass: 607 tests, 89 skipped. `CrossUserIsolationIntegrationTest.intruderCannotReferenceOwnedResourcesFromTheirOwnData` now covers foreign path and label references on card updates in addition to its timer, manual-entry, card-create, status-move, board-transfer, and other reference attempts; rejected requests leave the owner’s data unchanged. |
| Inventory integrity | `node scripts/check-ototest-inventory.mjs` | Pass: 18 documents, 107 API rows, and 308 qualified Java test references; API rows resolve to named integration assertions for timer start, manual entries, card creation, and card updates. |
| Hosted `verify` for foreign-reference evidence | [`verify` run 38119978826](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38119978826) | Pass for commit `e6c4e61d`; all active jobs passed, including inventory gates, route/control and packaged extension browser suites, backend, PostgreSQL/Flyway, smoke, timer WebSocket, line-history, and Orca; historical iOS jobs skipped. |

The security checklist now records the reference-ownership boundary and its integration evidence layer. The API matrix links the test to each covered mutation operation.
