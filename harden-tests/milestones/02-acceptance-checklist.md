# HARD-02 acceptance checklist: browser resilience and triage

Use this checklist with [HARD-02](02-browser-resilience.md). Every failure
disposition must cite observed evidence; a green rerun alone does not explain a
previous failure.

## Existing coverage and evidence boundary

This is a source inventory only. Unit/fixture tests do not count as real-stack
browser acceptance, and a browser profile passes only when a dated run report
records that engine/profile and its outcomes.

| Behavior | Current source evidence | Remaining HARD-02 evidence |
| --- | --- | --- |
| Board stale response | [`board.real-stack.acceptance.test.mjs`](../../frontend/scripts/board.real-stack.acceptance.test.mjs) has “does not let a delayed board response replace the newly selected board”; `stores/boards.test.ts` also covers stale list/board/Gantt responses. | Repeat under desktop Chromium and mobile-size Chromium with traces on failure; preserve selected board and assert no stale card/status content renders. |
| Board pagination retry | `stores/boards.test.ts` covers a failed lazy page remaining retryable and exposing recoverable error; real-stack board tests cover loading past the first page. | Add a browser-level failed page request, retry action, current cursor/result assertion, and duplicate/missing-card check in each supported Chromium profile. |
| Note conflict/retry | [`line-history.real-stack.acceptance.test.mjs`](../../frontend/scripts/line-history.real-stack.acceptance.test.mjs) covers a draft through conflict and retry; `NotesView.test.ts` covers editor failure feedback. | Verify live server conflict/retry and saved line-history in desktop and mobile Chromium; retain screenshot/trace and assert the user draft is preserved. |
| Timer transport fallback | [`timer-websocket.real-stack.acceptance.test.mjs`](../../frontend/scripts/timer-websocket.real-stack.acceptance.test.mjs) covers socket sync and HTTP polling when the socket is unavailable. | Add explicit reconnection/network-restoration behavior where supported; run and report mobile Chromium separately from desktop and WebKit. |
| Long content and small-screen layout | [`session-tracker.acceptance.test.mjs`](../../frontend/scripts/session-tracker.acceptance.test.mjs) contains long names, target, and accessibility checks across width/mode combinations; component tests cover long content in several views. | Capture complete desktop and 390×844 Chromium reports for the relevant browser suites; assert overflow, clipped controls, keyboard/touch recovery reachability, and actual mobile Chromium UA/engine identity. |
| Empty/failure states | View/store tests cover empty reports, empty notes, and multiple API failures/retry states. | Retain authenticated real-stack browser evidence for the selected empty/retry journeys in both Chromium profiles, including visible and accessible recovery. |

- [x] Confirm the current source has a real-stack delayed-board response case,
  store-level page retry coverage, real-stack note conflict retry, timer socket
  fallback, and tracker long-name viewport coverage.
- [x] Keep all unit and mocked-view cases labeled as lower-layer evidence;
  link each accepted browser journey to its exact run report and browser
  profile. The browser-profile evidence presently covers the board suite only;
  store and mocked-view rows remain lower-layer evidence.
- [ ] Use the [local browser runbook](../local-browser-validation.md) to keep
  desktop Chromium, phone-sized Chromium emulation, and iPhone WebKit reports
  separate. The [desktop Chromium board report](../runs/2026-10-08-63cf4f3-desktop-chromium-board-resilience.md)
  and [mobile-size Chromium board report](../runs/2026-10-08-63cf4f3-mobile-chromium-board-resilience.md)
  are separate; an emulated WebKit pass does not establish mobile Chrome
  behavior, and no fresh WebKit run is recorded for this milestone.

## Failure investigation

- [x] Reconcile every row in the cumulative failure table against its dated
  reports and count case occurrences and suite occurrences consistently;
  include local transcripts with incomplete metadata as explicitly qualified
  evidence instead of silently omitting their failures. See the updated
  counts and evidence boundary in [`runs/README.md`](../runs/README.md).
- [ ] For each historical signature, record reproduced, not reproduced, or
  insufficient evidence, with report/trace/log links and investigation date.
- [x] For every report with missing commit, profile, environment, or artifacts,
  leave those fields unknown and exclude it from profile pass/fail coverage.
  The incomplete board transcript remains excluded.
- [ ] For reproduced failures, identify whether evidence supports product
  behavior, fixture setup, timing, browser engine, environment, or test
  synchronization as the cause.
- [ ] Keep suspected causes labeled suspected until a minimal reproduction or
  trace establishes the cause.
- [ ] Preserve a zero-count `Unclassified` row when no failures remain; never
  silently drop an unresolved signature.
- [ ] Do not weaken a semantic assertion or add optional-locator guards to hide
  missing controls; change an assertion only with a documented contract reason.

## Resilience coverage

- [ ] For notes, cards, paged board results, search, and timer fallback, inject
  a retryable request failure and assert the user's draft/input is preserved.
- [ ] Assert retry uses current server state and does not duplicate a write or
  resurrect data that has since changed or been deleted.
- [ ] Assert failure, loading, success, and retry feedback is visible and
  exposed through the expected accessible name/live announcement.
- [ ] Cover empty and sparse accounts with explicit empty-state text and a
  keyboard-operable next action.
- [ ] Cover very long titles, snippets, labels, note bodies, and card bodies;
  assert content remains reachable and does not create unintended horizontal
  overflow at desktop and phone widths.
- [ ] Delay responses while switching routes, selected entities, boards, or
  pages; assert stale data never replaces the latest selection.
- [ ] For each asynchronous race, state the expected winner and synchronization
  signal; avoid fixed sleeps as the only ordering guarantee.
- [ ] Cover offline/connection loss and recovery where the app exposes a
  retry/reconnect path; assert recovery does not require a full reload unless
  that is the documented behavior.
- [ ] Verify keyboard navigation reaches error recovery and retry actions in
  mobile and desktop browser layouts.
- [ ] Run mobile Chrome/Chromium phone emulation, desktop Chromium, and emulated
  iPhone WebKit as separately labeled profiles; record unsupported profiles.

## Diagnostics and privacy

- [ ] Capture Playwright trace, screenshot, browser console, and failed request
  details on failure; retain relevant API/proxy logs for real-stack failures.
- [ ] Confirm artifact paths are ignored locally or retained in CI storage with
  a stated expiry and are linked from the report.
- [ ] Scrub credentials, authorization headers, cookies, personal content, and
  account identifiers from reports and artifacts before sharing or committing.
- [ ] Link focused reproduction and full-suite results for both desktop and
  mobile browser profiles; record remaining product defects outside this
  test-only milestone with an issue/reference.
- [ ] Update cumulative counts only from actual run outputs and document the
  exact reports included in each count.
