# OTOTEST-01 — Product acceptance checklist

This checklist expands [OTOTEST-01 — Coverage inventories](01-coverage-inventories.md)
into the product behaviors and surfaces that its inventory must account for.
It is a documentation acceptance checklist: inspect product source and
classify existing evidence, but do not execute test suites, create product
records, or perform real-stack acceptance journeys under this milestone. Those
execution activities belong to later #ototest milestones.

**Status:** In progress
**Scope:** Knowledge Base web app in desktop and mobile Chrome; Chrome extension
surfaces where the extension is supported  
**Excluded:** Native iOS application and iOS-only flows  
**Source baseline:** Router, Vue views/components, API controllers, extension
manifest/entrypoints and existing product tree in the current worktree.

## Completion rules

These items require inventory rows and links to current source/evidence. The
imperative examples below describe the behavior to map; they are not steps to
execute against the running application during OTOTEST-01.

- [x] **AC-01** Each inventory row identifies the product surface and the
  source location that defines its behavior.
- [x] **AC-02** Each row classifies evidence as unit/component, service/API,
  real browser, manual, unsupported, or gap. Existing test names are linked
  only when their assertions establish the stated behavior.
- [x] **AC-03** Each actionable row records the control or user action, expected
  result, visible feedback/recovery, and keyboard or touch interaction when
  applicable.
- [x] **AC-04** Each route or flow records applicable loading, empty, invalid
  input, failed request, retry/cancel, missing resource, and ownership behavior.
- [x] **AC-05** The inventory distinguishes desktop Chrome from mobile Chrome
  where viewport, pointer type, browser history, text entry, or popup behavior
  changes the user journey.
- [x] **AC-06** Coverage gaps and unresolved support decisions are explicit;
  a component or test filename similarity alone is not evidence.
- [x] **AC-07** The inventory records source revision, review date, reviewer,
  and the exact command/workflow associated with any named automated evidence.
- [x] **AC-08** Existing evidence is classified without running tests as part of
  this milestone's checklist authoring. Execution belongs to a later acceptance
  or release review.

## Web application: routes and shared shell

Source of route registration: `frontend/src/main.ts`. Shared authenticated
shell and responsive navigation: `frontend/src/App.vue`.

- [x] **WEB-01** Inventory `/` as the Sessions workspace and `/sessions` as a
  redirect to `/`; record resulting URL and browser Back behavior.
- [x] **WEB-02** Inventory `/sessions/:id` as a session detail/edit deep link,
  including unknown, deleted, and another user's ID outcomes.
- [x] **WEB-03** Inventory `/paths` and `/paths/:id`, including direct-load
  history/detail state, invalid IDs, and related-record navigation.
- [x] **WEB-04** Inventory `/timeline`, including supported filter fields,
  submission/reset actions, URL state if present, empty results, and stale or
  failed loads.
- [x] **WEB-05** Inventory `/logs` and `/logs/:id`, including list/composer,
  search, paging, detail/edit/delete, direct loading, and missing/foreign IDs.
- [x] **WEB-06** Inventory `/reports`, including query-driven date/range state,
  SPA navigation restoration, direct reload behavior, presets, charts/tables,
  and empty/error states.
- [x] **WEB-07** Inventory `/calendar`, including query-selected date, month
  navigation, day/range selection, day edits, labels, and date-boundary states.
- [x] **WEB-08** Inventory `/imports` and its settings-embedded counterpart,
  covering supported source formats, validation, result summaries, history,
  paging, undo, and failure recovery.
- [x] **WEB-09** Inventory `/settings`, its tabs/sections, account actions,
  appearance/preferences, import/export actions, save feedback, and reload
  persistence.
- [x] **WEB-10** Inventory `/labels` and `/labels/:id`, including management,
  scope/color editing, history, related-label/record links, and invalid IDs.
- [x] **WEB-11** Inventory `/board` with board query selection, card deep links,
  All boards, Kanban/Gantt modes, and direct-load fallback when a selected
  board is no longer available.
- [x] **WEB-12** Inventory `/board/archive`, including query-selected archived
  board/card/status focus, restoration, empty archive, invalid IDs, and return
  navigation.
- [x] **WEB-13** Inventory `/notes` and `/notes/:id`, including query filters
  (`archived`, `q`), direct note editing, missing/foreign/archived note
  behavior, and URL/history restoration.
- [x] **WEB-14** Record `/development` as directly addressable temporary
  tooling, excluded from supported product routes and authenticated navigation;
  state the exclusion rationale.
- [x] **WEB-15** For every supported route, inventory signed-out redirect and
  return path; invalid/expired session recovery; page title; loading/empty/error
  states; direct refresh; browser Back/Forward; and missing/foreign resource
  handling where relevant.
