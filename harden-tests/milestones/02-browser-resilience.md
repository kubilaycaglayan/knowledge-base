# HARD-02: Browser failure states and flake triage

**Priority:** High  
**Status:** In progress  
**Scope:** Test coverage, diagnostics, and run documentation only.

Track completion in the [HARD-02 acceptance checklist](02-acceptance-checklist.md).

## Why this milestone exists

The current browser plan calls for broader empty, long-content, delayed-response,
network-failure, and retry coverage. Run reports also show unresolved repeated
failures in session-tracker fixtures, archive-footer reachability, WebKit timer
requests, line-history caret placement, and board locators. These need evidence
and root-cause classification before assertions are changed.

## Tasks

- [ ] Revisit every unresolved row in `harden-tests/runs/README.md`; inspect
  full output, screenshots, traces, DOM snapshots, browser console, request
  logs, and server logs where available. For each signature, mark reproduced,
  not reproduced, or insufficient evidence and state why.
- [ ] Reconcile incomplete local transcripts as well as the six complete run
  reports; the 2026-10-08 board attempt has three failures but cannot be used
  as browser-profile coverage because commit/profile/environment metadata is
  absent.
- [ ] For reproducible failures, create a minimal focused reproduction and
  identify whether the cause is application behavior, fixture setup, timing,
  browser-engine behavior, or test synchronization. Do not weaken assertions
  merely to make the run green.
- [ ] Retain Playwright traces on failure and attach links to CI/local ignored
  artifacts in per-profile reports; ensure artifact capture cannot include
  credentials or personal data.
- [ ] Expand representative retryable network failure coverage to notes,
  cards, paged board results, search, and timer fallback: preserve user drafts,
  show the correct accessible feedback, retry against current server state,
  and avoid applying stale responses.
- [ ] Add explicit empty-state cases for sparse accounts and long-content cases
  for titles, snippets, labels, notes, and cards; check wrapping/overflow at
  desktop and phone widths and test keyboard access to recovery actions.
- [ ] Add deterministic delayed-response cases on route changes or entity
  switches for any stores/views not already covered. Define the expected winner
  of the race and assert stale data cannot replace the current selection.
- [ ] Update the cumulative failure table only with observed occurrences;
  keep unconfirmed causes labeled suspected and preserve an Unclassified row.

## Acceptance evidence

- Each historical unresolved failure has a disposition and supporting artifact
  or a clear statement of missing evidence.
- Repeated signatures are grouped by demonstrated root cause, with affected
  cases and suite counts reconciled against individual reports.
- Focused and full browser runs pass separately in desktop Chromium and
  mobile-size Chromium emulation, or remaining product defects are explicitly
  tracked outside this test-only milestone. Emulated iPhone WebKit is an
  additional engine/profile report and cannot substitute for either Chromium
  profile.
- Retry, empty, long-content, delayed-response, and network-error states have
  assertions for both content and accessible interaction.

## Relevant sources

- `harden-tests/runs/README.md` and all linked dated run reports
- `frontend/scripts/board.real-stack.acceptance.test.mjs`
- `frontend/scripts/timer-websocket.real-stack.acceptance.test.mjs`
- `frontend/scripts/line-history.real-stack.acceptance.test.mjs`
- `frontend/scripts/session-tracker.acceptance.test.mjs` (locate via `rg --files`)
- `docs/testing.md`

## Current progress

- The 2026-10-08 desktop Chromium and mobile-size Chromium board runs exercise
  the failed-page retry journey. The retry preserved the current cursor,
  loaded the expected card once, and was keyboard operable. Capture-enabled
  same-commit follow-up runs retain local failure artifacts and exact image
  IDs; see the [desktop report](../runs/2026-10-08-6d29b9b-desktop-chromium-board-resilience.md)
  and [mobile report](../runs/2026-10-08-6d29b9b-mobile-chromium-board-resilience.md).
- Both profiles still have observed board failures. The desktop archive footer
  is covered by the dashboard shell. The mobile run also observed a detached
  Gantt card locator, an unavailable More boards control during view switching,
  and the floating timer covering archive navigation/footer controls. These
  remain test-only milestone blockers; product changes belong in the bug-fix
  workflow.
- Historical investigations and reconciled counts are recorded in the [run
  index](../runs/README.md). Earlier traces, screenshots, and raw transcripts
  were not retained, so those cases remain insufficient evidence for historical
  root-cause claims.
- Reproduced product-facing failures are tracked separately in the [HARD-02
  follow-up register](../follow-up-defects.md); no product fix was included in
  this test-only milestone.
