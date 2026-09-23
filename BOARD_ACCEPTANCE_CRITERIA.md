# Knowledge Base multi-board acceptance criteria

This is the current implementation contract for the `/board` feature. Work
must proceed one vertical slice at a time: add a failing test, implement the
smallest complete behavior, run focused and regression checks, then commit.
Unchecked items are intentionally incomplete.

## A. Authentication, navigation, and URL state

- [x] Unauthenticated `/board` requests show the existing sign-in surface and
  never expose board data.
- [x] Sign-out clears selected board, cards, statuses, archive data, and URL
  state.
- [x] Board navigation appears immediately after Sessions.
- [x] `board`, `view`, `from`, and `to` survive reload and Back/Forward.
- [x] Invalid or missing board IDs resolve to the available board without
  stale cards; browser coverage verifies the URL is canonicalized.
- [x] Archived board IDs with no active boards show an explicit empty state
  without stale cards.

## B. Board lifecycle

- [x] Create, trim, validate, rename, switch, archive, and restore named
  boards.
- [x] New boards seed Backlog, Pending, In Progress, and Done in order.
- [x] Add-board exposes a compact, accessible plus action and duplicate board
  submits are guarded.
- [x] Board-list, board-content, Gantt, pagination, and rapid-move store
  requests reject stale responses with revision checks.
- [x] Card edit responses use per-card revisions so stale saves cannot
  overwrite Kanban or Gantt state.
- [x] Store-level concurrent board loads and writes reject stale responses
  deterministically.
- [x] Concurrent board loads and writes are covered end to end, including a
  delayed real-stack board response that cannot replace the newly selected board.
- [x] Gantt responses are revision-checked so an older board/window cannot
  overwrite the current timeline.
- [x] Archived boards reject mutations, remain permanently retained, and can be
  restored; authenticated integration coverage verifies this lifecycle.

## C. Status lifecycle

- [x] Create, rename, archive, restore, and API reorder statuses.
- [x] Status archive reassigns active cards and protects the final active
  status.
- [x] UI reorder, inline name editing, keyboard reorder actions, and archived
  status restore are covered; safeguards, 404/409 errors, and retry behavior
  remain.

## D. Cards and editor

- [x] Cards allow blank titles, empty Tiptap-compatible bodies, four priorities,
  optional single dates or inclusive date ranges.
- [x] Each card supports multiple owned paths; path ownership and color
  inheritance are enforced and tested.
- [x] Cards support reusable `BOARD` labels without changing existing scopes.
- [x] The editor uses the existing Tiptap UI and does not display raw `{}` JSON;
  long-content handling and focus restoration remain.
- [x] Native date calendar controls reject reversed card ranges inline and
  preserve the editor without sending an invalid save.
- [x] Duplicate card saves are coalesced and show a Saving… state; unsaved
  changes remain protected.
- [x] HTTP 409 card-save conflicts keep the editor open, show a retry message,
  and allow a successful retry.
- [x] Other failed card saves keep the editor open, preserve the draft, and
  allow a successful retry in browser acceptance coverage.
- [x] API abort timeouts leave the current card intact in store tests.
- [x] Timeout-specific editor feedback and retry are covered end to end.

## E. Kanban behavior

- [x] Active cards render in their board-owned active status columns.
- [x] Kanban and Gantt are views of the same cards, not separate card sets.
- [x] Pointer drag, touch tap, and keyboard Enter movement alternatives are
  covered for card status movement.
- [x] Optimistic movement rolls back after failure and archived-status drops
  are rejected.
- [x] Rapid card moves use per-card revisions so stale responses cannot
  overwrite newer Kanban/Gantt positions.
- [x] Store movement rejects archived/unknown destinations and negative
  positions before optimistic mutation or network I/O.
- [x] Backend/API ordering, browser pointer movement, and dense-column page
  reconciliation are covered; invalid-destination behavior is covered in the
  store contract.
- [x] Position ordering, invalid drops, and dense-column reconciliation are
  covered end to end.
- [x] An integrated browser flow keeps one card visible through create, move,
  edit, archive, restore, and the Kanban/Gantt view switch.

## F. Archive and restore

- [x] Archived cards remain permanently retained and are excluded from active
  Kanban/Gantt results.
- [x] Archived-card view provides filtering and restore with fallback to an
  active status when the previous status is archived; counts remain.
