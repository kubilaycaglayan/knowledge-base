# OTOTEST-05 — Traceability and ongoing gates acceptance checklist

**Priority:** High
**Status:** In progress
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

Use the [execution evidence template](evidence-template.md) for each run that
is cited as completion evidence. The automated inventory check is
`node scripts/check-ototest-inventory.mjs`; it verifies local Markdown links,
unique route/API row keys, nonempty source/evidence and classification fields,
matrix ownership, and milestone status consistency. It resolves qualified API
evidence names to existing Java test methods and named frontend test
references in the route/control matrices to declarations in their corresponding
`frontend/src` or `frontend/scripts` test files. It deliberately makes no
claims about assertion quality. It also rejects any API operation row that
does not name at least one qualified Java test assertion reference.

The release gate record is [2026-10-10 OTOTEST-05 evidence](runs/2026-10-10-ototest-05-local-gates.md).
It documents passed local gates and the passing hosted `verify` run. Physical
Android acceptance remains outstanding.

For every accepted route, operation, control family, gesture, permission, or
gate below, the maintained inventory or release record must identify:

- [x] A stable row ID and one clearly stated behavior. Route/API/feature rows
  have unique nonempty identities and behavior/source fields; each detailed
  control action has a unique checklist ID and nonempty source/expected
  behavior cell. CI rejects missing or duplicate row identities.
- [x] The product source: route, component/control, controller operation,
  permission declaration, or workflow/job. The inventory check requires a
  nonempty source field on each row and checks the source/evidence cell on
  every detailed control action.
- [x] The responsible owner for keeping the row current. Each route, API,
  control, and extension/feature matrix declares its Knowledge Base
  maintainer owner; `check-ototest-inventory.mjs` rejects a missing owner.
- [x] The expected user-visible result and URL or persisted state when
  applicable. Route, API, and action rows record the expected behavior and
  resulting route or state; feature rows identify the product outcome and
  remaining risk.
- [x] Applicable failure, ownership, validation, empty, loading, and recovery
  behavior. Each matrix row describes the relevant failure outcomes or records
  them in its gap column; the API matrix additionally gates owner-scoped read
  and referenced-ID mutation claims on integration evidence.
- [x] Evidence layer: unit/component, service/API, persistence/PostgreSQL,
  real browser, or manual review. Route/control/API rows classify their
  evidence layer; extension and cross-client rows distinguish unit, packaged
  browser, real-stack, and manual evidence, with unsupported or unproven
  layers retained as gaps.
- [x] Exact assertion/test or manual procedure and its current status. The
  inventory gate resolves named frontend and Java assertions, rejects stale
  references, requires manual-status rows to link procedures, and validates
  each row’s evidence classification. Gaps remain classified instead of being
  counted as covered.
- [x] Exact local command or CI workflow/job that runs the evidence. Each
  inventory matrix declares its local command; the extension matrix also
  identifies the required packaged-browser CI job. The consistency check
  rejects a matrix without an exact command.
- [x] The last-reviewed source revision and a link to a run/artifact when
  evidence has been executed. Each maintained inventory has a source revision
  and latest hosted evidence-run link; CI rejects missing revision or run
  metadata.
- [x] A limitation, explicit exclusion, or unresolved gap with an owner and
  review trigger where evidence is unavailable. Matrix-level owners and
  review triggers apply to their rows; the metadata gate rejects a missing
  review trigger.

## Inventory freshness and product-change flows

### Flow: Classify one changed web route

- [x] A newly registered route receives its own stable inventory row. The
  smoke source-drift check compares every static route pattern from
  `frontend/src/main.ts` with the route matrix; the matrix identity check
  rejects duplicate and missing route rows.
- [x] A changed route path, alias, guard, redirect, or route parameter updates
  the existing row or adds a separate row when behavior is distinct. The
  [PR template](../../.github/pull_request_template.md) and
  [testing guidance](../testing.md) require same-review route inventory
  updates for these changes; smoke source-drift validation detects route-path
  additions and removals.
- [x] A retired route is marked unsupported or intentionally excluded with a
  reason and owner instead of disappearing from the inventory. Route source
  drift is reported unless the retained matrix row is explicitly classified
  `unsupported/excluded`; the inventory also requires source, ownership, and
  review-trigger metadata.
