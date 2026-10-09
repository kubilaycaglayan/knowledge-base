# OTOTEST-05 — Traceability and ongoing gates acceptance checklist

**Priority:** High
**Status:** Proposed
**Depends on:** OTOTEST-01 through OTOTEST-04
**Product surfaces reviewed:** Knowledge Base web application in desktop Chrome
and the same web application in Android Chrome
**Excluded:** Native iOS application and iOS workflows. The installed desktop
Chrome extension remains an OTOTEST-04 surface; its permission and integration
changes are included below only as traceability triggers.

This checklist turns the OTOTEST-05 milestone into reviewable acceptance
criteria. Product expectations are grounded in the routes and feature tree in
the [product test tree](product-test-tree.md), the current route registration
in `frontend/src/main.ts`, API mappings under `backend/src/main/java/com/know/api`,
the web shell in `frontend/src/App.vue`, and the gate definitions in
`.github/workflows/verify.yml` and `docs/testing.md`. It describes what must be
maintained and evidenced; checking a box does not claim a test or gate has run.

## Evidence record

For every accepted route, operation, control family, gesture, permission, or
gate below, the maintained inventory or release record must identify:

- [ ] A stable row ID and one clearly stated behavior.
- [ ] The product source: route, component/control, controller operation,
  permission declaration, or workflow/job.
- [ ] The responsible owner for keeping the row current.
- [ ] The expected user-visible result and URL or persisted state when
  applicable.
- [ ] Applicable failure, ownership, validation, empty, loading, and recovery
  behavior.
- [ ] Evidence layer: unit/component, service/API, persistence/PostgreSQL,
  real browser, or manual review.
- [ ] Exact assertion/test or manual procedure and its current status.
- [ ] Exact local command or CI workflow/job that runs the evidence.
- [ ] The last-reviewed source revision and a link to a run/artifact when
  evidence has been executed.
- [ ] A limitation, explicit exclusion, or unresolved gap with an owner and
  review trigger where evidence is unavailable.

## Inventory freshness and product-change flows

### Flow: Classify one changed web route

- [ ] A newly registered route receives its own stable inventory row.
- [ ] A changed route path, alias, guard, redirect, or route parameter updates
  the existing row or adds a separate row when behavior is distinct.
- [ ] A retired route is marked unsupported or intentionally excluded with a
  reason and owner instead of disappearing from the inventory.
- [ ] The route row describes direct loading, page identity, authentication
  behavior, query state, and invalid or unavailable resource behavior as
  applicable.
- [ ] `/development` remains explicitly classified as temporary tooling and
  excluded from supported route completeness and authenticated navigation.

### Flow: Classify one changed web control

- [ ] A new or behaviorally changed visible control receives a distinct row
  for its action and expected result.
- [ ] The row names the control, starting state, input method, visible result,
  and persistence or URL effect when applicable.
- [ ] A dialog action has separate rows for opening, successful submission,
  cancellation, applicable validation, and recoverable request failure.
- [ ] A destructive action has a row for confirmation or its offered undo
  path.
- [ ] A control that only appears decorative or unavailable is explicitly
  labeled non-interactive with its reason.

### Flow: Classify one changed API operation

- [ ] Every new or changed controller mapping is recorded as an HTTP method
  and fully composed `/api/v1` path.
- [ ] Each method/path alias is recorded as its own operation row.
- [ ] The operation row states authentication, request inputs, response
  contract, owner-scoped identifiers, and observable state effect.
- [ ] The row links evidence for its successful behavior and each applicable
  validation, ownership, or conflict outcome.
- [ ] A server operation with no supported web-client call site is explicitly
  classified with a scope decision and owner.
- [ ] A UI mock or route-level assertion is not used as evidence of backend
  persistence or ownership enforcement.

### Flow: Classify one changed browser gesture

- [ ] A new or changed pointer, drag, keyboard, or touch gesture receives its
  own behavior row.
