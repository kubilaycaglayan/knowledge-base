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
| Board stale response | [`board.real-stack.acceptance.test.mjs`](../../frontend/scripts/board.real-stack.acceptance.test.mjs) has “does not let a delayed board response replace the newly selected board”; `stores/boards.test.ts` also covers stale list/board/Gantt responses. | Passed in the focused desktop and mobile-size Chromium board suites; see the same-commit [desktop](../runs/2026-10-08-6d29b9b-desktop-chromium-board-resilience.md) and [mobile](../runs/2026-10-08-6d29b9b-mobile-chromium-board-resilience.md) reports. |
| Board pagination retry | `stores/boards.test.ts` covers a failed lazy page remaining retryable and exposing recoverable error; `board.real-stack.acceptance.test.mjs` now injects a failed page request and verifies retry cursor, result identity, duplicates, and keyboard activation. | Passed in both Chromium profiles; see the same-commit reports linked above. |
| Note conflict/retry | [`line-history.real-stack.acceptance.test.mjs`](../../frontend/scripts/line-history.real-stack.acceptance.test.mjs) covers a draft through conflict and retry and a 503 followed by conflict/replay; `NotesView.test.ts` covers editor failure feedback. | The 2026-10-08 desktop and mobile-size Chromium line-history reports record the live 503/conflict/replay journey, preserved draft, and saved result. Screenshots are retained; this runner does not currently capture traces. |
| Timer transport fallback | [`timer-websocket.real-stack.acceptance.test.mjs`](../../frontend/scripts/timer-websocket.real-stack.acceptance.test.mjs) covers socket sync, HTTP polling when the socket is unavailable, and timer draft preservation/retry after a 503. | Verify explicit socket reconnection/network restoration where supported, and add an emulated iPhone WebKit profile report. Desktop and mobile Chromium timer retry runs are recorded; they do not cover WebKit. |
| Global search recovery | [`search.real-stack.acceptance.test.mjs`](../../frontend/scripts/search.real-stack.acceptance.test.mjs) injects a failed search request and asserts the query, alert, retry, and empty result state. | Desktop and mobile-size Chromium real-stack reports pass; WebKit and broader route/result races remain unverified. |
| Tracker responsive content | [`session-tracker.acceptance.test.mjs`](../../frontend/scripts/session-tracker.acceptance.test.mjs) now targets the current label-picker controls and checks long path/label handling, minimum targets, overflow, and Axe across phone, desktop, and ultra-wide widths in both themes. | The repaired fixture suite passes 10/10; screenshots and the six exploratory failure outputs are linked in the tracker repair report. This is isolated fixture evidence, not real-stack profile evidence. |
| Long content and small-screen layout | [`session-tracker.acceptance.test.mjs`](../../frontend/scripts/session-tracker.acceptance.test.mjs) contains long names, target, and accessibility checks across width/mode combinations; component tests cover long content in several views. | Capture complete desktop and 390×844 Chromium reports for the relevant browser suites; assert overflow, clipped controls, keyboard/touch recovery reachability, and actual mobile Chromium UA/engine identity. |
| Empty/failure states | View/store tests cover empty reports, empty notes, and multiple API failures/retry states. | Retain authenticated real-stack browser evidence for the selected empty/retry journeys in both Chromium profiles, including visible and accessible recovery. |

- [x] Confirm the current source has a real-stack delayed-board response case,
  store-level page retry coverage, real-stack note conflict retry, timer socket
  fallback, and tracker long-name viewport coverage.
- [x] Keep all unit and mocked-view cases labeled as lower-layer evidence;
  link each accepted browser journey to its exact run report and browser
  profile. The browser-profile evidence presently covers the board suite only;
  store and mocked-view rows remain lower-layer evidence.
- [x] Use the [local browser runbook](../local-browser-validation.md) to keep
  desktop Chromium, phone-sized Chromium emulation, and iPhone WebKit reports
  separate. The [desktop Chromium board report](../runs/2026-10-08-c415565-desktop-chromium-board-resilience.md)
  and [mobile-size Chromium board report](../runs/2026-10-08-6d29b9b-mobile-chromium-board-resilience.md)
  are separate. No fresh WebKit run is claimed for this milestone; emulated
  WebKit is not mobile Chrome evidence.
- [x] Verify live note save recovery in desktop and mobile-size Chromium: the
  user draft survives a retryable 503 and a concurrent server edit, then saves
  after conflict replay. See the [desktop](../runs/2026-10-08-f6abf77-desktop-chromium-line-history-resilience.md)
  and [mobile](../runs/2026-10-08-f6abf77-mobile-chromium-line-history-resilience.md)
  reports. The runner does not capture traces, so screenshots are the retained
  visual evidence for these passing runs.

## Failure investigation

- [x] Reconcile every row in the cumulative failure table against its dated
  reports and count case occurrences and suite occurrences consistently;
  include local transcripts with incomplete metadata as explicitly qualified
  evidence instead of silently omitting their failures. See the updated
  counts and evidence boundary in [`runs/README.md`](../runs/README.md).
- [x] For each historical signature, record reproduced, not reproduced, or
  insufficient evidence, with report/trace/log links and investigation date.
- [x] For every report with missing commit, profile, environment, or artifacts,
  leave those fields unknown and exclude it from profile pass/fail coverage.
  The incomplete board transcript remains excluded.
- [x] For reproduced failures, identify whether evidence supports product
  behavior, fixture setup, timing, browser engine, environment, or test
  synchronization as the cause. The reproduced archive overlap is tracked as a
  product-facing finding; the detached locator and menu state causes remain
  suspected pending further investigation.
- [x] Keep suspected causes labeled suspected until a minimal reproduction or
  trace establishes the cause.
- [x] Preserve a zero-count `Unclassified` row when no failures remain; never
  silently drop an unresolved signature.
- [x] Do not weaken a semantic assertion or add optional-locator guards to hide
  missing controls; change an assertion only with a documented contract reason.

## Resilience coverage

- [x] For notes, cards, paged board results, search, and timer fallback, inject
  a retryable request failure and assert the user's draft/input is preserved.
  Notes and cards now have real-stack failure/replay coverage; paged board
  results, search, and timer draft fallback have real-stack failure/retry
  cases. Search and timer are verified in desktop and mobile-size Chromium.
- [x] Assert retry uses current server state and does not duplicate a write or
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
- [x] Run mobile Chrome/Chromium phone emulation, desktop Chromium, and emulated
  iPhone WebKit as separately labeled profiles; record unsupported profiles.
  The emulated iPhone WebKit line-history report is separate and records both
  reproduced WebKit failures; no physical mobile device is claimed.

## Diagnostics and privacy

- [x] Capture Playwright trace, screenshot, browser console, and failed request
  details on failure; retain relevant API/proxy logs for real-stack failures.
- [x] Confirm artifact paths are ignored locally or retained in CI storage with
  a stated expiry and are linked from the report. The 2026-10-08 capture runs
  use `harden-tests/local-artifacts/`, covered by the root `.gitignore`, with
  a 2026-10-15 removal date in each report.
- [ ] Scrub credentials, authorization headers, cookies, personal content, and
  account identifiers from reports and artifacts before sharing or committing.
- [x] Link focused reproduction and full-suite results for both desktop and
  mobile browser profiles; record remaining product defects outside this
  test-only milestone with an issue/reference. See the
  [follow-up register](../follow-up-defects.md).
- [x] Update cumulative counts only from actual run outputs and document the
  exact reports included in each count.