- [x] The route row describes direct loading, page identity, authentication
  behavior, query state, and invalid or unavailable resource behavior as
  applicable. The [route matrix](01-route-matrix.md) records each route/state,
  its source and named direct-load/navigation evidence, plus the remaining
  unavailable-resource or query-state gaps per route; the shared authenticated
  shell row names the signed-out and post-sign-in outcomes.
- [x] `/development` remains explicitly classified as temporary tooling and
  excluded from supported route completeness and authenticated navigation.
  The route matrix retains its `unsupported/excluded` row, and the component
  and browser assertions verify that no navbar or global-search shortcut
  exposes the route.

### Flow: Classify one changed web control

- [x] A new or behaviorally changed visible control receives a distinct row
  for its action and expected result. The [PR template](../../.github/pull_request_template.md)
  requires a distinct inventory action ID; the control matrix assigns stable
  IDs and the inventory check rejects malformed or duplicate detailed rows.
- [x] The row names the control, starting state, input method, visible result,
  and persistence or URL effect when applicable. These row fields are required
  by the [testing guidance](../testing.md) and PR template for changed
  controls; the control matrix records source/action/result and explicit
  evidence gaps.
- [x] A dialog action has separate rows for opening, successful submission,
  cancellation, applicable validation, and recoverable request failure. The
  [testing guidance](../testing.md) and PR template require these as separately
  reviewable actions when the dialog changes.
- [x] A destructive action has a row for confirmation or its offered undo
  path. The [testing guidance](../testing.md) and PR template require the
  confirmation or undo path to be recorded for changed destructive actions.
- [x] A control that only appears decorative or unavailable is explicitly
  labeled non-interactive with its reason. The control matrix records
  unsupported/excluded actions with their rationale and revisit trigger, and
  the change guidance requires the same classification for unavailable
  controls.

### Flow: Classify one changed API operation

- [x] Every new or changed controller mapping is recorded as an HTTP method
  and fully composed `/api/v1` path. The smoke source-drift check compares the
  generated OpenAPI operations with the API matrix.
- [x] Each method/path alias is recorded as its own operation row. OpenAPI
  method/path pairs are compared individually, including aliases, and drift
  fails the smoke run.
- [x] The operation row states authentication, request inputs, response
  contract, owner-scoped identifiers, and observable state effect. The [API
  matrix](01-api-matrix.md) states the default authentication and owner-scope
  rules, records each method/path with controller inputs and state/edge
  behavior, and defines how response contracts are derived from controller
  signatures and verified per operation.
- [x] The row links evidence for its successful behavior and each applicable
  validation, ownership, or conflict outcome. All 107 operation rows name
  Java test methods; the inventory gate resolves those references, while
  operation-specific unproven outcomes remain explicit gaps in the matrix.
- [x] A server operation with no supported web-client call site is explicitly
  classified with a scope decision and owner. The [API matrix](01-api-matrix.md)
  identifies all seven operations, records the OTOTEST-05 decision to retain
  the existing API contract without adding client surfaces, and assigns future
  support/deprecation review to Knowledge Base maintainers before deprecation.
- [x] A UI mock or route-level assertion is not used as evidence of backend
  persistence or ownership enforcement. The evidence policy requires an
  integration layer for persistence and ownership claims, with regression
  tests guarding the rule.

### Flow: Classify one changed browser gesture

- [x] A new or changed pointer, drag, keyboard, or touch gesture receives its
  own behavior row. The [PR template](../../.github/pull_request_template.md)
  requires a distinct inventory action ID for each changed gesture.
- [x] The row identifies the supported desktop Chrome input method. The
  [testing guidance](../testing.md) and PR template require desktop Chrome
  input to be recorded for changed gestures.
- [x] The row identifies the supported Android Chrome input method when the
  gesture is offered on a phone. The [testing guidance](../testing.md) and PR
  template require Android Chrome input to be recorded separately where
  offered; physical-device execution remains open in the mobile flows below.
- [x] A drag-dependent action records its tap/click or keyboard alternative
  where that action is not inherently pointer-only. The [testing guidance](../testing.md)
  and PR template require applicable alternatives for changed gestures.
- [x] Pointer cancellation, lost capture, or interrupted input has a recovery
  result when applicable. The [testing guidance](../testing.md) and PR
  template require recovery to be documented for interrupted pointer input.

### Flow: Classify one changed security boundary

