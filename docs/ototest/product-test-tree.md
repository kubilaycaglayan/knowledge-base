# #ototest product test tree

**Source review:** 2026-10-09; router, Vue views/components, Spring API
controllers, extension manifest/source, and test/workflow paths.
**Runtime note:** Authenticated browser review was attempted against the local
app. The app shell loaded but the configured disposable account returned HTTP
403, so the route tree below is source-backed and not a claim of authenticated
visual acceptance.

This is the product-facing index for OTOTEST. It starts with navigable paths,
then page regions and controls, then behavior and test layers. Each listed
behavior needs a named assertion in the route/control matrix when OTOTEST-01
is completed. “Unit” means pure/domain or component behavior; “integration”
means API/service/persistence; “E2E” means browser-visible behavior through
the deployed-shaped app. Regression cases should be retained for every fixed
defect and every ownership, timer invariant, ordering, or import/export bug.

## 1. Navigable web paths

| Path | Route behavior | Product status | Core evidence to map |
| --- | --- | --- | --- |
| `/` | Sessions workspace | Supported | Sessions view tests; timer/session browser suite |
| `/sessions` | Redirect to `/` | Supported alias | Router navigation test: final path and history behavior |
| `/sessions/:id` | Session detail/edit deep link | Supported | Session view/API tests; real-stack deep link, unknown/foreign ID |
| `/paths` | Paths workspace | Supported | Paths view/API tests; real-stack CRUD and ordering |
| `/paths/:id` | Opens selected Path detail/history context | Supported | Path deep-link test; missing/foreign/archived ID handling |
| `/timeline` | Activity timeline | Supported | Timeline view/API tests; query/filter behavior |
| `/logs` | Logs workspace | Supported | Logs view/API tests; real-stack CRUD/filter/paging |
| `/logs/:id` | Opens the selected Log detail | Supported | Deep-link test; missing/foreign ID handling |
| `/reports` | Reports; query carries date/range filters | Supported | Report view/API tests; URL restore and back/forward |
| `/calendar` | Calendar | Supported | Calendar view/API tests; real-stack day/range persistence |
| `/imports` | Import history and import tools | Supported | Import view/API tests; real-stack valid/invalid/undo |
| `/settings` | Account, data import, export settings | Supported | Settings view/preferences/API tests; persistence on reload |
| `/labels` | Label list and management | Supported | Labels view/API tests; real-stack CRUD/history |
| `/labels/:id` | Open history for selected label | Supported | Deep link, invalid/foreign ID, related-record navigation |
| `/board` | Board workspace, Kanban/Gantt and All boards | Supported | Board view/store tests; board real-stack suite |
| `/board/archive` | Archived boards/statuses/cards; query identifies board/item | Supported | Archive view/store tests; restore and deep-link focus |
| `/notes` | Notes list/editor | Supported | Notes view/API tests; real-stack persistence and ordering |
| `/notes/:id` | Opens selected note editor | Supported | Deep link, missing/foreign/archived note handling |
| `/development` | Label picker demo | **Temporary, excluded from nav** | The route remains directly addressable for development; it is not a supported product journey. The authenticated navbar assertion must verify there is no Development link. |

Shared shell on supported authenticated paths: auth gate and token refresh;
main navigation; skip-to-content link; page title; theme toggle; global search;
floating timer outside session routes and focused mobile text inputs; snackbar;
responsive navigation; logout. Test logged-out deep-link redirect/return,
logout, expired/invalid token recovery, title updates, keyboard navigation,
theme persistence, and floating tracker visibility by route and viewport.

## 2. Route subtrees: page regions, actions, and behavioral edges

The trees below identify the minimum meaningful action families. Inventories
must expand repeated row/card actions into accessible name + expected result
rows; they must not count a page render as coverage of its controls.

### `/` and `/sessions/:id` — Sessions and timer

- Page/component subtree: `SessionsView.vue` → `SessionDialog`,
  `SessionEditForm`, `PromptDialog`, `FloatingTimeTracker`, session list/card,
  pagination; shared `App.vue` tracker/navigation shell.
- Session list → date/grouping, session card, labels/path/source, pagination.
- Create/start → choose Path, title/note as supported; start from a session or
  Board card; enforce one server-owned running timer.
