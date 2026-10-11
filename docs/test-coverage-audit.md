# Test coverage audit

**Reviewed:** 2026-10-11 (`ecbb6d61` route, global-search, Path merge, timer, accessible notice/Undo, and contained dialog-scroll browser acceptance review)
**Scope:** Current `main` source and test files in `backend/`, `frontend/`,
`chrome-extension/`, `ios/`, CI workflows, and the existing test documentation.

## Summary

The repository has substantial automated coverage across its main product
areas. The backend has API, integration, service, security, and PostgreSQL
tests. The web client has store, utility, component, view, and selected
real-stack browser tests. The Chrome extension has tests for its popup,
options, authentication, API configuration, timer, and Clockify modules.

Coverage does not establish that every visible button, route, and API behavior
has a test. In particular, most product flows are verified with mocked APIs or
in-memory fixtures; only selected flows run through a real browser and service.
The gaps below are the concrete areas where the current test map shows missing
or limited automated evidence. The iOS row records historical inventory only:
the app is inactive, and iOS testing is explicitly out of scope for `#ototest`.

The latest browser review also verifies success and failure snackbar messages
through an accessible status region and keeps a named Path Undo action visible
for at least seven seconds. These assertions do not replace the remaining
physical Android or broader manual acceptance flows.

The Path creation dialog browser review verifies focus entry, Escape dismissal,
focus return to its trigger, and inner scrolling without moving the underlying
page. This establishes the sampled desktop dialog behavior only; other dialogs
and physical mobile dialog behavior remain open.

## Coverage map

| Surface | Existing evidence | Assessment |
| --- | --- | --- |
| Backend API and domain | `backend/src/test/java/com/know/api/`, `service/`, and `integration/`; every protected Spring route is checked for anonymous rejection; cross-user and malformed-input integration matrices; PostgreSQL constraint and migrated-startup checks | Broad automated coverage. The route-security sweep establishes authentication behavior, not each route's successful behavior. Controller behavior is covered by feature-specific API/integration suites, but there is no maintained endpoint-to-test inventory proving every method/branch has a positive and negative assertion. |
| Web routes and screens | Vue tests under `frontend/src/views/`, including auth, board, board archive, calendar, deep links, imports, labels, logs, notes, paths, reports, sessions, settings, and timeline; navigation, board, timer, search, auth-rate-limit, line-history, and OTOTEST-04 feature browser suites | Broad fixture-level coverage and selected real-stack journeys. The route/control inventories map behaviors and gaps, but do not establish complete route/button coverage. `DevelopmentView.vue` remains direct-only temporary tooling, is excluded from product coverage, and is no longer linked from authenticated navigation. |
| Web controls and components | Tested search, timer, dialogs, snackbar, rich-text toolbar, label history, charts, date range, and other shared controls; board has extensive view tests | No demonstrated one-test-per-button guarantee. Many screen-specific controls are exercised only in view tests or not shown to have a dedicated interaction assertion. Complex screens need explicit control matrices to identify omissions reliably. |
| Chrome extension | `chrome-extension/*.test.js` covers core behavior, popup, options, Google auth, API config, Clockify validation/settings/page/overlay; `extension.real-browser.acceptance.test.mjs` exercises the packaged build in desktop Chromium | Module coverage plus a local opt-in browser journey for popup/options, API configuration, timer and Notes integration, unavailable API recovery, and service-worker recovery after browser restart. It is not a dedicated CI gate and does not automate live Google account consent or real Clockify data. |
| iOS | `ios/KnowTests/` model/API/conversion tests and `ios/KnowUITests/KnowUITests.swift` fixture-driven simulator tests; Linux can run Foundation-only note-document validation | Rich test source, but both iOS GitHub Actions jobs are disabled. Most UI tests use fixtures rather than a disposable backend. No systematic live API persistence checks exist for Paths, Logs, Labels, Notes, Calendar, or Sessions/timer; see [`harden-tests/milestones/06-test-inventory.md`](../harden-tests/milestones/06-test-inventory.md). |
| Deployment and browser journeys | Smoke checks, cleanup/security/accessibility checks, and real-stack suites for boards, timer WebSocket, search, line history, auth rate limits, Notes, Paths, Logs, Labels, Calendar, Reports/Settings, and transfers | Strong infrastructure checks and selected journeys. The OTOTEST-04 feature scripts are runnable through disposable local stacks but are not individual CI gates; no real-stack journey exists for every screen or behavior. |

## Missing or limited coverage to address

### Highest priority