- [x] A new or changed route guard records signed-out and authenticated
  outcomes separately. The [route matrix](01-route-matrix.md) links the
  shared-shell row to browser assertions for protected content while signed
  out, restoration after sign-in, and rejection of unsafe return URLs.
- [x] A record read records owned, missing, and foreign-ID outcomes where the
  route accepts a record identifier. Covered ID-addressed GET rows state the
  three outcomes, and `CrossUserIsolationIntegrationTest.foreignAndMissingDirectIdsHaveTheSameNotFoundResponse`
  compares foreign and missing responses for paths, label histories, boards,
  card lists/pages, and Gantt reads; resource-specific integration tests prove
  owned results.
- [x] A mutation that references another record records ownership checks for
  each referenced Path, Label, board, status, note, or activity identifier
  used by that behavior. `CrossUserIsolationIntegrationTest.intruderCannotReferenceOwnedResourcesFromTheirOwnData` exercises foreign Path, Label, status, and board references across time entries, timers, notes, logs, cards, and calendar assignments; the API matrix records the integration layer and unchanged-owner-state assertion.
- [x] A new public API route records its deliberate public status and the
  reason for bypassing authentication. Each current public operation names its
  unauthenticated purpose; the inventory check and public-status regression
  reject public rows without a rationale.
- [x] Security evidence identifies the layer proving the boundary rather
  than inferring it from a UI-hidden control.

### Flow: Classify one changed extension permission

- [x] A changed Manifest V3 permission or host permission receives a stable
  extension inventory row and product purpose.
- [x] The row states the feature affected when permission is absent or denied.
  `check-ototest-extension-permissions.mjs` reconciles the built manifest with
  the matrix and requires a denied/absent outcome for each declaration.
- [x] The row records the review owner and the extension build/job that
  validates the resulting permission declaration. Matrix metadata supplies the
  maintainer owner and `verify / web-and-extension` builds and checks the
  generated manifest before running this reconciliation gate.
- [x] An extension permission row is not mislabeled as Android Chrome web-app
  evidence; mobile Chrome extension hosting is not part of this checklist. The
  feature map keeps desktop extension permissions separate from the explicitly
  `unsupported/excluded` Android extension surface.

## Supported route inventory freshness

Each supported route below must have an inventory row. Route rows may link to
the feature-level criteria in the OTOTEST-03 checklist, but the route, direct
load, and route-state evidence must remain individually identifiable.

### Flow: Keep the Sessions route current

- [x] `/` is listed as the Sessions workspace route.
- [x] `/sessions` is listed as a supported alias and its redirect to `/` is
  recorded.
- [x] `/sessions/:id` is listed as a session detail/edit deep link.

### Flow: Keep the Paths routes current

- [x] `/paths` is listed as the Paths workspace route.
- [x] `/paths/:id` is listed as a Path detail/history deep link.

### Flow: Keep the Timeline route current

- [x] `/timeline` is listed with its supported query/filter state.

### Flow: Keep the Logs routes current

- [x] `/logs` is listed as the Logs workspace route.
- [x] `/logs/:id` is listed as a Log detail deep link.

### Flow: Keep the Reports route current

- [x] `/reports` is listed with its supported date range and filter query
  state.
- [x] Query-state restoration and browser Back/Forward behavior are called
  out as distinct route behaviors.

### Flow: Keep the Calendar route current

- [x] `/calendar` is listed with supported date query state.

### Flow: Keep the Imports route current

- [x] `/imports` is listed with import source, history, pagination, and batch
  undo entrypoints represented in the feature inventory.

### Flow: Keep the Settings route current

- [x] `/settings` is listed with Account, Import, Export, and preference
  sections represented where supported.

### Flow: Keep the Labels routes current

- [x] `/labels` is listed as the Labels workspace route.
- [x] `/labels/:id` is listed as a label history deep link.

### Flow: Keep the Board routes current

- [x] `/board` is listed with board selection, Kanban, Gantt, and All boards
  states represented in the feature inventory.
- [x] `/board/archive` is listed with its board/card query focus behavior.

### Flow: Keep the Notes routes current

- [x] `/notes` is listed as the Notes list/editor route.
- [x] `/notes/:id` is listed as a note editor deep link.

### Flow: Verify direct loading of one supported route

- [x] Loading a supported route directly renders its intended page after the
  authenticated shell is available.
- [x] A route with a selected record resolves that record from its route
  parameter.