- [ ] The row identifies the supported desktop Chrome input method.
- [ ] The row identifies the supported Android Chrome input method when the
  gesture is offered on a phone.
- [ ] A drag-dependent action records its tap/click or keyboard alternative
  where that action is not inherently pointer-only.
- [ ] Pointer cancellation, lost capture, or interrupted input has a recovery
  result when applicable.

### Flow: Classify one changed security boundary

- [ ] A new or changed route guard records signed-out and authenticated
  outcomes separately.
- [ ] A record read records owned, missing, and foreign-ID outcomes where the
  route accepts a record identifier.
- [ ] A mutation that references another record records ownership checks for
  each referenced Path, Label, board, status, note, or activity identifier
  used by that behavior.
- [ ] A new public API route records its deliberate public status and the
  reason for bypassing authentication.
- [ ] Security evidence identifies the layer proving the boundary rather
  than inferring it from a UI-hidden control.

### Flow: Classify one changed extension permission

- [ ] A changed Manifest V3 permission or host permission receives a stable
  extension inventory row and product purpose.
- [ ] The row states the feature affected when permission is absent or denied.
- [ ] The row records the review owner and the extension build/job that
  validates the resulting permission declaration.
- [ ] An extension permission row is not mislabeled as Android Chrome web-app
  evidence; mobile Chrome extension hosting is not part of this checklist.

## Supported route inventory freshness

Each supported route below must have an inventory row. Route rows may link to
the feature-level criteria in the OTOTEST-03 checklist, but the route, direct
load, and route-state evidence must remain individually identifiable.

### Flow: Keep the Sessions route current

- [ ] `/` is listed as the Sessions workspace route.
- [ ] `/sessions` is listed as a supported alias and its redirect to `/` is
  recorded.
- [ ] `/sessions/:id` is listed as a session detail/edit deep link.

### Flow: Keep the Paths routes current

- [ ] `/paths` is listed as the Paths workspace route.
- [ ] `/paths/:id` is listed as a Path detail/history deep link.

### Flow: Keep the Timeline route current

- [ ] `/timeline` is listed with its supported query/filter state.

### Flow: Keep the Logs routes current

- [ ] `/logs` is listed as the Logs workspace route.
- [ ] `/logs/:id` is listed as a Log detail deep link.

### Flow: Keep the Reports route current

- [ ] `/reports` is listed with its supported date range and filter query
  state.
- [ ] Query-state restoration and browser Back/Forward behavior are called
  out as distinct route behaviors.

### Flow: Keep the Calendar route current

- [ ] `/calendar` is listed with supported date query state.

### Flow: Keep the Imports route current

- [ ] `/imports` is listed with import source, history, pagination, and batch
  undo entrypoints represented in the feature inventory.

### Flow: Keep the Settings route current

- [ ] `/settings` is listed with Account, Import, Export, and preference
  sections represented where supported.

### Flow: Keep the Labels routes current

- [ ] `/labels` is listed as the Labels workspace route.
- [ ] `/labels/:id` is listed as a label history deep link.

### Flow: Keep the Board routes current

- [ ] `/board` is listed with board selection, Kanban, Gantt, and All boards
  states represented in the feature inventory.
- [ ] `/board/archive` is listed with its board/card query focus behavior.

### Flow: Keep the Notes routes current

- [ ] `/notes` is listed as the Notes list/editor route.
- [ ] `/notes/:id` is listed as a note editor deep link.

### Flow: Verify direct loading of one supported route

- [ ] Loading a supported route directly renders its intended page after the
  authenticated shell is available.
- [ ] A route with a selected record resolves that record from the route
  parameter and handles missing or inaccessible IDs without exposing
  protected details.
- [ ] An unknown URL produces the documented not-found or safe fallback
  behavior and does not render an unrelated protected record.

### Flow: Restore one protected deep link after sign-in

- [ ] Opening a protected deep link while signed out presents the sign-in
  state before protected content.
- [ ] Completing sign-in restores the intended safe internal destination.
- [ ] An external or malformed return destination does not navigate away from
  Knowledge Base.

