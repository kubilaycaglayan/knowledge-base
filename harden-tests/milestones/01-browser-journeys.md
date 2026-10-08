# HARD-01: Real-stack search and deep-link journeys

**Priority:** High  
**Status:** Complete

**Scope:** Test coverage and run documentation only.

Track completion in the [HARD-01 acceptance checklist](01-acceptance-checklist.md).

## Why this milestone exists

Global search has broad service, API, component, utility, and mocked-browser
coverage. Direct routes are covered by `frontend/src/views/DeepLinks.test.ts`
and acceptance checklist `docs/global-search-acceptance-checklist.md`. The
missing evidence is the full authenticated web client against the disposable
PostgreSQL/API/proxy/web stack in desktop Chromium, mobile-size Chromium, and
emulated iPhone WebKit. This catches integration failures in URL parsing,
routing, API authorization, browser history, and responsive interaction that
fixture tests cannot expose.

## Tasks

- [x] Inventory the current result routes and page shortcuts from
  `frontend/src/lib/search.ts` and `frontend/src/main.ts`; keep the matrix in the
  [HARD-01 acceptance checklist](01-acceptance-checklist.md) synchronized when
  either source changes. `frontend/src/views/DeepLinks.test.ts` is mocked
  component evidence; it is not full-stack route evidence.
- [x] Add a real-stack search journey that creates isolated fixtures for at
  least a note, log, session, path, label, board/card, and calendar day; search,
  open each result, assert the destination record/state, and verify Back and
  Forward restore the expected URL and page state.
- [x] Verify the empty, request-error/retry, and stale-response behavior against
  the real API where deterministic fault injection is available. Keep the
  existing unit tests for debounce and out-of-order responses as the precise
  race contract.
- [x] Exercise every row in the route matrix in the acceptance checklist using
  direct navigation and a fresh browser context. Include one nonexistent ID
  and one foreign-user ID for each record family with a record-detail route.
- [x] Cover a copied card URL whose card is outside the initial loaded page and
  confirm the owning board/card dialog opens after direct load.
- [x] Run each journey with `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop`,
  `BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone`, and
  `BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone`; these combinations use
  desktop Chromium, mobile-size Chromium, and mobile-size WebKit respectively.
  Retain separate reports, browser versions, viewport/touch configuration,
  and artifacts. Mobile-size Chromium does not prove physical Android Chrome
  compatibility, and WebKit is not Chrome coverage.
- [x] Add the selected real-stack journeys to `scripts/test-run-all.sh` or a
  documented CI job with unique Compose project and credentials. Keep cleanup
  project-scoped.

## Acceptance evidence

- All intended route/result types have named assertions (not conditional
  locator-count guards).
- Foreign and missing IDs do not reveal record content and produce the
  established not-found/recovery UI.
- The desktop Chromium and iPhone WebKit runs both pass from a clean disposable
  database, with reports following `harden-tests/runs/README.md`.
- The suite is repeatable on the same commit and does not depend on persistent
  development data.

## Relevant commands and sources

- `frontend/scripts/search*` and `frontend/src/views/DeepLinks.test.ts`
- `(cd frontend && npm run test:tracker)` for existing fixture coverage
- `./scripts/test-run-all.sh` for the disposable integrated stack
- `docs/global-search-acceptance-checklist.md`

## Current implementation

`frontend/scripts/search.real-stack.acceptance.test.mjs` and
`scripts/run-search-e2e.sh` provide the full disposable PostgreSQL journey.
The suite seeds unique disposable accounts and fixtures through the API, then
checks every search result and page shortcut, browser history, direct loads and
reloads in fresh authenticated contexts, archived and ownership cases,
calendar/Gantt URL boundaries, empty/error recovery, and responsive viewport
geometry. The runner timestamps runs, captures failure evidence and project
logs, and removes only its unique Compose project. `scripts/test-run-all.sh`
includes the suite in its stack-backed browser stage.

The complete 12-case suite passed on commit `1978af6` in all three profiles.
See the separate [desktop Chromium](../runs/2026-10-08-1978af6-desktop-chromium-search.md),
[mobile-size Chromium](../runs/2026-10-08-1978af6-mobile-chromium-search.md), and
[iPhone WebKit](../runs/2026-10-08-1978af6-iphone-webkit-search.md) run reports.
The expanded assertions confirm off-page session pagination and dialog close,
path history close, a board hidden in the overflow menu, untitled archived-note
search, note body and calendar selection, archive row highlighting, and visible
fallback context after an unknown archive-board URL. Browser profiles are
emulated; no physical Android or iPhone device was tested. The complete
route-by-route evidence is recorded in the [acceptance checklist](01-acceptance-checklist.md).