- [x] Missing or inaccessible IDs produce a safe state without exposing
  protected details.
- [x] An unknown URL produces the documented not-found or safe fallback
  behavior and does not render an unrelated protected record.

### Flow: Restore one protected deep link after sign-in

- [x] Opening a protected deep link while signed out presents the sign-in
  state before protected content.
- [x] Completing sign-in restores the intended safe internal destination.
- [x] An external or malformed return destination does not navigate away from
  Knowledge Base.

### Flow: Restore one URL-backed filter

- [x] A supported filter is reflected in its documented URL query state.
- [x] Reloading the URL restores the same selected filter and corresponding
  visible results.
- [x] Browser Back and Forward restore the related route, query, and visible
  selection together.

### Flow: Navigate one supported route from the application shell

- [x] The authenticated navigation exposes each supported destination. The
  phone-width browser assertion checks the complete destination list and
  minimum target size.
- [x] Selecting a destination updates the route, active link, title, and
  level-one page heading together in the named navigation browser assertion.
- [x] Browser-native link actions remain available for navigation links. The
  browser test opens the Board route in a new tab with Control-click while
  retaining the current page.
- [x] The temporary `/development` route is not linked from authenticated
  product navigation.

## Cross-layer evidence and change guidance

### Flow: Record evidence for one user-visible mutation

- [x] The evidence starts from an identified UI control and a known account
  state.
- [x] The evidence records the visible successful result.
- [x] A fresh read proves the changed value remains after navigation or
  reload when the behavior is persisted.
- [x] A failed request is distinguishable from a successful save.
- [x] A retry does not create duplicate records when the action is expected
  to be idempotent or protected from duplicate submission.

### Flow: Record evidence for one deletion or archive action

- [x] The evidence records the confirmation or undo affordance shown before
  the destructive effect. Evidence: the real-stack Notes journey captures and
  checks the exact Archive confirmation copy.
- [x] The evidence records the selected record identity so unrelated records
  can be distinguished. Evidence: generated title, API ID, and retained body
  marker are asserted across active and archived reads.
- [x] A fresh read proves the intended record is absent or archived according
  to the documented contract. Evidence: fresh active and `archived=true`
  collection reads check membership after the successful archive.
- [x] A failed request leaves server-owned state accurately represented and
  offers a recovery path where applicable. Evidence: a single UI-layer 503
  leaves the note visible and present in a fresh active read; the error is
  announced and a second Archive action succeeds.

### Flow: Record evidence for one restore action

- [x] The evidence identifies the archived record and destination context.
- [x] The visible result shows the record in its restored state.
- [x] A fresh read proves the restored state persists.
- [x] Repeating the restore does not misrepresent the final state. Evidence:
  the Notes view disables Restore while the request is pending; the component
  regression test verifies one request despite a repeated activation, and the
  real-stack journey confirms one active record and no archived copy after
  restore.

### Flow: Record evidence for one ownership boundary

- [x] The evidence uses two isolated disposable accounts or an equivalent
  isolated ownership fixture at the appropriate layer.
- [x] A foreign record read does not disclose protected content.
- [x] A foreign referenced identifier is rejected without changing either
  account's data. Evidence: `LogLabelsIntegrationTest.labelUpdatesReplaceAssignmentsAndRejectForeignOrWrongScopeLabels`
  uses two isolated accounts, expects 400 for the foreign Label ID, rereads
  the owner's Log to confirm its prior assignment remains, and verifies the
  foreign owner's Label remains in its catalog.
- [x] The evidence record contains no account password, token, personal data,
  or unredacted authorization header.

### Flow: Keep one inventory link current

- [x] Every evidence link resolves to a named assertion or reproducible
  manual procedure. CI resolves route/control frontend assertion names and
  API/control Java test methods; manual-status rows require a linked
  procedure, and local links must resolve.
- [x] A renamed or removed assertion is repaired in the same change that
  invalidates its inventory link. The consistency gate fails on stale
  frontend names and missing Java test method declarations, so the inventory
  link must be repaired before the change can pass CI.
- [x] A test filename alone is not treated as proof of a particular behavior.
  Covered route, API, control, and extension rows must name an assertion; CI
  resolves browser and extension assertion titles and Java test methods, and
  rejects stale references. Detailed control actions are checked individually.