### Flow: Restore one URL-backed filter

- [ ] A supported filter is reflected in its documented URL query state.
- [ ] Reloading the URL restores the same selected filter and corresponding
  visible results.
- [ ] Browser Back and Forward restore the related route, query, and visible
  selection together.

### Flow: Navigate one supported route from the application shell

- [ ] The authenticated navigation exposes each supported destination.
- [ ] Selecting a destination updates the route and page identity together.
- [ ] Browser-native link actions remain available for navigation links.
- [ ] The temporary `/development` route is not linked from authenticated
  product navigation.

## Cross-layer evidence and change guidance

### Flow: Record evidence for one user-visible mutation

- [ ] The evidence starts from an identified UI control and a known account
  state.
- [ ] The evidence records the visible successful result.
- [ ] A fresh read proves the changed value remains after navigation or
  reload when the behavior is persisted.
- [ ] A failed request is distinguishable from a successful save.
- [ ] A retry does not create duplicate records when the action is expected
  to be idempotent or protected from duplicate submission.

### Flow: Record evidence for one deletion or archive action

- [ ] The evidence records the confirmation or undo affordance shown before
  the destructive effect.
- [ ] The evidence records the selected record identity so unrelated records
  can be distinguished.
- [ ] A fresh read proves the intended record is absent or archived according
  to the documented contract.
- [ ] A failed request leaves server-owned state accurately represented and
  offers a recovery path where applicable.

### Flow: Record evidence for one restore action

- [ ] The evidence identifies the archived record and destination context.
- [ ] The visible result shows the record in its restored state.
- [ ] A fresh read proves the restored state persists.
- [ ] Repeating the restore does not misrepresent the final state.

### Flow: Record evidence for one ownership boundary

- [ ] The evidence uses two isolated disposable accounts or an equivalent
  isolated ownership fixture at the appropriate layer.
- [ ] A foreign record read does not disclose protected content.
- [ ] A foreign referenced identifier is rejected without changing either
  account's data.
- [ ] The evidence record contains no account password, token, personal data,
  or unredacted authorization header.

### Flow: Keep one inventory link current

- [ ] Every evidence link resolves to a named assertion or reproducible
  manual procedure.
- [ ] A renamed or removed assertion is repaired in the same change that
  invalidates its inventory link.
- [ ] A test filename alone is not treated as proof of a particular behavior.
- [ ] An assertion that only checks rendering is not used to claim mutation,
  persistence, or ownership coverage.

### Flow: Reconcile one coverage status

- [ ] Every row has one evidence status: covered, gap, manual,
  unsupported/excluded, or decision-needed.
- [ ] `covered` is used only when linked evidence asserts the behavior at the
  required layer.
- [ ] `gap` states the missing behavior and the owner responsible for closing
  or resolving it.
- [ ] `manual` states the exact steps, required browser/device, owner, and
  evidence to capture.
- [ ] `unsupported/excluded` states product scope and rationale.
- [ ] `decision-needed` states the decision owner and review deadline or
  trigger.

## Desktop Chrome product counterpart

The following are web-app behavior records, not a replacement for the
feature-by-feature OTOTEST-03 acceptance checklist. Each change touching one
of these shared product surfaces must keep the matching route/control row
current and link evidence at the layer that proves its behavior.

### Flow: Use the authenticated application shell

- [ ] The shell identifies the current page with a meaningful document title
  and page heading.
- [ ] The skip-to-content link moves focus to the main content region.
- [ ] The authenticated navigation exposes supported product routes and
  indicates the active destination.
- [ ] The theme control changes the visible theme and persists the selected
  preference according to product behavior.
- [ ] Signing out hides protected application content and returns to the
  signed-out state.

### Flow: Use global search

- [ ] Opening global search presents the search input and supported result
  categories.
- [ ] Selecting a result opens its corresponding owned record or page route.
- [ ] A no-match query is distinguishable from a failed search request.
- [ ] A failed search request communicates recovery without displaying stale
  results as current.