- [x] **WEB-16** Inventory shared shell actions: brand/home link, main
  navigation, responsive navigation/menu, skip-to-content, global search,
  theme selection, logout, snackbar/announcements, and floating tracker
  visibility and placement.
- [x] **WEB-17** For desktop Chrome, record normal pointer, keyboard, focus,
  link open-in-new-tab, dialogs, menus, and wide-layout behaviors for shared
  shell and page actions.
- [x] **WEB-18** For mobile Chrome, record narrow and coarse-pointer layouts,
  touch target reachability, browser viewport/keyboard effects, scrolling and
  overflow, tap alternatives for drag/range gestures, browser back behavior,
  and dialogs/menus with the on-screen keyboard open.
- [x] **WEB-19** Inventory cross-cutting accessible outcomes: meaningful
  accessible names, focus entry/return and visible focus, live feedback,
  non-color status cues, reduced-motion behavior, zoom/reflow, and keyboard
  alternatives for pointer-only actions.

## Web application: user action and edge-state inventory

Use the source-backed [product test tree](product-test-tree.md) as the detailed
feature decomposition. Each checkbox below is an individual inventory
checkpoint. Keep the action order for merged journeys visible, and give each
action its own row with the source control, expected state change, feedback,
evidence class, and gap. Do not collapse multiple actions into one “flow
covered” row.

### FLOW-01 — Sessions and timer

- [x] **FLOW-01.01** Open Sessions from main navigation and by direct `/` URL;
  inventory page load, title, session list, tracker placement, and initial
  empty/loading/error states.
- [x] **FLOW-01.02** Open `/sessions` and confirm the inventory captures the
  redirect to `/`, resulting location, and browser Back/Forward behavior.
- [x] **FLOW-01.03** Open a session from its row and from `/sessions/:id`;
  record dialog/editor fields, URL, close/back behavior, and return-to-list
  context.
- [x] **FLOW-01.04** Select a Path in the tracker and record active, deleted,
  missing, and no-available-Path states.
- [x] **FLOW-01.05** Search/select a session label, remove a selected label,
  and create a label from the tracker; record label scope/default visibility,
  duplicate/blank handling, and confirmation feedback.
- [x] **FLOW-01.06** Enter a description, start a timer, and verify the
  displayed running state and description; inventory keyboard shortcut and
  plain Enter behavior separately.
- [x] **FLOW-01.07** Attempt to start while another timer is running; record
  prevention/conflict feedback and the state shown by the server-owned timer.
- [x] **FLOW-01.08** Let a timer run and record elapsed display, source of
  duration, refresh/reconnect behavior, and whether browser sleep/reload
  changes the authoritative session.
- [x] **FLOW-01.09** Stop/save a running timer; record completed session,
  preserved Path/labels/description, tracker reset/draft behavior, and
  duplicate-submit feedback.
- [x] **FLOW-01.10** Cancel/discard a running timer; record confirmation if
  present, discarded data, draft behavior, and recovery if cancellation fails.
- [x] **FLOW-01.11** Pause a running timer; record frozen elapsed total,
  paused indicator, available Resume/Stop actions, and server draft context.
- [x] **FLOW-01.12** Resume a paused timer; record carried duration, resumed
  state and context, plus behavior if the Path was removed while paused.
- [x] **FLOW-01.13** Stop/finish a paused timer; record that no paused interval
  is added, pause state clears, and tracker fields follow the documented
  finished-session behavior.
- [x] **FLOW-01.14** Change the timer from another tab/client; record socket or
  REST reconciliation, stale-state prevention, and whether local draft edits
  survive the update.
- [x] **FLOW-01.15** Edit a completed session's start/end, Path, description,
  and labels; record field validation, save/cancel, persisted result, and
  invalid time range handling.
- [x] **FLOW-01.16** Delete a session; record the confirmation, accessible
  name, successful removal, cancel path, and failed-delete recovery.
- [x] **FLOW-01.17** Start a new timer from a prior session; record copied
  context, fields intentionally not copied, and resulting tracker state.
- [x] **FLOW-01.18** Page through session history and open a related record;
  record page boundaries, loading/error/retry, and whether returning restores
  the prior page/scroll position.
- [x] **FLOW-01.19** Exercise session/timer controls in mobile Chrome with the
  software keyboard open and closed; record reachable controls, viewport
  resizing, scrolling, touch targets, and narrow-width overflow.

### FLOW-02 — Paths

- [x] **FLOW-02.01** Open `/paths` directly and through navigation; record list
  loading, empty state, title, search/filter controls, and URL state.
- [x] **FLOW-02.02** Create a Path with a valid name; record required fields,
  default color/description, submit feedback, and corresponding path-board
  creation/visibility in the Board experience.
- [x] **FLOW-02.03** Submit an empty, whitespace-only, duplicate, and overlong
  Path name; record inline validation, focus placement, server error, and
  whether typing/paste remains available.