- [x] An assertion that only checks rendering is not used to claim mutation,
  persistence, or ownership coverage. CI requires named assertions for covered
  rows and requires stateful integration evidence when a row claims persisted
  state, readback, or ownership. Mutating control claims were reviewed against
  their named action assertions; gaps retain their gap status.

### Flow: Reconcile one coverage status

- [x] Every route, API operation, control-family/action, extension
  entrypoint/permission, cross-client domain/journey, and closed support
  decision row has one evidence status: covered, gap, manual,
  unsupported/excluded, or decision-needed. The inventory CI check rejects
  blank, combined, or unknown statuses across these tables.
- [x] Every route row has exactly one status from that set; the inventory CI
  check rejects blank, combined, or unknown route statuses. Remaining route
  gaps are assigned to Knowledge Base maintainers in the matrix metadata.
- [x] Every API operation row has exactly one status from that set; the
  inventory CI check rejects blank, combined, or unknown API statuses. Rows
  with unresolved supported-client use are `decision-needed` and retain their
  maintainer-owned decision in the matrix.
- [x] Every top-level control-family row has one status from that set; all 15
  are `gap` because each family has remaining behavior listed, and CI rejects
  a blank, combined, or unknown family status. Detailed action rows remain
  individually open in the acceptance inventory.
- [x] Each extension entrypoint/permission row has one status. The permission
  prompt is `manual` with an exact procedure link; the excluded mobile
  extension surface includes its rationale. CI rejects invalid statuses.
- [x] Each cross-client feature-domain and ordered-journey row has one `gap`
  status while its final column lists unproven behavior; CI rejects invalid
  statuses and duplicate journey IDs.
- [x] `covered` is used only when linked evidence asserts the behavior at the
  required layer.
- [x] `gap` states the missing behavior and the owner responsible for closing
  or resolving it.
- [x] `manual` states the exact steps, required browser/device, owner, and
  evidence to capture.
- [x] `unsupported/excluded` states product scope and rationale.
- [x] `decision-needed` states the decision owner and review trigger.

## Desktop Chrome product counterpart

The following are web-app behavior records, not a replacement for the
feature-by-feature OTOTEST-03 acceptance checklist. Each change touching one
of these shared product surfaces must keep the matching route/control row
current and link evidence at the layer that proves its behavior.

### Flow: Use the authenticated application shell

- [x] The shell identifies the current page with a meaningful document title
  and level-one page heading; navigation acceptance checks each primary route.
- [x] The skip-to-content link moves focus to the main content region; the
  keyboard browser assertion verifies focus and the URL fragment.
- [x] The authenticated navigation exposes supported product routes and
  indicates the active destination for each selected route.
- [x] The theme control changes the visible theme and persists the selected
  preference across route changes and reload.
- [x] Signing out clears authentication, hides protected content, and keeps
  protected routes gated through Back and reload.

### Flow: Use global search

- [x] Opening global search presents the search input and supported result
  categories. Browser evidence: `opens global search from the header or
  shortcut and lists matching pages before records` and `groups matching
  record types, shows note context, and opens the active result with Enter`.
- [x] Selecting a result opens its corresponding owned record or page route.
  Browser evidence: `groups matching record types, shows note context, and
  opens the active result with Enter` opens the selected note at its direct
  record route; native link behavior is separately checked for new tabs.
- [x] A no-match query is distinguishable from a failed search request.
  Browser evidence: `distinguishes no matches from failed search and clears
  stale results` checks the no-match message without an alert, then a failed
  request with a retry alert and no stale result.
- [x] A failed search request communicates recovery without displaying stale
  results as current. Browser evidence: `distinguishes no matches from failed
  search and clears stale results` plus `recovers from a failed global search
  request with the in-dialog retry` verifies the error state, clears prior
  results, and retries successfully.

### Flow: Use the shared timer outside Sessions

- [x] The floating timer appears on supported non-session routes when the
  account has a running timer. `shows the floating tracker on eligible routes
  but not Sessions or focused phone inputs` starts a timer, directly loads each
  supported route, and checks the floating tracker exposes Stop timer.
- [x] Timer state remains server-owned and agrees across route navigation.
  `keeps a running timer active after route navigation and browser reload`
  confirms `/timers/current` is reread after direct navigation and reload;
  `TimerServiceEdgeTest.currentReadsOnlyTheAuthenticatedUsersRunningTimer`
  verifies the owner-scoped service read and
  `TimerApiTest.currentTimerReadUsesAuthenticatedUserAndReturnsRunningState`
  verifies the authenticated API response.
