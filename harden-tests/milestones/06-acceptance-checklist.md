# HARD-06 acceptance checklist: iOS validation

Use this checklist with [HARD-06](06-ios-validation.md). Linux portability
checks are not evidence of SwiftUI or simulator behavior.

## Test inventory and supported host

- [x] Inventory the current test target shape: `KnowTests` is the Swift package
  test target; `KnowUITests` is included by `ios/project.yml` and the generated
  Xcode scheme. The UI suite has auth and workspace screen cases, but the
  historical disabled workflow selects only two Notes UI cases plus all unit
  tests; model tests do not render or simulator-verify workspace screens.
- [x] Record current machine boundary: the checked-in runbook/workspace targets
  Linux, and this host has no `xcodebuild` or `xcodegen`. A Linux Swift check is
  not evidence of native SwiftUI or simulator behavior.
- [x] Inventory `KnowTests` and `KnowUITests` by screen, API flow, auth state,
  shared note conversion, and create/edit/archive/restore behavior. Use the
  coverage matrix below and link every automated row to concrete test names;
  list missing behavior explicitly in
  [`06-test-inventory.md`](06-test-inventory.md).
- [x] Mark each flow automated, manual, deferred, or unsupported and link its
  test or explicit gap; do not infer rendered UI coverage from model tests.
  The source-level behavior disposition is recorded in the inventory; no
  manual simulator run has been claimed.
- [x] Select a supported macOS/Xcode host and document Xcode, XcodeGen,
  simulator runtime/device, scheme, test destination, and signing assumptions.
  The hosted macOS 26.6.2 / Xcode 26.6, XcodeGen 2.46.0, and iOS 26.5
  simulator selection are recorded in the
  [HARD-06 run report](../runs/2026-10-09-hard06-ios-simulator.md).
- [x] Provide a reproducible command or active CI job that generates the
  project, builds the app, and runs the intended unit and UI test sets.
  The full-scheme `xcodebuild test` command is documented in
  [`06-supported-validation.md`](06-supported-validation.md); its execution is
  tracked separately below.
- [x] Verify the chosen path on the actual supported host with a clean
  checkout before proposing any workflow change. Both existing iOS jobs in
  `.github/workflows/verify.yml` are hard-disabled with `if: ${{ false }}`;
  repository variables cannot enable them. The full command ran from a clean
  checkout on the selected hosted Mac; the result is a failed validation, not
  a passing gate. See the linked run report for all test failures.
- [x] Keep `check-ios-note-document.sh` identified as Foundation-only Linux
  validation; do not report it as a SwiftUI build or simulator pass.

### Current evidence map

This is an initial source inventory, not a claim that the milestone is done.
Refresh test names and omissions when the source changes.

| Area | Current source evidence | What that evidence does not establish yet |
| --- | --- | --- |
| Authentication/session | [`KnowTests.swift`](../../ios/KnowTests/KnowTests.swift) covers API/session state and recovery; [`KnowUITests.swift`](../../ios/KnowUITests/KnowUITests.swift) includes login controls, registration validation/mode switching, password visibility, and sign-out cases. | Full live backend sign-in/registration or Google consent; every auth state rendered at supported text sizes; complete intended UI suite on an active macOS gate. |
| Notes/document/line history | `NotesTests.swift` covers rich/plain document conversion, line-history rules, pagination cache, create/archive, conflict retry, pin/reorder contracts. | Native note editor end-to-end save against API, rendered line-history review/edit, relaunch persistence, accessibility and failure states on simulator. |
| Sessions/timer | `SessionsTests.swift` covers model load, start/stop, failures/retry, stale polling, WebSocket snapshot behavior, and local date grouping. | Full native timer UI interaction with real API/WebSocket, reconnection under app background/foreground, and rendered recovery in simulator. |
| Logs | `LogsTests.swift` covers timestamp parsing, local grouping, create/edit/delete, conflicts, retry, and unauthorized recovery. | Native rendered list/detail/edit flows and persistence across navigation/relaunch on simulator. |
| Paths | `PathsTests.swift` covers load/create/update, undo/merge transport, offline recovery, history formatting, and unauthorized handling. | Rendered navigation, confirmation/undo behavior, VoiceOver order, and API-backed persistence in simulator. |
| Labels | `LabelsTests.swift` covers Codable/sorting, create/edit/delete, validation, failure draft retention, and unauthorized recovery. | Native UI label management, color/name accessibility, and full API persistence journey. |
| Calendar | `CalendarTests.swift` covers date grid, local-date round trip, Codable, drafts, cache/range selection, failures/retry, labels, and loading races. | Rendered calendar navigation, VoiceOver/calendar semantics, locale/timezone behavior on actual simulator runtimes. |
| Reports | `ReportsTests.swift` covers range presets, filters, aggregation, date boundaries, cache/races, malformed/offline responses, fixtures, and theme contrast. | Rendered chart navigation and Dynamic Type/VoiceOver interaction across supported simulator sizes. |
| Native UI suite | [`KnowUITests.swift`](../../ios/KnowUITests/KnowUITests.swift) launches app with `-ui-testing` and has authentication, notes, sessions, logs, paths, calendar, and reports cases/fixtures. | Coverage of every native screen and full workflow; inventory every case and run the intended UI set on a supported simulator. |
| Linux portability | `scripts/check-ios-note-document.sh` runs Foundation-focused note conversion XCTest in a Linux Swift image. | SwiftUI compile, app target/linking, XcodeGen project, iOS SDK behavior, simulator, signing, or UI automation. |