### Flow: Use the shared timer outside Sessions

- [ ] The floating timer appears on supported non-session routes when the
  account has a running timer.
- [ ] Timer state remains server-owned and agrees across route navigation.
- [ ] A timer action that changes server state has a distinct evidence row
  from timer display or elapsed-time presentation.
- [ ] Timer placement does not cover the current focused control or required
  page action.

### Flow: Receive one application notification

- [ ] A successful action reports its outcome with an accessible status
  announcement.
- [ ] A failed action is not announced as successful.
- [ ] An undo action, when offered, remains available long enough to use and
  identifies the affected record.

### Flow: Use one application dialog

- [ ] The opening action moves focus into the dialog using the expected focus
  behavior.
- [ ] The dialog can be dismissed through its documented cancel/close action.
- [ ] Closing the dialog returns focus to the control that opened it.
- [ ] Dialog content remains scrollable without scrolling the background
  unexpectedly.

### Flow: Use one supported action with a keyboard

- [ ] Each state-changing action can be reached and activated with a
  keyboard-operable semantic control.
- [ ] Focus remains visibly indicated during navigation and form entry.
- [ ] Focus is not covered by sticky, floating, or fixed application chrome.
- [ ] Any essential drag or pointer interaction has a keyboard alternative or
  a documented exception.

## Android Chrome product counterpart

Android Chrome is the mobile web surface in scope. Record its evidence
separately when narrow layout, touch input, browser history, keyboard, or
scroll behavior changes the result; desktop viewport emulation alone is not a
physical-device pass.

### Flow: Open the authenticated app in Android Chrome

- [ ] The authenticated app loads at phone width without page-wide horizontal
  overflow.
- [ ] Every supported destination remains reachable from responsive
  navigation.
- [ ] Browser zoom remains available and the content remains usable when
  enlarged.
- [ ] The document title and current page heading identify the current
  destination.

### Flow: Navigate one destination with touch

- [ ] The destination control has a usable touch target.
- [ ] Activating the destination displays the matching route and page.
- [ ] Adjacent controls do not activate from the same tap.

### Flow: Restore one mobile browser history entry

- [ ] Chrome Back restores the prior route and corresponding visible state.
- [ ] Chrome Forward restores the next route and corresponding visible state.
- [ ] A query-backed filter is restored with the route when the product
  supports that state in browser history.

### Flow: Complete one mobile text-entry action

- [ ] The focused input and entered text remain visible with the Android
  on-screen keyboard open.
- [ ] The control needed to submit, save, or recover remains reachable while
  the keyboard is open.
- [ ] Closing and reopening the keyboard does not discard the current draft
  or move the caret unexpectedly.
- [ ] Text fields accept paste and do not prevent normal browser zoom.

### Flow: Use one mobile modal or drawer

- [ ] The modal or drawer fits within the phone viewport or offers contained
  scrolling.
- [ ] The close and primary action controls remain reachable with the
  keyboard open where text entry is present.
- [ ] The modal or drawer does not leave the background in an unusable scroll
  state after dismissal.

### Flow: Use one mobile drag-capable feature

- [ ] The feature has a tap/click or keyboard alternative where a drag is not
  essential.
- [ ] Touching and releasing without completing a gesture does not mutate
  saved data.
- [ ] A completed gesture shows the resulting selection or order clearly.
- [ ] The final state remains correct after a fresh read when the gesture
  changes persisted data.

### Flow: Use mobile board navigation

- [ ] Board selection and board-management entrypoints remain reachable at
  phone width.
- [ ] Opening a board card displays the selected card editor without clipping
  the current selection.
- [ ] Gantt and Kanban controls offered on mobile remain operable at phone
  width.

### Flow: Use mobile Reports filters

- [ ] The date range control remains reachable at phone width.
- [ ] Path and Label filters remain reachable at phone width.
- [ ] Grouping controls remain reachable at phone width.
- [ ] Floating timer UI does not cover the focused filter or its results.

