# HARD-01: Real-stack search and deep-link journeys

**Priority:** High  
**Status:** Planned  
**Scope:** Test coverage and run documentation only.

Track completion in the [HARD-01 acceptance checklist](01-acceptance-checklist.md).

## Why this milestone exists

Global search has broad service, API, component, utility, and mocked-browser
coverage. Direct routes are covered by `frontend/src/views/DeepLinks.test.ts`
and acceptance checklist `docs/global-search-acceptance-checklist.md`. The
missing evidence is the full authenticated web client against the disposable
PostgreSQL/API/proxy/web stack in desktop Chromium and emulated iPhone WebKit.
This catches integration failures in URL parsing, routing, API authorization,
browser history, and responsive interaction that fixture tests cannot expose.

## Tasks

- [ ] Inventory every search result and route covered by existing tests; mark
  which paths require a direct-load journey and which can be reached through
  search. Reuse the expected behavior from `docs/global-search-acceptance-checklist.md`.
- [ ] Add a real-stack search journey that creates isolated fixtures for at
  least a note, log, session, path, label, board/card, and calendar day; search,
  open each result, assert the destination record/state, and verify Back and
  Forward restore the expected URL and page state.
- [ ] Verify the empty, request-error/retry, and stale-response behavior against
  the real API where deterministic fault injection is available. Keep the
  existing unit tests for debounce and out-of-order responses as the precise
  race contract.
- [ ] Exercise direct navigation for record routes and query-driven states:
  `/sessions/:id`, `/logs/:id`, `/paths/:id`, `/labels/:id`,
  `/calendar?date=…`, `/notes?archived=1&q=…`, `/board?board=…&card=…`, and
  `/board/archive?archivedBoard=…` (adjust exact query shape to the current
  router contract). Include one nonexistent ID and one foreign-user ID to
  check safe not-found behavior.
- [ ] Cover a copied card URL whose card is outside the initial loaded page and
  confirm the owning board/card dialog opens after direct load.
- [ ] Run each journey with `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop`
  and `BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone`; add a separate mobile
  Chrome/Chromium phone profile to the runner and run it as a distinct profile.
  The current runners do not yet expose that profile. Retain separate reports,
  browser versions, viewport/touch configuration, and artifacts. An iPhone
  WebKit run is not evidence for Chrome on Android.
- [ ] Add the selected real-stack journeys to `scripts/test-run-all.sh` or a
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
