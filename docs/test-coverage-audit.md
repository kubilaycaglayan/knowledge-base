# Test coverage audit

**Reviewed:** 2026-10-09  
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

## Coverage map

| Surface | Existing evidence | Assessment |
| --- | --- | --- |
| Backend API and domain | `backend/src/test/java/com/know/api/`, `service/`, and `integration/`; every protected Spring route is checked for anonymous rejection; cross-user and malformed-input integration matrices; PostgreSQL constraint and migrated-startup checks | Broad automated coverage. The route-security sweep establishes authentication behavior, not each route's successful behavior. Controller behavior is covered by feature-specific API/integration suites, but there is no maintained endpoint-to-test inventory proving every method/branch has a positive and negative assertion. |
| Web routes and screens | Vue tests under `frontend/src/views/`, including auth, board, board archive, calendar, deep links, imports, labels, logs, notes, paths, reports, sessions, settings, and timeline; navigation, board, timer, search, auth-rate-limit, and line-history browser suites | Broad fixture-level coverage, with selected real-stack browser journeys. There is no complete route/button checklist tied to assertions. `DevelopmentView.vue` remains direct-only temporary tooling, is excluded from product coverage, and is no longer linked from authenticated navigation. |
| Web controls and components | Tested search, timer, dialogs, snackbar, rich-text toolbar, label history, charts, date range, and other shared controls; board has extensive view tests | No demonstrated one-test-per-button guarantee. Many screen-specific controls are exercised only in view tests or not shown to have a dedicated interaction assertion. Complex screens need explicit control matrices to identify omissions reliably. |
| Chrome extension | `chrome-extension/*.test.js` covers core behavior, popup, options, Google auth, API config, Clockify validation/settings/page/overlay | Good module coverage. Tests are primarily Node-level tests; there is no documented automated browser installation journey that exercises the built Manifest V3 extension in Chrome, including browser permission prompts and service-worker lifecycle. |
| iOS | `ios/KnowTests/` model/API/conversion tests and `ios/KnowUITests/KnowUITests.swift` fixture-driven simulator tests; Linux can run Foundation-only note-document validation | Rich test source, but both iOS GitHub Actions jobs are disabled. Most UI tests use fixtures rather than a disposable backend. No systematic live API persistence checks exist for Paths, Logs, Labels, Notes, Calendar, or Sessions/timer; see [`harden-tests/milestones/06-test-inventory.md`](../harden-tests/milestones/06-test-inventory.md). |
| Deployment and browser journeys | Smoke checks, cleanup/security/accessibility checks, and real-stack suites for boards, timer WebSocket, search, line history, and auth rate limits | Strong infrastructure checks and selected journeys. There is no real-stack browser journey for every major screen or for every import/export and settings workflow. |

## Missing or limited coverage to address

### Highest priority

1. **Maintain an endpoint behavior matrix.** Inventory every controller method
   and link it to a test asserting its success behavior, validation/error
   behavior, and ownership boundary as applicable. The existing global
   anonymous-route and cross-user checks are valuable, but they do not show
   that every route's intended behavior is exercised. Include aliases such as
   timer stop/cancel routes and the all-boards endpoints.
2. **Add user-facing journeys for uncovered real-stack workflows.** Existing
   live browser suites concentrate on boards, timer, search, line history, and
   auth rate limits. Add representative journeys for imports/export, settings
   and preferences persistence, calendar edits, notes/paths/logs/labels CRUD,
   and reports where those workflows are release-critical. Fixture tests do
   not prove API persistence or server interaction.
3. **Add an extension-in-Chrome acceptance path.** Exercise the built
   extension's install/configuration and popup/options flows in a real browser,
   including permission-dependent and service-worker behavior. Current module
   tests do not establish browser integration.

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
- [#ototest coverage roadmap](ototest-roadmap.md)
- [Test hardening index](../harden-tests/README.md)
- [Native iOS test inventory and gaps](../harden-tests/milestones/06-test-inventory.md)
- [API documentation](api.md)
- [Roadmap](roadmap.md)