- [x] A timer action that changes server state has a distinct evidence row
  from timer display or elapsed-time presentation. `FLOW-01.01–01.19` maps
  state-changing timer actions, separately from the shared-shell floating
  timer display and placement row.
- [x] Timer placement does not cover the current focused control or required
  page action. The 390px Chromium viewport assertion in `shows the floating
  tracker on eligible routes but not Sessions or focused phone inputs` verifies
  the tracker closes when the Log text input receives focus and the input
  remains inside the viewport. This is viewport emulation, not physical
  Android Chrome evidence.

### Flow: Receive one application notification

- [x] A successful action reports its outcome with an accessible status
  announcement. `AppSnackbar.test.ts` asserts the Path-saved message in the
  `role="status"` region.
- [x] A failed action is not announced as successful. `AppSnackbar.test.ts`
  asserts the failure text and error tone in the status region and confirms the
  status does not contain the success message.
- [x] An undo action, when offered, remains available long enough to use and
  identifies the affected record. `confirms Path removal and restores it
  through the Undo action` verifies the named Undo status remains visible for
  seven seconds and restores that Path.

### Flow: Use one application dialog

- [x] The opening action moves focus into the dialog using the expected focus
  behavior. `moves focus into and returns focus from the Path create dialog`
  verifies focus enters the Path name field.
- [x] The dialog can be dismissed through its documented cancel/close action.
  The same browser assertion dismisses with Escape.
- [x] Closing the dialog returns focus to the control that opened it. The
  browser assertion confirms focus returns to Add path.
- [x] Dialog content remains scrollable without scrolling the background
  unexpectedly. `keeps Path dialog content scrollable without scrolling the
  background` scrolls the dialog to its end and confirms the underlying page's
  scroll position does not change.

### Flow: Use one supported action with a keyboard

- [x] Each state-changing action can be reached and activated with a
  keyboard-operable semantic control. The keyboard-only Path create and reorder
  browser checks exercise navigation, activation, and persistence; board card
  and status reordering, note ordering, and Gantt date editing expose semantic
  controls with keyboard alternatives.
- [x] Focus remains visibly indicated during navigation and form entry. The
  `shows a visible keyboard focus ring that is not covered by the shell`
  browser assertion checks the first Tab target; `creates and reloads a Path
  using only the keyboard` asserts a visible 2px ring remains on the focused
  Path name input before keyboard entry and submission.
- [x] Focus is not covered by sticky, floating, or fixed application chrome.
  The same Path create assertion checks that the input center is the topmost
  element at its screen position.
- [x] Any essential drag or pointer interaction has a keyboard alternative or
  a documented exception. Paths, notes, board statuses, and board cards have
  keyboard reorder controls. Gantt date gestures have keyboard-accessible date
  fields in the card editor; selecting a range directly on an undated row is a
  pointer convenience and the same dates can be entered in that editor.

## Android Chrome product counterpart

