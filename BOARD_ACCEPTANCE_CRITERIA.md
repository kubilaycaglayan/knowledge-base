# Knowledge Base multi-board acceptance criteria

This is the current implementation contract for the `/board` feature. Work
must proceed one vertical slice at a time: add a failing test, implement the
smallest complete behavior, run focused and regression checks, then commit.
Unchecked items are intentionally incomplete.

## A. Authentication, navigation, and URL state

- [ ] Unauthenticated `/board` requests redirect or return the existing auth
  response and never expose board data.
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
- [ ] Concurrent board loads and writes reject stale responses deterministically.
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
- [x] Each card supports exactly one path; path ownership and color inheritance
  are enforced and tested.
- [x] Cards support reusable `BOARD` labels without changing existing scopes.
- [x] The editor uses the existing Tiptap UI and does not display raw `{}` JSON;
  long-content handling and focus restoration remain.
- [x] Native date calendar controls reject reversed card ranges inline and
  preserve the editor without sending an invalid save.
- [x] Duplicate card saves are coalesced and show a Saving… state; unsaved
  changes remain protected.
- [ ] Failed saves, conflict recovery, and retry behavior are covered.

## E. Kanban behavior

- [x] Active cards render in their board-owned active status columns.
- [x] Kanban and Gantt are views of the same cards, not separate card sets.
- [x] Pointer drag, touch tap, and keyboard Enter movement alternatives are
  covered for card status movement.
- [x] Optimistic movement rolls back after failure and archived-status drops
  are rejected.
- [ ] Position ordering, rapid moves, stale writes, invalid drops, and dense
  columns reconcile deterministically.
- [ ] Cards never silently disappear after create, move, edit, archive, or
  restore.

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
- [ ] Duplicate boundary requests, stale board responses, and failed-page
  retry are covered end to end.
- [ ] Offline, 401, 404, 409, timeout, and recoverable mutation states have
  visible, dismissible feedback.
- [x] Gantt load failures set a visible, dismissible retry message and clear
  stale timeline cards.
- [ ] Concurrent tabs do not overwrite newer board/card state with stale data.

## H. Gantt timeline

- [x] Gantt is a view switch for existing active Kanban cards.
- [x] Cards with a single date or inclusive date range render as timeline bars.
- [x] The default window is 14 days and date state is URL-addressable.
- [x] Month/year boundaries, leap days, and daylight-saving transitions use
  date-only arithmetic.
- [x] Cards without dates are omitted with a clear explanation.
- [ ] Editing, moving, archiving, restoring, and creating a dated card while
  viewing Gantt immediately reconciles with the Kanban card.
- [ ] Archived statuses/cards and out-of-window cards are excluded correctly.
- [x] Mobile timeline scrolling is intentional; desktop layout is supported.

## I. Paths, labels, and ownership

- [x] Every board, status, card, path, and label reference is scoped to the
  authenticated user and selected board.
- [x] A card’s single active path inherits its color.
- [ ] Archived paths and deleted labels do not leak into board UI.
- [ ] Cross-user and cross-board IDs consistently return the documented error.
- [x] Adding `BOARD` labels does not alter existing label scopes.

## J. Accessibility and regression

- [x] Native controls, visible focus, names, mobile-sized targets, contrast,
  reduced motion, and intentional overflow are present.
- [ ] Axe covers mobile and desktop Kanban and Gantt states.
- [ ] Existing authentication, Sessions/timer, Paths, Labels, Notes, Calendar,
  Reports, imports/exports, extension, security, and iOS checks remain green.
- [ ] Key mobile and desktop screenshots are captured without secrets.

## K. Test and delivery gates

- [x] Isolated fixture-based board browser tests exist.
- [x] Disposable Compose real-stack harness exists and cleans only its own
  project resources.
- [x] Real-stack Playwright smoke scenarios pass with Chromium and Axe
  (board switching, dated-card Gantt rendering, and mobile Axe audit).
- [ ] Backend unit/integration, frontend unit/component, E2E, smoke, build,
  accessibility, and security checks are documented and green.
- [ ] API, architecture, testing, roadmap, smoke, and import/export documents
  reflect the final behavior.

## Traceability convention

Tests should reference criteria by section and behavior in their test names or
nearby comments. Keep this file updated in the same commit as the behavior it
describes; do not mark an item complete from an indirect or partial check.