- Running timer → pause, resume, finish/save, stop/save, cancel/discard; show
  elapsed state, reconnect state, and cross-tab/WebSocket updates.
- Session row → open deep link, edit start/end/path/source/note, start again,
  delete with confirmation, page navigation.
- Edges: no sessions, no eligible Path, overlapping/invalid times, end before
  start, concurrent timer start, stale timer state, network loss during action,
  duplicate submit, timezone/DST boundary, foreign/unknown session ID.
- Tests: timer state/domain unit tests; controller/service + ownership and
  PostgreSQL persistence integration; session/timer browser E2E and regression
  for single-running-timer and reconnect behavior.

### `/paths` and `/paths/:id` — Paths

- Page/component subtree: `PathsView.vue` → `MergePathDialog`, `ColorPalette`,
  `PathTextColorControl`, `LabelPicker`, `PromptDialog`, path row/detail,
  session edit panel and history panel.
- Path list → search/filter if available, reorder, pin/hide/color, open detail.
- Path card → edit name/description/color, merge into another Path, view
  history, remove/archive, undo/recover where offered.
- Create/edit dialog → required name, description, accessible color palette,
  submit/cancel, inline errors and request retry.
- Path detail → related sessions/logs/notes/board; open and edit session from
  related history.
- Edges: whitespace/duplicate/overlong name, empty list, very long description,
  reorder first/last and keyboard alternative, merge self/foreign target,
  delete referenced Path, undo timeout, failed save, restored Path and board.
- Tests: domain validation/merge unit; path API/persistence/ownership
  integration; browser CRUD/order/merge/undo and reload E2E.

### `/timeline` — Activity

- Page/component subtree: `TimelineView.vue` → filter form, activity card,
  inline activity-note editor.
- Filter panel → activity type, Path, from/to dates, 7-day/30-day/clear, submit.
- Activity card → open related resource; add/edit activity note; save/cancel.
- Edges: no matching activity, reversed date range, same-day/inclusive range,
  deleted/hidden Path, invalid filter, stale result after rapid filter changes,
  note save failure and retry.
- Tests: filter/date unit; activity API integration; browser filter/deep-link
  and note persistence E2E.

### `/logs` and `/logs/:id` — Logs

- Page/component subtree: `LogsView.vue` → `LogDialog`, `LabelPicker`,
  `PromptDialog`, composer, inline edit row, search panel, grouped list and
  pagination.
- Composer → text, timestamp, browser-time reset, submit; search open/close.
- Log row → inline edit text/time, open detail, label assignment, delete with
  confirmation; pagination.
- Edges: empty/whitespace/very long text, malformed timestamp, timezone change,
  duplicate submit, no results, page boundary, failed edit/delete, foreign ID.
- Tests: formatting/validation unit; API persistence, label ownership and
  pagination integration; browser create/edit/delete/deep-link E2E.

### `/reports` — Reports

- Page/component subtree: `ReportsView.vue` → `ReportTabs`,
  `ProjectDonutChart`, `ProjectDurationTable`, `LabelPicker`, tracked-time,
  calendar-log and chart sections.
- Date/range controls → preset/custom dates, previous/next/clear where shown;
  query string represents active range and survives SPA navigation/back/forward.
- Report sections → tracked-time totals, charts/breakdowns, calendar log and
  links to source records.
- Edges: empty dataset, zero-duration/overlapping sessions, reversed or very
  large range, no labels/Paths, loading/error/retry, locale/timezone boundary,
  chart keyboard/accessible data alternative.
- Tests: aggregation/date unit; report API integration; browser query-state and
  persistence E2E; chart/accessibility regression.

### `/calendar` — Calendar

- Page/component subtree: `CalendarView.vue` → month/year picker, day grid,
  selected-day/range editor, `ColorPalette`, `LabelPicker`, allocation rows.
- Month/year picker → previous/next month, select month/year, today.
- Day grid → select day; select a date range by pointer; keyboard/tap path for
  equivalent selection; edit day note and label portions.
- Label manager → create/edit/remove calendar label, change color, allocate
  portions, save/cancel; render label names and amounts.
- Edges: month/year boundaries, leap day, timezone date rollover, reversed or
  partial range, zero/over-100 allocation, label hidden from Calendar but
  already assigned, no labels/no events, save failure, overlapping gesture.