- [x] API archive/restore is idempotent; repeated requests preserve the same
  retained board state.
- [x] Destructive board and card archival provide accessible confirmation
  dialogs; cancellation sends no request.

## G. Pagination and resilience

- [x] Each status loads an initial page of 20 cards and lazy-loads later pages.
- [x] API tests cover 0, 1, exactly 20, and 21-card page boundaries with
  stable cursor/null-cursor assertions.
- [x] Duplicate boundary requests are coalesced, stale lazy-page responses
  cannot append cards after a board switch, and failed-page retry is covered
  at the store level.
- [x] Failed lazy-page retry is covered end to end without losing the initial
  page.
- [x] Duplicate boundary requests and stale board responses are covered end to
  end.
- [x] Offline board load, unauthenticated `401`, invalid-board `404`, card
  conflict `409`, failed-page retry, and recoverable mutation feedback are
  covered across browser/store tests.
- [x] Timeout-specific visible editor feedback is covered end to end.
- [x] Gantt load failures set a visible, dismissible retry message and clear
  stale timeline cards.
- [x] Concurrent tabs do not overwrite newer card state: stale writes receive
  `409`, refresh the latest card, and preserve the second tab’s draft for retry.

## H. Gantt timeline

- [x] Gantt is a view switch for existing active Kanban cards.
- [x] Cards with a single date or inclusive date range render as timeline bars.
- [x] The default window is 14 days and date state is URL-addressable.
- [x] Month/year boundaries, leap days, and daylight-saving transitions use
  date-only arithmetic.
- [x] Cards without dates are omitted with a clear explanation.
- [x] Editing a timeline card to an out-of-window date immediately removes its
  bar while retaining the same card in Kanban.
- [x] Moving, archiving, restoring, and creating a dated card while viewing
  Gantt immediately reconciles with Kanban in the store contract tests.
- [x] Moving, archiving, and restoring a dated card across the Gantt/Kanban
  view switch is covered end to end.
- [x] Creating a dated card in Kanban and immediately seeing it in Gantt is
  covered end to end.
- [x] Archived statuses/cards and out-of-window cards are excluded correctly
  by the API and shared Gantt reconciliation.
- [x] Mobile timeline scrolling is intentional; desktop layout is supported.

## I. Paths, labels, and ownership

- [x] Every board, status, card, path, and label reference is scoped to the
  authenticated user and selected board.
- [x] A card’s single active path inherits its color.
- [x] Archived paths and deleted BOARD labels do not leak into the board
  editor or card controls.
- [x] Foreign board/card/status references return the documented not-found
  response in API tests; path and label ownership validation is covered.
- [x] Foreign path and label IDs are rejected before card persistence in API
  tests.
- [x] Cross-user and cross-board IDs are covered across every board, status, and
  card mutation route.
- [x] Adding `BOARD` labels does not alter existing label scopes.

## J. Accessibility and regression

- [x] Native controls, visible focus, names, mobile-sized targets, contrast,
  reduced motion, and intentional overflow are present.
- [x] Axe covers mobile and desktop Kanban layouts.
- [x] Axe covers mobile and desktop Kanban and Gantt states.
- [x] Existing authentication, Sessions/timer, Paths, Labels, Notes, Calendar,
  Reports, imports/exports, extension, and security checks remain green.
- [ ] iOS package/build and UI checks remain pending because the Linux
  environment has no Xcode toolchain; run the documented macOS checks before
  release.
- [x] Disposable mobile Kanban and Gantt screenshots are captured without
  repository artifacts or secrets.

## K. Test and delivery gates

- [x] Isolated fixture-based board browser tests exist.
- [x] Disposable Compose real-stack harness exists and cleans only its own
  project resources.
- [x] Real-stack Playwright smoke scenarios pass with Chromium and Axe
  (board switching, dated-card Gantt rendering, and mobile Axe audit).
- [x] Board backend unit/integration, frontend unit/component, real-stack E2E,
  full-stack smoke, build, accessibility, and security checks are documented
  and green.
- [x] API, architecture, testing, roadmap, smoke, and import/export documents
  reflect the final board behavior.

## Traceability convention

Tests should reference criteria by section and behavior in their test names or
nearby comments. Keep this file updated in the same commit as the behavior it
describes; do not mark an item complete from an indirect or partial check.
