# Knowledge Base multi-board acceptance criteria

This is the board-specific acceptance contract. The existing root
`ACCEPTANCE_CRITERIA.md` remains the regression checklist for earlier work.
Items are implemented and checked one slice at a time; unchecked items must
not be described as complete.

## 1. Authentication, navigation, and route state

- [ ] `/board` requires authentication and sign-out clears board state.
- [x] Board navigation appears after Sessions and does not change Sessions.
- [x] `board` and `view` query parameters survive reload and browser
  Back/Forward navigation.
- [ ] Invalid or archived board IDs recover to a valid board or an explicit
  empty state without stale cards.

## 2. Board lifecycle

- [x] Users can create named boards with trimmed, validated names.
- [x] New boards seed Backlog, Pending, In Progress, and Done in order.
- [x] Users can switch boards without displaying cards from the previous board.
- [x] Users can archive and restore boards; archived boards are excluded from
  active selection and cannot receive writes.
- [ ] Duplicate submits, stale responses, and network retries are idempotent.

## 3. Status lifecycle

- [x] Statuses can be created, renamed, reordered through the API, archived,
  and restored.
- [x] Archiving reassigns active cards and cannot archive the final active
  status.
- [ ] The UI exposes status rename, reorder, archive, restore, and keyboard
  alternatives with recovery feedback.

## 4. Cards and editor

- [x] Cards support blank titles, Tiptap-compatible body JSON, four priorities,
  optional inclusive dates, multiple paths, and `BOARD` labels at the API.
- [x] Cards can be created and edited from the web UI.
- [ ] The editor exposes paths and `BOARD` labels, validates date ranges
  inline, warns about unsaved changes, and restores focus on close.
- [ ] Long titles/bodies remain usable and failed saves can be retried safely.

## 5. Kanban movement and ordering

- [x] Active cards render in their board-owned status columns.
- [ ] Pointer/touch drag and drop moves cards between columns and persists
  ordering.
- [ ] Keyboard movement provides an equivalent accessible action.
- [x] Optimistic movement rolls back after a failed request and archived
  statuses reject drops.
- [ ] Rapid movement requests reconcile stale responses deterministically.

## 6. Archive and restore

- [x] Cards can be archived and remain permanently retained.
- [ ] The board exposes archived-card filtering, counts, and restore with the
  previous-status fallback when the original status is archived.
- [ ] Archive and restore actions are idempotent and confirm destructive work
  or provide undo.

## 7. Pagination and dense boards

- [ ] Card lists paginate by status with an initial page size of 20.
- [ ] Empty, 1–20, exactly-20, and 21+ card columns are covered.
- [ ] Duplicate boundary requests, stale board responses, failed-page retry,
  and dense-column rendering are covered by tests.

## 8. Gantt timeline

- [ ] Gantt shows the same active Kanban cards that have at least one date.
- [ ] Each card renders as a bar spanning its inclusive date range; a single
  date renders as a one-day bar.
- [ ] The default window is 14 days and can be changed with URL date state.
- [ ] Month/year boundaries, leap days, and daylight-saving transitions use
  date-only arithmetic and do not shift bars by timezone.
- [ ] No-date cards are omitted with a clear empty-state explanation.
- [ ] Archived cards and archived statuses are excluded; mobile uses
  intentional horizontal scrolling.

## 9. Ownership, errors, and concurrency

- [x] Board, status, card, path, and label references are user-scoped.
- [ ] 401, 404, 409, offline, failed mutation, retry, stale read, and
  concurrent-tab states have explicit UI behavior.

## 10. Accessibility and regression verification

- [x] Native controls, visible focus, accessible names, mobile-sized targets,
  contrast-aware theme tokens, and reduced-motion styles are present.
- [ ] Axe/Playwright verifies mobile and desktop Kanban/Gantt states.
- [ ] Existing Sessions, Paths, Labels, Notes, Calendar, Reports, import,
  extension, security, and accessibility checks remain green.

## Do not delete the following. Implement the following.
## 11. Views and UI
- [] Prefer no texts, no explanations, no titles unless it is the necessary.
- [] Be compact whenever possible, smaller margins and paddings, but still within the standards. Example: archived listings.
- [] Do not show JSON objects "{}" in the UI.
- [] Prefer icon buttons over text buttons.
- [] Prefer icon buttons over text buttons.
- [] Cover error management with proper error messages.
- [] Different boards can be tabs under the Board page.
- [] To add a board, we should use a plus button.
- [] Kanban/Gantt selection is closer to the card's view: top right.
- [] Prefer icon buttons over text buttons.
- [] Archive buttons should be at the end of the page end should take to a different page.
- [] Error messages should disappear afer a proper action or should have close sign.
- [] Date selection: users should be able to select a range within a calendar view.
- [] Users can add cards by selecting a range on/in the kanban view by selecting a range in the kanban.
- [] Cards shouldn't disappear, wtf?
- [] Load more cards button shouldn't exist, why do we need it? We should lazy load the cards if more than 20.
- [] Cards shouldn't disappear, wtf?
- [] Instead of rename button, clicking on the names should make them editable. Apply all the board infrastructure.

## 12. Testing
- [] Use uncommon ports that are not in use in the test configuration, whenever needed.