- Tests: calendar arithmetic/allocation unit; API inclusive-range and
  persistence integration; browser month/day/range/label edit E2E.

### `/imports` and `/settings` — Transfer, account, preferences

- Page/component subtree: `ImportsView.vue` → import-source tabs, Clockify and
  Knowledge Base form panels, batch history/pagination, `ErrorNotice`;
  `SettingsView.vue` → account/data/export tabs and embedded `ImportsView`.
- Imports → choose Clockify or Knowledge Base; paste/select source data; submit;
  report created/skipped/error counts; inspect import batches, paginate, undo.
- Settings tabs → Account/password, theme/appearance, Import, Export.
- Import/export → validate source/format, download complete user-scoped data,
  preserve CSV/JSON contracts; import UI can be embedded from Settings.
- Edges: malformed/oversized file or payload, unsupported version/encoding,
  duplicate rows, partial import rollback/reporting, empty batch, undo twice,
  network interruption, export escaping/Unicode/timezone, avoid leaking another
  user's data, password mismatch/current-password rejection, preferences reload.
- Tests: parser/serializer/password validation unit; import batch/rollback,
  export ownership and preferences persistence integration; real-stack valid,
  invalid, reload, and undo E2E.

### `/labels` and `/labels/:id` — Labels

- Page/component subtree: `LabelsView.vue` → `PromptDialog`,
  `ColorPalette`, `LabelHistoryDialog`, search/list, add/edit dialogs and scope
  controls; history dialog → related-label trail and record links.
- Search/list → add, edit, remove, scope selection; row actions open history.
- History dialog → back through related-label trail, open related label,
  close, retry load; record list opens associated resource.
- Edges: duplicate/blank/overlong names, zero scopes, label with usages,
  history cycles, deleted related item, pagination/empty history, request
  failure, foreign label ID.
- Tests: scope/history relationship unit; API/ownership integration; browser
  CRUD/history/deep-link E2E.

### `/board` — Boards, All boards, Kanban, Gantt

- Page/component subtree: `BoardView.vue` → board tabs/overflow menu,
  manager/settings dialogs, Kanban columns/cards, rich-text card editor,
  `RichTextToolbar`, `LabelPicker`, `TimerRunButton`, `GanttCard`, archive
  confirmation dialogs and responsive phone menu.
- Board selector → select board/All boards, overflow menu, manage boards,
  create, rename custom board, pin, reorder, visibility, archive.
- Kanban columns → add/edit/archive status, sort cards (manual/priority),
  reorder statuses, add card, load more/retry; drag card between positions and
  statuses; keyboard up/down reorder for board/status lists.
- Card editor → title, Path, board (All boards), status/column, start/due date,
  priority, labels, start timer, save/retry/close, archive.
- Gantt → date window previous/next/today, date bounds, priority/date sort,
  expand width, hide/show card list, add card, offscreen jump, click to edit;
  drag bar to move dates, drag handles to resize, pointer cancel recovery;
  unscheduled card click sets one date, pointer range gesture sets inclusive
  range.
- Edges: no boards/no cards, >50 or paginated cards, invalid/reversed dates,
  start after due, archived status target, last active status archive conflict,
  moving card across boards/statuses, Path board restrictions, stale concurrent
  edit/optimistic rollback, duplicate drag/drop, pointercancel/lost capture,
  touch and keyboard alternatives, rapid sort/filter/pagination, long titles,
  foreign board/status/card/Path/label IDs.
- Tests: sorting/placement/date range unit; board API ownership, transaction,
  cursor and PostgreSQL integration; existing board E2E plus explicit
  persistence/reload and Gantt gestures; regression for drag, stale write,
  archive/restore and last-status invariants.

### `/board/archive` — Archived items

- Page/component subtree: `BoardArchiveView.vue` → back link, archived board,
  status and card lists, restore controls, deep-link highlight/focus.
- Archived boards → restore custom board; Path boards explain restoration via
  Path restore.
- Archived statuses → restore; archived cards → restore, including fallback
  to active status if original status is archived.
- Query parameters identify/highlight board or item and focus it accessibly;
  back link returns to board context.
- Edges: empty archive, unknown/foreign IDs, removed owning Path, all statuses
  archived, repeated restore, concurrent mutation, failed restore, long names.
- Tests: fallback/domain unit; API ownership/state integration; browser restore
  and return-context E2E.