- [x] **FLOW-02.04** Edit a Path name, description, and color; record save,
  cancel, error retry, and name propagation to its path board.
- [x] **FLOW-02.05** Select colors through the palette using pointer and
  keyboard; record accessible names, selected state, visible non-color
  indication, and contrast treatment.
- [x] **FLOW-02.06** Reorder Paths by drag and keyboard; record order after
  reload, first/last boundaries, focus behavior, and mobile touch alternative.
- [x] **FLOW-02.07** Pin/unpin a Path if offered; record state feedback and
  ordering/persistence effect separately from Board tab pinning.
- [x] **FLOW-02.08** Change “Show on board” visibility; record immediate show,
  confirmation before hide, cancel/confirm outcomes, announcement, and card
  preservation when hidden.
- [x] **FLOW-02.09** Open a Path using `/paths/:id`; inventory direct-load
  detail/history, unknown/foreign/deleted ID behavior, and close/back return.
- [x] **FLOW-02.10** Review Path history and open each related session/log/note
  or board-card link; record supported record types and return context.
- [x] **FLOW-02.11** Merge one Path into another; record searchable target
  selection, self/foreign target rejection, confirmation, session/card
  transfer, matching-status behavior, source Path/board lifecycle, and final
  user feedback.
- [x] **FLOW-02.12** Delete/archive a Path; record confirmation, referenced
  data behavior, whether deletion is reversible, and visible recovery route.
- [x] **FLOW-02.13** Restore a Path; record restored status, preserved history,
  board visibility, and behavior if its board already exists.
- [x] **FLOW-02.14** Exercise Path list, edit, merge, and visibility journeys
  in mobile Chrome; record dialog fit, keyboard overlap, scrolling, target
  sizes, and drag alternatives.

### FLOW-03 — Timeline and Logs

- [x] **FLOW-03.01** Open `/timeline`; inventory activity loading, empty state,
  date/filter controls, initial range, and current URL behavior.
- [x] **FLOW-03.02** Filter Timeline by activity type and Path; record submit,
  clear, selected-filter feedback, URL representation if any, and empty result.
- [x] **FLOW-03.03** Set Timeline start/end dates and 7-day/30-day presets;
  record inclusive boundaries, same-day range, reversed range validation,
  timezone display, and browser history behavior.
- [x] **FLOW-03.04** Open a Timeline activity's related record; record target
  route/deep link and return-to-filtered-timeline behavior.
- [x] **FLOW-03.05** Add or edit an activity note; record inline editor,
  keyboard submission, save/cancel, live feedback, and network failure retry.
- [x] **FLOW-03.06** Open `/logs` and `/logs/:id`; record list/detail URL,
  direct-load behavior, search state, and invalid or foreign ID response.
- [x] **FLOW-03.07** Create a Log with text and timestamp; record defaults,
  browser-time reset, keyboard submission, whitespace/empty validation,
  long-text handling, and successful list placement.
- [x] **FLOW-03.08** Edit Log text and time inline and from its detail route;
  record save/cancel, validation, concurrency/stale response handling, and
  persistence after reload.
- [x] **FLOW-03.09** Assign and remove LOG labels; record picker search/create,
  selected chips, allowed label scopes, and feedback on save.
- [x] **FLOW-03.10** Search Logs and clear search; record shortcut, URL query,
  no-match state, retained query after reload/back, and focus restoration.
- [x] **FLOW-03.11** Page through grouped Logs; record grouping boundary,
  pagination controls, page loading/error/retry, and scroll restoration.
- [x] **FLOW-03.12** Delete a Log; record confirmation, cancel, success,
  failure recovery, and state after returning from a deep link.
- [x] **FLOW-03.13** Exercise Timeline/Logs forms and lists in mobile Chrome;
  record date picker/keyboard behavior, touch targets, long-text layout, and
  horizontal overflow.

### FLOW-04 — Reports

- [x] **FLOW-04.01** Open `/reports` directly; record default range, initial
  report section/tab, page title, query string, and loading/empty/error states.
- [x] **FLOW-04.02** Choose each date preset and custom start/end dates; record
  inclusive range, validation, displayed values, and resulting query string.
- [x] **FLOW-04.03** Move to previous/next report interval and clear/reset the
  range; record interval size, resulting URL, and returned default state.
- [x] **FLOW-04.04** Navigate away from Reports and return through SPA
  navigation; record whether its picked query/range is restored.
- [x] **FLOW-04.05** Reload a Reports URL with query parameters; record direct
  URL initialization and behavior for malformed or incomplete parameters.
- [x] **FLOW-04.06** Switch report tabs/sections; record active state, URL
  behavior, keyboard access, and whether date range is preserved.