### Flow: Use mobile Notes editing

- [ ] The Notes list opens the selected note editor on touch.
- [ ] The editor preserves the active text and caret while the keyboard is
  open.
- [ ] Formatting controls remain usable without depending on hover.
- [ ] Save feedback or failure recovery remains reachable after editing.

### Flow: Use mobile Calendar selection

- [ ] A date cell can be selected by touch without a hover prerequisite.
- [ ] Range selection has a tap or keyboard alternative to pointer dragging.
- [ ] The selected date or range is visibly identified before applying a
  change.
- [ ] A canceled range selection does not apply a partial update.

## Gate policy and evidence records

### Flow: Define one required CI gate

- [ ] Every required gate is named by workflow and job/step.
- [ ] The gate is assigned to its evidence layer: frontend unit/component,
  backend unit/API, PostgreSQL/migration, real-stack browser, extension
  browser, or repository checks.
- [ ] The gate specifies its trigger: pull request, push, scheduled, opt-in,
  or manual.
- [ ] The gate states runtime expectations, setup requirements, and any
  external service dependency.
- [ ] A disabled or historical workflow is visibly labeled disabled and is
  not presented as a required passing gate.

### Flow: Maintain the frontend gate

- [ ] The local command and CI job for frontend component behavior are
  recorded separately from the production web build.
- [ ] The web build is represented as build evidence and not as behavioral
  acceptance by itself.
- [ ] Web-app real-browser assertions are associated with the exact browser
  workflow/job that executes them.
- [ ] Desktop Chromium and Android/mobile Chromium evidence are distinguished
  when the covered behavior is platform-sensitive.

### Flow: Maintain the backend gate

- [ ] The backend test command and workflow job are recorded with the
  supported Java/Gradle environment.
- [ ] API contract and ownership evidence are associated with the applicable
  integration assertions, not only controller source scans.
- [ ] PostgreSQL-backed checks identify their disposable database/service,
  migration mode, and cleanup boundary.
- [ ] Migration validation evidence distinguishes an empty-database migration
  from startup against a migrated database.

### Flow: Maintain the real-stack browser gate

- [ ] The browser run record identifies the commit, command/job, browser,
  viewport/device profile, named journey, outcome, and artifact link.
- [ ] The run uses only isolated disposable accounts and data.
- [ ] Persisted user-visible changes are confirmed after a fresh read.
- [ ] Failure artifacts are scrubbed of credentials, tokens, cookies, and
  personal data before upload or retention.
- [ ] A desktop browser result is not reported as Android-device evidence.

### Flow: Maintain the extension browser gate

- [ ] Extension installation and host permission evidence is associated with
  the exact built Manifest V3 artifact and browser profile.
- [ ] Timer and Notes integration evidence identifies the API state confirmed
  after the extension action.
- [ ] Clockify permission and supported-route evidence is distinct from
  normal web-app and Android Chrome evidence.
- [ ] The gate owner and opt-in/manual status are explicit if the workflow is
  not part of the required pull-request gate.

### Flow: Record one release evidence run

- [ ] The evidence record identifies the release/milestone and reviewed
  commit.
- [ ] Each required suite records its exact workflow/job or local command.
- [ ] Each suite records pass, fail, skipped, unavailable, or manual status.
- [ ] Skipped or unavailable evidence includes the reason and responsible
  owner.
- [ ] Browser/device profile and evidence artifact links are recorded for
  browser-based checks.
- [ ] The record lists known limitations and unresolved coverage gaps.
- [ ] Credentials and personal data are absent from checked-in records and
  shared artifacts.

### Flow: Resolve one failed required gate

- [ ] A failing required gate blocks acceptance until the failure is fixed or
  an approved scope decision is documented.
- [ ] The failure record links the failing assertion or job and the relevant
  redacted artifact.
- [ ] The owner records whether the issue is a product defect, test/evidence
  defect, environment failure, or documented limitation.
