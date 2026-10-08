# HARD-02 acceptance checklist: browser resilience and triage

Use this checklist with [HARD-02](02-browser-resilience.md). Every failure
disposition must cite observed evidence; a green rerun alone does not explain a
previous failure.

## Failure investigation

- [ ] Reconcile every row in the cumulative failure table against its dated
  reports and count case occurrences and suite occurrences consistently.
- [ ] For each historical signature, record reproduced, not reproduced, or
  insufficient evidence, with report/trace/log links and investigation date.
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