- [x] **FLOW-04.07** Review tracked-time totals and breakdowns; record
  aggregation period, labels, zero values, and agreement with the selected
  date range as an inventory requirement.
- [x] **FLOW-04.08** Review charts and tables; inventory each legend, tooltip,
  tabular alternative, accessible label, empty-data display, and locale-aware
  number/duration formatting.
- [x] **FLOW-04.09** Open a report source link to its Session, Log, Calendar
  day, Path, or Label; record deep-link destination and return context.
- [x] **FLOW-04.10** Record behavior for no data, zero-duration data,
  overlapping sessions, missing Paths/labels, very large ranges, and
  timezone/DST boundaries.
- [x] **FLOW-04.11** Exercise the date selector, tabs, charts, and source links
  in mobile Chrome; record control reachability, chart/table alternative,
  horizontal scrolling, and viewport/keyboard effects.

### FLOW-05 — Calendar

- [x] **FLOW-05.01** Open `/calendar` with no query and with `?date=YYYY-MM-DD`;
  record selected day, initial month, invalid-date fallback, title, and
  browser history behavior.
- [x] **FLOW-05.02** Navigate previous/next month and year; record month/year
  boundaries, leap day, selected-day behavior, and URL changes.
- [x] **FLOW-05.03** Select Today; record resulting month/day and feedback,
  including behavior when Today is already selected.
- [x] **FLOW-05.04** Select one calendar day by pointer, touch, and keyboard;
  record selected state, focus handling, and date details panel.
- [x] **FLOW-05.05** Select a date range; record inclusive endpoints,
  reversal/cancel behavior, keyboard/tap alternative, and range visualization.
- [x] **FLOW-05.06** Edit and save the selected day's note; record empty and
  long text behavior, autosave/manual save, failure feedback, and reload
  persistence.
- [x] **FLOW-05.07** Add an existing label to a day, including one hidden from
  Calendar; record that visibility is preserved and label appears as expected.
- [x] **FLOW-05.08** Create a label from Calendar; record its default scopes,
  display name/color, duplicate handling, and resulting label-chip behavior.
- [x] **FLOW-05.09** Change label color and marker/no-marker status; record
  visual/status cues and impact on report inclusion.
- [x] **FLOW-05.10** Add, edit, and remove label allocations/portions; record
  totals, zero/over-allocation validation, save/cancel, and removal behavior.
- [x] **FLOW-05.11** Record empty month/day, no available labels, hidden but
  already assigned label, and failed-load/save states with retry or recovery.
- [x] **FLOW-05.12** Exercise month/day/range editing in mobile Chrome;
  record touch selection, keyboard behavior, grid fit, safe scrolling, and
  software-keyboard overlap.

### FLOW-06 — Import/export and account

- [x] **FLOW-06.01** Open `/imports` directly and from Settings; record active
  import source, embedded navigation, URL behavior, and initial loading/empty
  states.
- [x] **FLOW-06.02** Select Clockify import; record required inputs, source
  validation, supported file/paste path, progress, summary counts, and errors.
- [x] **FLOW-06.03** Select Knowledge Base transfer/import; record accepted
  format/version, file or text input, validation, and preview/submit behavior.
- [x] **FLOW-06.04** Submit malformed, oversized, unsupported-version, or
  invalid-encoding input; record field/error message, focus, retained data,
  and correction/retry path.
- [x] **FLOW-06.05** Complete a valid import; record created/skipped/failed
  counts, generated records, ownership scope, and persistence after reload.
- [x] **FLOW-06.06** Open import batch history and paginate; record batch
  detail, timestamps/counts, page boundaries, and loading/failure states.
- [x] **FLOW-06.07** Undo an import batch; record confirmation, affected data,
  success/failure feedback, behavior on second undo, and concurrent changes.
- [x] **FLOW-06.08** Export Knowledge Base data; record format choice, download
  filename/type, included data domains, Unicode/date/time handling, and empty
  dataset behavior.
- [x] **FLOW-06.09** Verify the user-facing contract for import/export that
  another account's records are never included or modified; classify evidence
  as API/service versus browser-visible evidence.
- [x] **FLOW-06.10** Open Settings account controls; record email/account
  information, password change/add flows, Google account behavior, validation,
  sign-out, and recovery from rejected credentials.
- [x] **FLOW-06.11** Change theme or other user preference; record immediate
  appearance, persistence after reload/new tab, system-default behavior, and
  API failure recovery.
- [x] **FLOW-06.12** Exercise import forms, file inputs, account controls, and
  export actions in mobile Chrome; record keyboard/file picker, button
  reachability, download behavior, and responsive overflow.

### FLOW-07 — Labels

- [x] **FLOW-07.01** Open `/labels` directly; record default scope/filter,
  list loading, empty state, search field, and URL query behavior.
