# OTOTEST-01 — Coverage inventories

**Priority:** High  
**Status:** In progress
**Dependencies:** None

**Scope:** Documentation-only inventory of the Knowledge Base web app in
desktop and mobile Chrome, its `/api/v1` operations used by supported clients,
and the Manifest V3 Chrome extension in its supported Chrome environment.
Inventory existing source and evidence; do not implement product changes, add
tests, or run test suites as part of OTOTEST-01. Real-stack journey execution
belongs to OTOTEST-04.

## Goal

Create a source-backed inventory of supported routes, backend API operations,
major features, and visible interactive controls, with current test evidence
and explicit gaps. This is the baseline for the rest of `#ototest`.

## Tasks

- [ ] List every Vue Router path, including parameterized routes, redirects,
  query-driven states, and archive/detail paths. Link each to view/unit tests
  and browser journeys.
- [ ] Extract every Spring controller mapping as an HTTP method + full path.
  Record route aliases, query/path parameters, auth requirement, and controller
  method.
- [ ] Inventory user-visible controls by page and major dialog/menu: label,
  action, expected outcome, keyboard behavior where relevant, and source file.
- [ ] Inventory extension entry points and supported permissions, including
  popup, options, content scripts, background/service worker, and external
  service handoffs. Treat desktop Chrome extension support and mobile Chrome
  web support as separate surfaces; record extension support on mobile as
  supported, unsupported, or needs decision.
- [ ] For each inventory row, link exact test file and test name when possible;
  otherwise mark `gap`, `manual`, `unsupported`, or `needs decision`.
- [ ] Review exclusions with maintainers. Every excluded route/control must
  state why it is not a supported product behavior.

## Task workflow and required row fields

1. Extract registered Vue paths and redirects from `frontend/src/main.ts`,
   then verify each screen's actual component and deep-link behavior. Include
   query-driven state, browser history, auth redirects, and shared-shell
   navigation. Keep `/development` as temporary tooling: exclude it from the
   supported route set and assert it is not a navbar item.
2. Extract every Spring mapping and combine class + method paths. Keep aliases
   as distinct rows when their HTTP behavior or route shape differs. Include
   HTTP verb, path, query/body/path inputs, auth, ownership-sensitive IDs,
   success test, applicable failure/security tests, and persisted effect.
3. Walk each supported page's template and child components. Record every
   user-actionable button/link/input/select/menu/dialog, keyboard shortcut,
   drag/drop or pointer gesture, expected result, state feedback, and test.
   Repeated controls need a representative row plus dynamic accessible-name
   assertion; a generic “buttons work” row is insufficient.
4. Inventory loading, empty, validation, network/API error, retry, conflict,
   cancel, undo/restore, and unsaved-change states where applicable. Record
   exact source location and whether the state is reproducible in a fixture or
   requires a service/browser.
5. Inventory Manifest V3 entrypoints from `chrome-extension/wxt.config.ts`,
   permissions, host matches, message channels and external handoffs; tie every
   permission to the feature that needs it.
6. Reconcile all rows against named test declarations and workflow commands.
   Capture source revision/date and reviewer; use `gap` when no assertion
   proves the behavior. This is source/evidence classification only: do not
   execute suites or add test/product code for OTOTEST-01.

Minimum feature domains: authentication/shared shell; Sessions and timer;
Paths; Timeline; Logs; Reports; Calendar; Imports/transfer; Settings and
preferences; Labels/history; Boards/All boards/Kanban/Gantt/archive; Notes;
Chrome extension. Consult the [product tree](product-test-tree.md) for the
page-region and edge-case decomposition.

## Deliverables

- A concise web route matrix and visible-control matrix under `docs/ototest/`.
- A backend endpoint matrix under `docs/ototest/` or a linked generated
  artifact that is checked into the repository.
- A cross-client feature map with evidence type and current CI job/command.
- A ranked list of uncovered behaviors to feed OTOTEST-02 through 05.

## Current evidence

- [Web route evidence matrix](01-route-matrix.md): routes reconciled to router
  declarations and located test files; unresolved browser and deep-link
  assertions remain gaps.
- [Backend API operation inventory](01-api-matrix.md): controller mappings and
  aliases are listed with candidate tests and unverified operation gaps.
- [Control inventory](01-control-matrix.md): meaningful action families,
  outcomes, interaction evidence, and unsupported mobile/browser proof are
  classified.
- [Extension and feature map](01-extension-and-feature-map.md): manifest
  permissions, entrypoints, feature evidence, commands, exclusions, and ranked
  gaps are recorded.
- Static source reconciliation found all 19 router entries and all 107
  controller verb/path variants in the corresponding matrices. The acceptance
  checklist now records which inventory checkpoints are documented; remaining
  unchecked items describe incomplete operation/control traceability and
  maintainer review, not permission to advance to a later milestone.
- Source review is complete for the baseline revision, but a maintainer must
  review the exclusions and assertion classifications before this milestone
  can be marked complete.

## Acceptance

- Matrices are reconciled against current route registration, controller
  annotations, view/component source, and extension manifest/entrypoints.
- No row is marked covered solely because a similarly named test exists.
- Rows distinguish mocked/fixture, unit, service integration, real browser,
  real API, and manual evidence.
- Known non-product/development-only routes and the iOS exclusion are explicit.
- Documents link to current test and workflow paths and explain how to update
  each inventory when behavior changes.
- Matrix contains a row for each router entry, composed API operation/alias,
  major feature journey, meaningful action family, gesture, and extension
  permission/entrypoint; each row carries an evidence class, named assertion,
  command/workflow, current gap and owner.
- All supported routes include logged-out, invalid/missing resource and
  direct-load behavior where applicable. Redirect/query routes prove URL and
  Back/Forward behavior.
- The product tree's temporary `/development` classification is consistent
  across the matrix, audit, and navbar assertion.

## Evidence to record

Link this milestone's review to the inventory files, source revision, and
reviewer/date. This phase does not require running every test suite; it requires
correctly classifying existing evidence and identifying commands for later
execution. Do not run tests, add test code, change application behavior, or
perform real-stack user journeys as OTOTEST-01 acceptance work. The inventory
may cite previously recorded real-stack/manual evidence, clearly labeled by
source and browser profile.