### `/notes` and `/notes/:id` — Notes

- Page/component subtree: `NotesView.vue` → note list/card, archive/search
  filters, rich-text editor, `RichTextToolbar`, `LabelPicker`,
  `NotesPageSizeSelect`, pin and reorder controls.
- List → search/filter, show archived, create, open detail, pin/unpin, reorder
  by drag; each note item links to its detail route.
- Editor → title/content/rich-text toolbar and task list; labels; archive/
  restore; delete/undo as offered; unsaved-change warning and navigation.
- Edges: empty/long title/content, blank document, pasted HTML, concurrent
  edits, failed autosave/manual save, archive while editing, drag while
  filtered/archived, drop first/last, mobile/keyboard reorder, unknown/foreign
  note ID, link/history restoration.
- Tests: document normalization/toolbar unit; note CRUD/order/pin/ownership
  integration; browser create/edit/format/reload/archive/deep-link E2E.

## 3. Shared security and resilience subtree

- Authentication: register/login/password change/Google configuration and
  callback behavior; anonymous calls rejected; token expiry/logout and safe
  redirect return path; rate limiting and proxy identity covered by existing
  hardening evidence.
- Ownership: every read/write scoped by authenticated user; test foreign IDs
  for direct resources and referenced IDs (Path, labels, boards, statuses,
  cards, notes, sessions/time entries, calendar labels, import batches).
- Input boundaries: missing/invalid IDs, malformed JSON/CSV, validation
  errors, path traversal or unsafe rich content, oversized input, invalid date
  and pagination ranges, duplicate submits, stale writes, transaction rollback.
- Browser resilience: loading/empty/error/retry states; offline/timeouts; no
  silent failure; state rollback or recovery; no secret/token in console,
  screenshots, traces or CI artifacts.
- Accessibility and input: keyboard/focus, accessible names, dialogs return
  focus, non-color status cues, tap target, touch and keyboard alternative for
  drag/date gestures, reduced motion, responsive layouts and overflow.
- Data correctness: persistence after reload, user-scoped import/export,
  timezone/DST and inclusive date boundaries, no client-only historical timer
  duration, one-running-timer invariant, PostgreSQL transaction/constraints.

## 4. Extension branch

There is no web URL route for the extension. Inventory Manifest V3 entrypoints
in `chrome-extension/manifest.json`: popup, options, service worker, content
scripts/overlays, host permissions and externally opened Clockify/API pages.
Map each current manifest permission to the feature requiring it.

- Popup/options → server/API URL configuration, sign in/out, timer state and
  start/stop/sync, notes, Clockify settings/actions supported by current code.
- Content integration → supported Clockify pages, overlay controls and
  browser navigation handoff.
- Edge cases → invalid API URL, expired token, unavailable API, denied or
  revoked permission, unsupported host/version, worker suspension/restart,
  duplicate messages, stale timer, no active tab, malformed page data.
- Unit: Node tests for parsing/state/modules; integration: mocked Chrome APIs
  and local API contract; E2E: install built extension in Chromium and verify
  popup/options plus one content/service-worker journey. Regression: retain
  failures for message routing, permission, and worker lifecycle defects.

## 5. Required evidence by test layer

| Layer | Required proof | Candidate repository locations |
| --- | --- | --- |
| Unit/component | Pure rules, validation, date/range/sort/parser behavior, component interaction and state transitions | `backend/src/test/.../service`, `frontend/src/**/*.test.ts`, `chrome-extension/*.test.js` |
| API/service integration | HTTP mapping, serialization, persistence, ownership, referenced-ID checks, transaction/error behavior | `backend/src/test/.../api`, `integration`, guarded PostgreSQL tests |
| Browser integration | Real browser keyboard/pointer/navigation, URL/history, dialogs, requests and recovery | `frontend/scripts/*.acceptance.test.mjs` |
| E2E real stack | UI action results and matching server persistence after reload; isolated disposable app/data | `frontend/scripts/*real-stack*.test.mjs`, `scripts/run-smoke-tests.sh` |
| Regression | A named retained test for each defect; run in its owning layer plus required fast suite | Same suites; link issue/defect/run record |

Inventory must record exact test names, command/workflow, fixture vs real API,
browser profile, and gap state. A path/control is not “covered” because a test
file exists; the assertion must fail when the expected result is absent.