- [x] **FLOW-07.02** Search Labels and clear the query; record `/` shortcut,
  Escape behavior, matching, no-results state, URL restoration, and focus.
- [x] **FLOW-07.03** Create a Label with valid name, color, and scopes; record
  required fields, default Calendar visibility, selected scope cues, and save
  feedback.
- [x] **FLOW-07.04** Submit blank, whitespace, duplicate, or overlong Label
  names and invalid scope combinations; record inline/server validation and
  correction path.
- [x] **FLOW-07.05** Edit Label name, color, scope, and visibility; record
  existing assignments, immediate/persisted updates, cancel, and failed-save
  recovery.
- [x] **FLOW-07.06** Remove a Label; record confirmation, usage constraints,
  affected assignment behavior, cancel, and recovery where supported.
- [x] **FLOW-07.07** Open Label history from row action and `/labels/:id`;
  record URL, initial/last use, counts, monthly hours, hours-of-day, and
  related-label data states.
- [x] **FLOW-07.08** Follow a related-label trail and return; record cycle
  prevention, loading/error/retry, empty related list, and focus/URL behavior.
- [x] **FLOW-07.09** Open a related Session, Log, Note, or Calendar record;
  record deep-link target, unavailable-record behavior, and return context.
- [x] **FLOW-07.10** Use Label pickers from Sessions, Logs, Notes, Calendar,
  and Board cards; inventory scope filtering, search, create, add/remove,
  selected chips, and save feedback separately per context.
- [x] **FLOW-07.11** Record hidden-from-surface labels already assigned to
  records, empty history, missing/deleted related items, and API failures.
- [x] **FLOW-07.12** Exercise label rows, dialogs, color/scope controls, and
  pickers in mobile Chrome; record touch target, scrolling, keyboard overlap,
  and non-color status cues.

### FLOW-08 — Boards, All boards, and archive

- [x] **FLOW-08.01** Open `/board` without query and with a board query;
  record default board/All boards selection, invalid or hidden board fallback,
  title, and URL state.
- [x] **FLOW-08.02** Open Manage boards; record list ordering, pin groups,
  row actions, keyboard movement, drag handles, dialog Back, and focus return.
- [x] **FLOW-08.03** Create a custom board; record dialog validation, default
  statuses, selected board, save feedback, and new-board empty state.
- [x] **FLOW-08.04** Rename and archive a custom board; record confirmation,
  archive navigation, pinned/order behavior, and Path-board restrictions.
- [x] **FLOW-08.05** Pin/unpin and reorder boards; record group movement,
  persistence, keyboard alternative, and independence from Paths page order.
- [x] **FLOW-08.06** Select an individual board and All boards; record board
  selector, query, cards grouped/combined by column, board badges, and
  available actions.
- [x] **FLOW-08.07** Create, rename, reorder, sort, and archive a status;
  record active/archived status behavior, sort cycle, keyboard/drag support,
  and last-active-status conflict.
- [x] **FLOW-08.08** Add a card from a column and from the editor; record
  default status/board, blank-title behavior, creation feedback, and
  persistence after reload.
- [x] **FLOW-08.09** Edit card title/body with rich-text toolbar; inventory
  every toolbar action and shortcut, save/close behavior, line history where
  enabled, long/pasted content, and save conflict/failure recovery.
- [x] **FLOW-08.10** Change card Path, board, status, priority, dates, and
  labels; record available fields per path/custom board/All boards, validation,
  cross-board move, and persisted result.
- [x] **FLOW-08.11** Start a timer from an eligible card; record visibility
  rules, button accessible name, Path/title carried to timer, and behavior when
  a timer already runs.
- [x] **FLOW-08.12** Archive a card and restore it; record confirmation,
  archive link, status fallback if original status is archived, deep-link
  focus, and restored placement.
- [x] **FLOW-08.13** Sort cards manually and by priority; record sort direction,
  stability, whether manual reorder is disabled, and behavior across All boards.
- [x] **FLOW-08.14** Drag/reorder a card within and across columns; record
  whole-column/order result, ownership/status rules, optimistic feedback,
  failed-save rollback, and touch/keyboard alternative.
- [x] **FLOW-08.15** Load more cards and retry a failed page; record cursor,
  no-duplicate behavior, stale response handling after board/sort changes, and
  end-of-list state.
- [x] **FLOW-08.16** Open Gantt and navigate previous/next/today/date bounds;
  record visible date window, query/persistence, and behavior for invalid or
  reversed ranges.
- [x] **FLOW-08.17** Toggle Gantt card list visibility and full-width layout;
  record sticky gutter, horizontal scroll, saved preference, and return state.
- [x] **FLOW-08.18** Drag a scheduled Gantt bar to move its dates and drag each
  resize handle; record whole-day snapping, inclusive dates, save/failure
  feedback, pointer cancel/lost capture, and keyboard alternative.