- [ ] The repaired gate is rerun and the successful run is linked before the
  row is marked covered.

### Flow: Review one inventory during release readiness

- [ ] The route inventory is reconciled against `frontend/src/main.ts`.
- [ ] The endpoint inventory is reconciled against Spring controller
  mappings and the documented API contract.
- [ ] The control/feature inventory is reconciled against the current page
  templates and shared components.
- [ ] The extension permission inventory is reconciled against the current
  Manifest V3 configuration.
- [ ] Unmapped product behavior is assigned a status and owner before the
  release review closes.
- [ ] The review revision and resulting evidence links are recorded.

### Flow: Update project guidance for one coverage-status change

- [ ] `docs/testing.md` identifies the current test layers and authoritative
  local/CI commands.
- [ ] `docs/test-coverage-audit.md` reflects changed gap status and remaining
  limitations.
- [ ] The OTOTEST roadmap and milestone index agree on the milestone status.
- [ ] A milestone is marked Complete only after its acceptance and passing
  run evidence are linked.
- [ ] A closed decision names the affected scope, decision owner, and
  remaining coverage gap.

## Consistency validation

### Flow: Validate one inventory row

- [ ] The consistency review identifies rows without a status.
- [ ] The consistency review identifies duplicate stable IDs.
- [ ] The consistency review identifies broken evidence links.
- [ ] The consistency review identifies a row with no source, owner, or
  evidence classification.
- [ ] A source scan is treated only as drift detection, never as behavioral
  coverage evidence.

### Flow: Resolve one stale evidence reference

- [ ] A stale reference is repaired, or the row is marked as a gap with an
  owner.
- [ ] The replacement reference proves the same behavior and evidence layer
  as the prior reference.
- [ ] A weaker replacement is not silently treated as equivalent evidence.

## Isolation and artifact safety

### Flow: Run one database-backed evidence suite

- [ ] The database is a unique disposable local or CI database.
- [ ] The run verifies its disposable marker and database identity before
  migration or fixture creation.
- [ ] The run does not remove, reset, prune, or recreate the protected
  production PostgreSQL volume.
- [ ] Cleanup is scoped to resources created for that run.

### Flow: Publish one browser artifact

- [ ] The artifact is linked to its workflow run and commit.
- [ ] The artifact contains only the minimum evidence needed to review the
  result.
- [ ] The artifact does not contain account credentials, bearer tokens,
  cookies, authorization headers, or personal data.
- [ ] The retention period and failure-only behavior are documented where
  configured by CI.

## Completion review

### Flow: Reconcile the milestone before closure

- [ ] Every supported web route has a current inventory row or an explicit
  exclusion.
- [ ] Every API operation and alias has a current operation row or an
  explicit scope decision.
- [ ] Every supported control family and gesture has a current row or an
  explicit exclusion.
- [ ] Every extension permission is classified with its product purpose.
- [ ] Each uncovered behavior has a named owner and a documented decision or
  follow-up.
- [ ] Required gate commands and CI job names agree with the current workflow
  definitions.
- [ ] Manual and environment-limited checks have a reproducible procedure
  and assigned owner.
- [ ] Release evidence links to passing runs for every required gate.
- [ ] Desktop Chrome, Android Chrome, and desktop extension evidence are not
  conflated.
- [ ] No native iOS workflow or acceptance result is included.
- [ ] Roadmap, milestone index, testing guidance, and audit agree on the
  completion status.
- [ ] The milestone remains Proposed/In progress if any required acceptance
  item lacks sufficient evidence.

## Traceability record for milestone review

For each accepted criterion, record the stable inventory ID, relevant
route/component/API mapping or workflow job, evidence layer, exact
assertion/procedure, reviewed source revision, result, and run/artifact link.
Record desktop Chrome and Android Chrome outcomes independently when their
behavior differs. Record any excluded or unavailable evidence with its reason
and owner. This checklist defines acceptance expectations only; it does not
claim that OTOTEST-05 gates, tests, or product flows have been implemented or
executed.