Android Chrome is the mobile web surface in scope. Record its evidence
separately when narrow layout, touch input, browser history, keyboard, or
scroll behavior changes the result; desktop viewport emulation alone is not a
physical-device pass. Use the [manual evidence procedure](../testing.md#manual-and-platform-limited-evidence)
and [execution template](evidence-template.md); record a separate result for
each checklist item, including unrun items, together with device, Android and
Chrome versions, viewport/orientation, and input method.

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

- [x] Every existing required gate is named by workflow and job/step in the
  testing guidance.
- [x] The gate is assigned to its evidence layer: frontend unit/component,
  backend unit/API, PostgreSQL/migration, real-stack browser, extension
  browser, or repository checks. The packaged extension browser suite is a
  required pull-request job; native permission prompt rendering remains
  manual.
- [x] The gate specifies its trigger: pull request, push, scheduled, opt-in,
  or manual. Existing `verify` workflow jobs run on push and pull request.
- [x] The gate states approximate observed local runtime and setup for each
  evidence layer; it labels these observations as nonbinding CI estimates.
- [x] A disabled or historical workflow is visibly labeled disabled and is
  not presented as a required passing gate.

### Flow: Maintain the frontend gate

- [x] The local command and CI job for frontend component behavior are
  recorded separately from the production web build.
- [x] The web build is represented as build evidence and not as behavioral
  acceptance by itself.
- [x] Web-app real-browser assertions are associated with the exact browser
  workflow/job that executes them.
- [x] Desktop Chromium and Android/mobile Chromium evidence are distinguished
  when the covered behavior is platform-sensitive.

### Flow: Maintain the backend gate

- [x] The backend test command and workflow job are recorded with the
  supported Java/Gradle environment.
- [x] API contract and ownership evidence are associated with the applicable
  integration assertions, not only controller source scans.
- [x] PostgreSQL-backed checks identify their disposable database/service,
  migration mode, and cleanup boundary.
- [x] Migration validation evidence distinguishes an empty-database migration
  from startup against a migrated database.

### Flow: Maintain the real-stack browser gate

- [x] The browser run record identifies the commit, command/job, browser,
  viewport/device profile, named journey, outcome, and artifact link.
- [x] The run uses only isolated disposable accounts and data.
- [x] Persisted user-visible changes are confirmed after a fresh read.
- [x] Failure artifacts are scrubbed of credentials, tokens, cookies, and
  personal data before upload or retention.
- [x] A desktop browser result is not reported as Android-device evidence.

### Flow: Maintain the extension browser gate

- [x] Extension installation and declared host permissions are checked against
  the built Manifest V3 artifact in the packaged browser job, which launches a
  fresh temporary Chromium profile. Browser-native permission prompt rendering
  remains a separate manual check.
- [x] Timer and Notes integration assertions confirm the corresponding state
  returned by the isolated loopback API fixture after extension actions.
- [x] Clockify content-script routing through the extension service worker is
  covered in the packaged extension browser job and is distinct from web-app
  and Android Chrome evidence.
- [x] The gate owner and required pull-request workflow/job are explicit in
  `docs/testing.md`; the exact local runner remains available.

### Flow: Record one release evidence run

- [x] The evidence template identifies the release/milestone and reviewed
  commit.
- [x] Each required suite records its exact workflow/job or local command.
- [x] Each suite records pass, fail, skipped, unavailable, or manual status.
- [x] Skipped or unavailable evidence includes the reason and responsible
  owner.
- [x] Browser/device profile and evidence artifact links are recorded for
  browser-based checks.
- [x] The record lists known limitations and unresolved coverage gaps.
- [x] Credentials and personal data are absent from checked-in records and
  shared artifacts.

### Flow: Resolve one failed required gate

- [x] A failing required gate blocks acceptance until the failure is fixed or
  an approved scope decision is documented.
- [x] The failure record links the failing assertion or job and the relevant
  redacted artifact.
- [x] The owner records whether the issue is a product defect, test/evidence
  defect, environment failure, or documented limitation.
- [x] The repaired gate is rerun and the successful run is linked before the
  row is marked covered.

### Flow: Review one inventory during release readiness

- [x] The route inventory is reconciled against `frontend/src/main.ts`.
- [x] The endpoint inventory is reconciled against Spring controller
  mappings and the documented API contract.
- [x] The control/feature inventory is reconciled against the current page
  templates and shared components.
- [x] The extension permission inventory is reconciled against the current
  Manifest V3 configuration.
- [x] Unmapped product behavior is assigned a status and owner before the
  release review closes.
- [x] The review revision and resulting evidence links are recorded.

### Flow: Update project guidance for one coverage-status change

- [x] `docs/testing.md` identifies the current test layers and authoritative
  local/CI commands.
- [x] `docs/test-coverage-audit.md` reflects changed gap status and remaining
  limitations.
- [x] The OTOTEST roadmap and milestone index agree on the milestone status.
- [x] A milestone is marked Complete only after its acceptance and passing
  run evidence are linked. `check-ototest-inventory.mjs` rejects completing
  OTOTEST-05 while acceptance items remain unchecked or the evidence record
  lacks a passing hosted run link; four focused tests exercise these outcomes.
- [x] A closed decision names the affected scope, decision owner, and
  remaining coverage gap. The project owner's desktop-only extension support
  decision and the separate physical Android web-acceptance gap are recorded
  in the [extension and feature map](01-extension-and-feature-map.md#closed-support-decision).

## Consistency validation

### Flow: Validate one inventory row

- [x] The consistency review identifies rows without an evidence
  classification.
- [x] The consistency review identifies duplicate route and API row keys.
- [x] The CI check identifies broken local Markdown inventory links.
- [x] The CI check resolves named component and browser assertions in the
  route/control matrices to declarations in their cited frontend test files
  and has regression coverage for a renamed assertion reference.
- [x] Covered API mutations whose request DTOs carry another record’s ID
  must state an ownership outcome; a regression test protects the rule.
- [x] Covered API reads addressed by a record ID must state owned, missing,
  and foreign-ID outcomes; a regression test protects the rule.
- [x] The consistency review identifies a row with no source, matrix owner, or
  evidence classification.
- [x] A source scan is treated only as drift detection, never as behavioral
  coverage evidence.

### Flow: Resolve one stale evidence reference

- [x] A stale reference is repaired, or the row is marked as a gap with an
  owner.
- [x] The replacement reference proves the same behavior and evidence layer
  as the prior reference.
- [x] A weaker replacement is not silently treated as equivalent evidence.

## Isolation and artifact safety

### Flow: Run one database-backed evidence suite

- [x] The database is a unique disposable local or CI database. The
  `backend-postgres` service uses `kb_test_ci_<run-id>_<attempt>`; see hosted
  [`verify` run 38103757836](runs/2026-10-10-ototest-05-local-gates.md#2026-10-11-supplement--postgresql-test-target-isolation).
- [x] The run verifies its disposable marker and database identity before
  migration or fixture creation. `PostgresTestDatabaseGuard` checks the
  `KB_TEST_POSTGRES_DISPOSABLE` marker, unique name, loopback host, resolved
  `current_database()`, and empty schema before Flyway; migrated mode requires
  successful Flyway history.
- [x] The run does not remove, reset, prune, or recreate the protected
  production PostgreSQL volume. CI uses its ephemeral PostgreSQL service and
  the job does not mount or address the production Compose volume.
- [x] Cleanup is scoped to resources created for that run. GitHub Actions tears
  down the per-job PostgreSQL service after the run; no database or volume
  deletion command is used by the integration tests.

### Flow: Publish one browser artifact

- [x] The artifact is linked to its workflow run and commit. Timer and
  line-history upload names include workflow run ID and attempt; the summary
  links the workflow run, and runner failure/metadata files record the commit.
- [x] The artifact contains only the minimum evidence needed to review the
  result: scrubbed trace DOM snapshots, diagnostics, and runner logs; trace
  screenshot capture is disabled. Passing runs upload no artifact.
- [x] Trace redaction covers credentials, bearer/basic authorization values,
  cookies, and email addresses. The committed redaction test exercises these
  values and verifies an unsanitizable trace is removed. Browser tests use
  generated disposable accounts; no live personal account data is used.
- [x] The workflow configures failure-only uploads with 14-day retention, and
  `node scripts/check-browser-artifact-policy.mjs` enforces linkage, retention,
  and redaction setup.

## Completion review

### Flow: Reconcile the milestone before closure

- [x] Every supported web route has a current inventory row or an explicit
  exclusion.
- [x] Every API operation and alias has a current operation row or an
  explicit scope decision.
- [x] Every supported control family and gesture has a current row or an
  explicit exclusion.
- [x] Every extension permission is classified with its product purpose.
- [x] Each uncovered behavior has a named owner and a documented decision or
  follow-up.
- [x] Required gate commands and CI job names agree with the current workflow
  definitions.
- [x] Manual and environment-limited checks have a reproducible procedure
  and assigned owner in `docs/testing.md` (physical Android Chrome and
  extension permission prompts; iOS is out of scope).
- [x] Release evidence links to passing runs for every required gate.
- [x] Desktop Chrome, Android Chrome, and desktop extension evidence are not
  conflated.
- [x] No native iOS workflow or acceptance result is included.
- [x] Roadmap, milestone index, testing guidance, and audit agree on the
  completion status.
- [x] The milestone remains Proposed/In progress if any required acceptance
  item lacks sufficient evidence.

## Traceability record for milestone review

For each accepted criterion, record the stable inventory ID, relevant
route/component/API mapping or workflow job, evidence layer, exact
assertion/procedure, reviewed source revision, result, and run/artifact link.
Record desktop Chrome and Android Chrome outcomes independently when their
behavior differs. Record any excluded or unavailable evidence with its reason
and owner. Checked criteria link to the current inventory, guidance, and run
evidence. Unchecked criteria remain open product-flow or release-review
acceptance items; completing gate setup does not imply those behaviors have
been exercised or their gaps closed.