- [x] **FLOW-08.19** Set dates for an unscheduled Gantt card by click and by
  range gesture; record one-day versus inclusive-range outcome and cancel path.
- [x] **FLOW-08.20** Use offscreen-date arrows and open a card from Gantt;
  record target date visibility, deep-linked card query, editor open/close, and
  list scroll behavior.
- [x] **FLOW-08.21** Open `/board/archive` directly or from Board; inventory
  archived boards/statuses/cards, empty state, query-selected focus, restore
  actions, invalid/foreign IDs, and return-to-board context.
- [x] **FLOW-08.22** Exercise Manage boards, Kanban, Gantt, card dialogs, and
  archive in mobile Chrome; record responsive mode, menu access, touch drag
  alternatives, keyboard overlap, target sizes, and horizontal overflow.

### FLOW-09 — Notes

- [x] **FLOW-09.01** Open `/notes` with default query, `?q=`, and
  `?archived=1`; record list/filter state, URL restoration, empty state, and
  loading/error feedback.
- [x] **FLOW-09.02** Create a Note; record initial title/body, focus policy,
  blank-note handling, URL/id creation, and list placement.
- [x] **FLOW-09.03** Open a Note from the list and `/notes/:id`; record deep-link
  load, editor state, missing/foreign/archived ID behavior, and browser
  Back/Forward.
- [x] **FLOW-09.04** Edit title and body; record autosave timing/indicator,
  input retention while saving, empty/long text, and failure/retry behavior.
- [x] **FLOW-09.05** Apply every rich-text toolbar action (text style, bold,
  italic, underline, strike, lists, checklist, quote, code); inventory output,
  selection retention, keyboard shortcuts, and plain-text/Markdown behavior.
- [x] **FLOW-09.06** Paste plain text, rich HTML, and long content; record
  sanitization/normalization, resilient layout, saved result, and undo behavior.
- [x] **FLOW-09.07** Assign/remove labels; record picker search, scope, create,
  chip update, save status, and error recovery.
- [x] **FLOW-09.08** Pin/unpin and reorder Notes; record order persistence,
  filtered/archived behavior, drag/keyboard operation, and mobile alternative.
- [x] **FLOW-09.09** Search Notes and switch active/archive views; record
  query-to-list mapping, empty/no-match state, page size, and back/forward
  restoration.
- [x] **FLOW-09.10** Archive and restore a Note; record confirmation or
  reversible feedback, list membership, direct URL behavior, and preserved
  labels/content.
- [x] **FLOW-09.11** Delete a Note if offered; record confirmation, undo/recovery
  window, cancellation, and link behavior after deletion.
- [x] **FLOW-09.12** Navigate away during a pending edit; record unsaved-change
  warning, stay/leave actions, focus, and whether pending save is flushed.
- [x] **FLOW-09.13** Edit the same Note from another tab/client; record conflict
  detection, stale-write handling, user recovery choice, and no silent data
  loss.
- [x] **FLOW-09.14** Exercise Note list/editor/toolbar in mobile Chrome;
  record visible editing controls, text selection, viewport resize, scroll
  ownership, toolbar wrapping, and keyboard overlap.

### FLOW-10 — Shared state and recovery checkpoints

- [x] **FLOW-10.01** For every route above, record initial loading and delayed
  loading feedback, including whether the loading shape preserves layout.
- [x] **FLOW-10.02** For every list/domain with no records, record empty-state
  copy and the next useful action available to the user.
- [x] **FLOW-10.03** For every form, record incomplete submit, inline field
  errors, first-error focus, correction, and successful resubmission.
- [x] **FLOW-10.04** For every API-backed read, record timeout/offline/server
  error visibility, retry action, retained user input, and stale-result
  protection.
- [x] **FLOW-10.05** For every create/update/delete, record pending state,
  duplicate-submit prevention, success announcement, failure rollback/retry,
  and resulting persisted state.
- [x] **FLOW-10.06** For every destructive action, record confirmation or undo,
  cancel behavior, keyboard/focus management, and recovery after request
  failure.
- [x] **FLOW-10.07** For every deep link, record valid, missing, deleted,
  archived, and foreign-resource behavior plus safe return navigation.
- [x] **FLOW-10.08** For every reorder/drag/date gesture, record pointer,
  touch, keyboard/tap alternative, cancel/lost-capture recovery, and persisted
  final order/date.
- [x] **FLOW-10.09** For every route with filters, tabs, selected records, or
  pagination, record URL representation and Back/Forward/refresh restoration.
- [x] **FLOW-10.10** For every user-entered content surface, record blank,
  typical, very long, pasted, Unicode, and text-expansion/trailing-space
  behavior.
