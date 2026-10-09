# OTOTEST-03 — Web routes and interactive controls

**Priority:** High  
**Status:** Proposed  
**Dependencies:** OTOTEST-01

## Goal

Map every supported web route and meaningful interactive control to a test
that proves its expected outcome, including important loading, empty, error,
and recovery states.

## Tasks

- [ ] Create one route matrix from `frontend/src/main.ts`; include redirects,
  deep links, query state, and dialogs opened from record-specific URLs.
- [ ] Mark route behavior as covered by view test, navigation test, fixture
  browser test, real-stack browser test, or gap.
- [ ] Create action inventories for Sessions/timer, Paths, Timeline, Logs,
  Reports, Calendar, Imports, Settings, Labels, Boards/archive, and Notes.
- [ ] For each action, identify its visible label/accessibility name, action
  target, resulting state/navigation/request, and linked test name.
- [ ] Add assertions for any uncovered high-value action. Ensure the test fails
  when the control is absent; do not guard required assertions with optional
  locator counts.
- [ ] Cover keyboard operation and URL/history behavior for navigation and
  stateful interactions where applicable.
- [ ] Review every dialog/menu flow for open, submit/cancel, validation,
  destructive confirmation/undo, focus handling, and request failure recovery.
- [x] Classify `DevelopmentView.vue` as temporary direct-only tooling and
  exclude its demo behavior from product coverage. Remove the authenticated
  navbar link and keep the shell navigation assertion free of `/development`.
- [ ] Keep responsive/accessibility checks distinct from behavior coverage;
  link existing checks where they prove the criterion.

## Task workflow by route subtree

- Shared shell/auth: prove login/register mode switch, password visibility,
  auth error/retry, safe redirect, logout, navigation links, page title,
  theme toggle, global search, floating timer visibility, and signed-out
  direct-link behavior.
- Sessions: list/detail, pagination, create/edit/delete/start-again, timer
  start/pause/resume/finish/stop/cancel, reconnect, and duplicate/concurrent
  action feedback.
- Paths: create/edit/color/pin/hide/reorder/history/merge/remove/undo and
  Path-linked board behavior.
- Timeline and Logs: filter/date input, search open/close, create/edit/delete,
  time formatting, related-record links, label assignment, paging and retry.
- Reports and Calendar: date/query state, Back/Forward, charts and linked
  records; month navigation, month/year picker, day/range selection, notes,
  label color/portion CRUD and save/error states.
- Imports and Settings: source tabs, paste/file input, import submit/result,
  history pagination/undo; account/password, theme, import/export and
  persisted preferences.
- Labels: search/create/edit/scopes/remove, history trail/back/related items,
  retry and deep-link behavior.
- Boards and archive: board selection/manage/order/pin/visibility; Kanban and
  Gantt switches; card/status creation/edit/sort/move/transfer/archive/restore;
  cursor retry; date range, resize/move gestures, unscheduled date selection,
  archive return context.
- Notes: search/archive filter/create/detail, rich text/task toolbar, labels,
  pin/order drag, archive/restore/delete and unsaved navigation recovery.
- Development: `/development` remains directly addressable as temporary
  tooling, but exclude it from product journey coverage and authenticated
  navbar; assert no navbar link points to it.

For each family create a control row with: route, component, accessible name,
input method (click/key/touch/drag), starting state, action, expected visible
result, URL/API/persistence result, negative/recovery case, exact test name,
and evidence class. For movable items, assert final order/position after
reload and provide keyboard/tap alternative where the product supports it.

## Priority order

1. Actions that create, edit, delete, archive, restore, merge, transfer, or
   otherwise mutate user data.
2. Navigation, deep links, ownership-sensitive detail views, and timer actions.
3. Search, filters, sorting, pagination, saved preferences, and date/range
   selection.
4. Error, offline, timeout, conflict, and recovery controls.
5. Accessibility and responsive interaction checks for supported screens.

## Acceptance

- Every supported route has a test reference or an explicit exclusion.
- Every meaningful visible action has an outcome assertion or a reason it is
  covered by a shared control test.
- Destructive and persistence-sensitive flows assert confirmation/recovery
  and resulting state.
- At least one assertion per journey proves URL/deep-link state when the URL
  is part of the behavior.
- The relevant Vitest suites and browser acceptance suites pass, with evidence
  linked by test name and CI job/run record.
- Every supported path has direct-load, refresh, signed-out and invalid/missing
  resource expectations; redirects, query filters and history restoration are
  asserted where they are part of behavior.
- Each page's primary actions and mutation controls have visible-result
  assertions; delete/archive/merge/undo/restore tests assert final data state.
- Drag/pointer actions assert the persisted destination/order and cover cancel,
  lost pointer capture, disabled/loading state, and keyboard/touch alternative
  when applicable.
- Dialogs and menus cover open, focus entry, validation, submit, cancel, Escape,
  focus return, request failure/retry and unsaved-change handling as applicable.
- Fixtures/mocks are labeled as such; a real-stack assertion proves matching
  API persistence after reload for selected high-value mutations.