The disabled GitHub Actions job currently selects only
`testNotesListEditorAndArchiveControlsAreReachable` and
`testNotesLineHistoryListsEachLineWithItsEditTime` for UI execution; the scheme
containing all UI tests does not mean every case runs in that workflow.

## Behavior matrix

For each screen and scenario, capture launch state, action, expected visible
state, backend/API fixture, persistence check, accessibility check, test name,
test class, host/profile, and artifact link. A model-only test can satisfy
model behavior but cannot satisfy a rendered UI row.

| Screen/flow | Required behavior cases | Minimum evidence distinction |
| --- | --- | --- |
| Launch and auth | First launch; signed-out route; valid sign-in; registration; password visibility; token/session restore; logout; expired/invalid session; unauthorized response; Google configured/unconfigured/cancelled/error. | Model/API contract tests plus simulator UI for visible state, form errors, focus/keyboard, session routing, and retry. Never use personal OAuth credentials. |
| Notes | List/detail; create/edit; save; archive/restore; pagination; long content; rich/plain conversion; line history; stale version conflict; retry; offline/error; relaunch. | Verify server persistence where applicable and document which tests use stubs versus isolated API fixtures. Preserve line rules and show unsaved/saved state. |
| Sessions and timer | Empty/recent/history states; start/stop; all path/label selections; one-running-timer invariant; failed stop retry; stale poll; WebSocket update; reconnect/background/foreground; unauthorized expiry. | Verify server snapshot and visible timer state; include two-client event evidence if the selected test host can run it. |
| Logs | List/detail; create/edit/delete; labels; local timestamp display; empty/history; optimistic or busy state; conflict refresh/retry; failed mutation; unauthorized response. | Confirm persisted state and no lost draft after failed request. |
| Paths | List/detail; create/edit; merge; remove with undo; history groups; empty state; offline load; mutation failure; unauthorized response. | Verify undo, confirmation, path ownership, and server persistence after navigation. |
| Labels | List/create/edit/delete; trim/validation; duplicate/invalid values; color selection; hidden/everywhere scope; mutation failure; unauthorized response. | Ensure labeled controls and color are conveyed accessibly; verify selected state and saved server value. |
| Calendar | Month navigation; adjacent days; local timezone/DST; day note/portion; range selection; label assignment; draft retention; cache; concurrent/stale load; empty/failure/retry. | Freeze calendar/timezone/locale and verify both displayed date and API date key on simulator. |
| Reports | Default/preset/custom ranges; filters; aggregation; empty/dense result; chart/bucket boundaries; load/error/timeout; stale response; theme/contrast; locale formatting. | Validate accessible chart labels/alternatives and rendered controls; model tests alone do not establish chart usability. |

- [x] Complete every row above with automated/manual/deferred status and
  evidence link; identify untested rows by name.
- [ ] Verify create/edit/archive/restore persistence after navigation or relaunch
  where the domain supports those operations; distinguish server-backed from
  in-memory fixture assertions.
- [ ] Cover network failure, retry, offline recovery, empty state, server
  validation, conflict, timeout, and unauthorized response with user-visible
  recovery for each relevant screen.
- [ ] Exercise Dynamic Type at standard and largest accessibility sizes,
  VoiceOver labels/focus order, keyboard input where available, safe-area
  layout, rotation/supported device sizes, and light/dark appearances.
- [ ] Freeze locale, timezone/calendar, animation, and fixture timing; use
  condition-based waits and deterministic in-memory or isolated API fixtures
  instead of timing sleeps.
- [x] Keep mobile Chrome web acceptance separately at desktop and phone
  profiles; do not count a native iOS simulator result as mobile Chrome
  coverage. The evidence categories are separate in the run plan and inventory.

## Artifacts and privacy

- [x] Retain `.xcresult` for failures and successful release-gate runs according
  to the documented artifact policy.
- [x] Capture relevant screenshots and logs on failure with credentials,
  tokens, and personal data removed.
- [x] Use isolated disposable simulator accounts/data and document setup and
  cleanup without committing secrets.
  Default fixture UI tests require no account; the opt-in API case's disposable
  account policy and cleanup are documented in
  [`06-supported-validation.md`](06-supported-validation.md).
- [x] Distinguish manual evidence from automated CI in the test map and report
  exact host/runtime versions for each result.
- [x] Link the complete test inventory and a supported-host run before marking
  the milestone complete.
  The linked hosted run failed, so this evidence does not satisfy the remaining
  passing-suite and behavior-coverage requirements.