- [x] **FLOW-10.11** For every cross-client shared record, change it in one
  client then inspect the other; record sync mechanism, latency/evidence
  class, conflicts, and ownership boundary.
- [x] **FLOW-10.12** For desktop and mobile Chrome separately, record keyboard
  focus, touch target, zoom/reflow, reduced motion, responsive overflow, and
  screen-reader-visible labels/status feedback for each applicable flow.

## Shared backend API used by web and extension

Inventory Spring mappings from `backend/src/main/java/com/know/api/` and
confirm how the web stores and extension call them. The API matrix is part of
OTOTEST-01 because it defines the server behavior behind the client journeys.

- [x] **API-01** Include each composed controller and method mapping as a
  distinct HTTP verb + full path row. Preserve aliases as separate rows when
  verb, route shape, request/response, or behavior differs.
- [ ] **API-02** For each row, record controller/method, path/query/body
  inputs, response shape/status, authentication requirement, ownership-scoped
  identifiers, and persisted or externally visible effect.
- [ ] **API-03** Map authentication and account operations, including password
  sign-in/registration, Google configuration/exchange, refresh/logout or
  account settings as implemented, and rate-limit/invalid-credential outcomes.
- [ ] **API-04** Map Paths and Labels operations, including referenced path or
  label IDs, scopes/visibility, history, ordering, merge, archive/restore, and
  cross-user rejection where applicable.
- [ ] **API-05** Map timer and session operations, including start/current/
  draft, stop/cancel, pause/resume/finish, session list/detail/update/delete,
  and the one-running-timer and server-owned duration invariants.
- [ ] **API-06** Map Logs, Timeline/Activity, Calendar, and Reports operations,
  including filters, date boundaries, pagination, label assignments, and
  source-record links used by the clients.
- [ ] **API-07** Map Notes operations, including list/search/archive/detail,
  create/update/delete/restore, ordering/pinning, labels, and rich-text or
  line-history fields where exposed.
- [ ] **API-08** Map Board and All boards operations, including boards,
  statuses, cards, ordering/pinning/visibility, archive/restore, merged
  columns, card paging/sorting, and date mutations used by Kanban/Gantt.
- [ ] **API-09** Map imports, transfer/export, preferences, and global search,
  including import sources, batch undo, format/version boundaries, preference
  persistence, search result deep-link targets, and any streaming/download
  response behavior.
- [ ] **API-10** For each operation, identify named success assertions and
  applicable validation, unauthenticated, foreign-owner/reference, conflict,
  and persistence assertions. Mark missing evidence as a gap; do not infer it
  from a broad authentication sweep.
- [ ] **API-11** Record relevant workflow/command for each evidence layer and
  distinguish mocked client calls, service/controller tests, PostgreSQL
  integration, deployed-shaped smoke, and real browser evidence.
- [ ] **API-12** Identify API operations actually invoked by web and extension
  source; classify server routes with no supported client journey as
  unsupported/internal or needs-decision with rationale.

## Chrome extension surfaces

Manifest source: `chrome-extension/wxt.config.ts`; popup/options markup under
`chrome-extension/entrypoints/`; behavior in `chrome-extension/popup.js`,
`options.js`, and `entrypoints/background.ts`.

- [ ] **EXT-01** Inventory the Manifest V3 popup (`Timer`), its Tracker and
  Notes tabs, settings menu, sign-in states, loading/error states, and actions.
- [ ] **EXT-02** Tracker inventory includes path selection/creation, session
  labels, description, start/stop, editable timer start time, recent sessions,
  sign-in/logout, live synchronization, and failure/expired-session recovery.
- [ ] **EXT-03** Notes inventory includes list/create/open/back, title/body
  editing, Markdown shortcuts, autosave and save failure, restored open note,
  remembered adjustable height, and popup resize/scroll behavior.
- [ ] **EXT-04** Options page inventory includes API URL entry, normalization,
  permission request/grant/deny, save state, invalid URL, and recovery.
- [ ] **EXT-05** Background/service-worker inventory includes installation
  handling, popup-open fallback, Google sign-in handoff, Clockify import
  message validation, disabled setting, missing/expired authentication, API
  errors, redirect protection, and success summary.
- [ ] **EXT-06** Inventory permissions and associate each with its user-visible
  feature: `storage`, `identity`, configured API host, and Clockify detailed
  report host access. Record optional permission prompts and denial outcomes.
- [ ] **EXT-07** Inventory content-script/Clockify overlay/page entrypoints,
  supported URL match patterns, page-to-extension message channels, and
  visible enable/disable/import outcomes from the user's perspective.
- [ ] **EXT-08** Classify the installed Chrome extension journey separately
  from Node/module tests: install/load unpacked, configure API, grant host
  access, authenticate, use popup/options, and invoke supported Clockify
  integration. Link existing assertions without treating them as installed
  browser evidence.