1. **Maintain an endpoint behavior matrix.** Inventory every controller method
   and link it to a test asserting its success behavior, validation/error
   behavior, and ownership boundary as applicable. The existing global
   anonymous-route and cross-user checks are valuable, but they do not show
   that every route's intended behavior is exercised. Include aliases such as
   timer stop/cancel routes and the all-boards endpoints.
2. **Expand persisted journeys where risk warrants.** Real-stack browser
   journeys now cover transfers, preferences, Calendar, Notes, Paths, Logs,
   and Labels in addition to boards, timer, search, and line history. Remaining
   route and behavior gaps are listed in the matrices; fixture tests do not
   prove API persistence or server interaction.
3. **Maintain extension browser evidence.** A local opt-in Chromium journey
   now exercises the packaged extension, including popup/options, API
   interaction, and worker recovery. It is not a CI gate and does not cover
   live Google consent or real Clockify integration; keep those limitations
   explicit when extension permissions or flows change.

### Additional gaps

- `frontend/src/views/DevelopmentView.vue` has no matching view test because
  `/development` is temporary direct-only tooling, not a supported product
  journey. The authenticated navbar test verifies it is absent from
  navigation; do not treat its demo interactions as product coverage.
- Review large screens against explicit action inventories (especially board,
  imports, settings, reports, calendar, notes, and session controls). Existing
  tests demonstrate many interactions, but no artifact maps every visible
  button/menu item to an assertion. This audit therefore cannot certify
  exhaustive per-button coverage.
- Add database behavior tests for migration changes as they are introduced.
  The current migration test files directly test selected data migrations;
  successful Flyway startup validates migration execution but does not prove
  every historical migration's intended data transformation independently.

## What this audit does and does not prove

This is a source and test-inventory review, not a fresh execution of the test
suites or a statement of line/branch coverage. It confirms that test files and
coverage mechanisms exist and compares them with registered screens, API
controllers, and client modules. It does not claim that every assertion passes
on this machine, nor that every code path is covered. Establishing exhaustive
button/API coverage requires a maintained behavior specification or control
inventory and explicit mapping from each requirement to test names.

## Existing references

- [Testing guide](testing.md)
- [#ototest coverage roadmap](ototest/roadmap.md)
- [Test hardening index](../harden-tests/README.md)
- [Native iOS test inventory and gaps](../harden-tests/milestones/06-test-inventory.md)
- [API documentation](api.md)
- [Roadmap](roadmap.md)

## OTOTEST-05 traceability update

OTOTEST-04 now has real-stack journeys for Notes, Paths, Logs, Labels,
Calendar, Reports/Settings, and transfers, plus a packaged desktop Chrome
extension browser journey. See the [OTOTEST-04 acceptance checklist](ototest/04-acceptance-checklist.md)
for its recorded evidence and boundaries. OTOTEST-05 adds a CI check for
stale local inventory links, duplicate route/API keys, missing row
classifications or matrix owners, milestone-status drift, unresolved Java API
test names, and stale named navigation-browser assertion references. These
checks establish reference freshness, not assertion quality. It also adds a
same-review inventory update rule, explicit evidence-layer gate guidance, and
a reusable run-record template. This does not close the remaining
route/API/control behavior gaps or
claim that these additional browser suites have run in CI; those remain
tracked in the matrices until their behavior-specific evidence is added.
The [OTOTEST-05 local gate record](ototest/runs/2026-10-10-ototest-05-local-gates.md)
contains the source reconciliation snapshot and passing local suite results;
the linked hosted `verify` run passed for the current branch. Remaining
behavior-specific and physical Android evidence is still tracked in the
matrices and acceptance checklist.

The required desktop Chromium route suite now distinguishes an empty global
search result from a failed request and confirms that prior results are not
shown as current after the next request fails. It also verifies the retry
feedback and successful retry path. This is fixture-backed browser evidence;
it does not claim backend search persistence or physical Android behavior.

The shared timer evidence now verifies the running tracker on supported
non-Session routes, rereads the current timer after route navigation and
reload, and hides the floating control while a phone-width Log input is
focused. Named service/API assertions establish that the current timer read
uses the authenticated user. These Chromium viewport checks do not claim
physical Android keyboard behavior.

The Notes archive/restore evidence now also covers a simulated archive failure
with fresh active-state confirmation and retry, archived/active persisted
membership, and duplicate Restore activation prevention. The route/control
inventories and [OTOTEST-05 run record](ototest/runs/2026-10-10-ototest-05-local-gates.md)
link the exact tests and source revision. Archived-note label preservation and
archived deep-link UI behavior remain open.