- [ ] **EXT-09** Record mobile Chrome support explicitly. If the extension
  cannot be installed or invoked in the target mobile Chrome environment,
  classify extension-only controls as unsupported there and evaluate the
  responsive Knowledge Base web app in mobile Chrome as the supported mobile
  journey. Do not imply desktop extension behavior proves mobile web behavior.

## Cross-client behavior and evidence map

- [ ] **XCLIENT-01** Map each major user journey to the web route, applicable
  Chrome extension surface, shared API/domain operation, persisted outcome,
  and evidence layer.
- [ ] **XCLIENT-02** Identify shared behavior that should reconcile across web
  and extension: authenticated ownership, paths/labels, timer state and
  server-owned duration, notes edited in both clients, and Clockify import
  handoff where applicable.
- [ ] **XCLIENT-03** Record which flows are web-only, extension-only, shared
  API behavior, manual/browser-platform evidence, or intentionally unsupported.
- [ ] **XCLIENT-04** Record evidence with the exact assertion name and source,
  workflow/command, whether it is mocked or uses a real API/browser, any
  required disposable account/data, and the current known gap.

### Cross-client journey map inventory

For each journey below, create ordered inventory rows for its transitions.
Each row links the web route/control, extension entry point where applicable,
API operation, persisted entity/effect, existing named assertion or run
record, evidence class, and uncovered behavior. These are candidate journeys
for the inventory and handoff only: do not seed data or execute them in
OTOTEST-01. Real-stack execution belongs to OTOTEST-04.

- [ ] **MERGE-01** Map Path creation → Path board initialization → card
  creation → timer start → completed Session and its Path/history views.
- [ ] **MERGE-02** Map reusable Label creation → assignment in each supported
  context → Label history and related-record navigation.
- [ ] **MERGE-03** Map Log creation → Timeline/search discovery → detail/edit →
  deletion and resulting list/search state.
- [ ] **MERGE-04** Map Calendar day note/label allocation → report aggregation
  for the selected range → source link back to the Calendar day.
- [ ] **MERGE-05** Map Note create/edit on web → extension Notes view → saved
  extension change → web reload, including supported format/version behavior.
- [ ] **MERGE-06** Map supported import submission → imported records and
  relationships → batch undo and affected-resource state.
- [ ] **MERGE-07** Map global search for a page and each record kind → result
  deep link → detail return/history state.
- [ ] **MERGE-08** Map Path merge → transferred Sessions/cards and board
  lifecycle → resulting Path history, board, Reports, or Timeline references.
- [ ] **MERGE-09** Map web/extension timer state sharing, including current
  timer, pause/resume/stop, session ownership, and stale/replaced auth state.
- [ ] **MERGE-10** Classify which candidate web journeys apply to desktop
  Chrome and mobile Chrome; classify extension-only steps separately by
  documented platform support. Do not count desktop extension evidence as
  mobile web evidence.

## Exclusions and handoff

- [ ] **SCOPE-01** Exclude native iOS targets, simulator behavior, SwiftUI
  controls, and iOS-only authentication from all inventory rows in this
  milestone.
- [ ] **SCOPE-02** Inventory shared API behavior only where an operation
  supports the web or Chrome extension product; do not create acceptance
  obligations for unsupported client surfaces.
- [ ] **SCOPE-03** Keep `/development` excluded from supported route completeness
  while recording its current route and why it is excluded.
- [ ] **SCOPE-04** Review browser support assumptions for the Chrome extension
  and mobile Chrome with maintainers; unresolved assumptions remain labeled
  `needs decision` rather than silently counted as supported.
- [ ] **HANDOFF-01** Link the completed route, API, control, extension, and
  cross-client inventories from the OTOTEST-01 milestone document and index.
- [ ] **HANDOFF-02** Provide a prioritized set of genuine inventory gaps for
  OTOTEST-02 through OTOTEST-05, without implementing product/test changes as
  part of OTOTEST-01 documentation acceptance.
- [ ] **HANDOFF-03** Record review date, source revision, reviewer, exclusions,
  evidence limitations, and follow-up owner for each needs-decision item.

## Source references

- [OTOTEST roadmap](roadmap.md)
- [OTOTEST-01 milestone brief](01-coverage-inventories.md)
- [Product test tree](product-test-tree.md)
- [Current coverage audit](../test-coverage-audit.md)
- Web route registration: `frontend/src/main.ts`
- Web shell: `frontend/src/App.vue`
- Extension manifest configuration: `chrome-extension/wxt.config.ts`
- Extension popup/options: `chrome-extension/entrypoints/popup/index.html`,
  `chrome-extension/entrypoints/options/index.html`
- Extension background: `chrome-extension/entrypoints/background.ts`
