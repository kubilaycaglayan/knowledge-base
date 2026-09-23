# Knowledge Base UI roadmap

- [x] Share tracker fields, queued saves, and synchronization across web routes;
  persist idle selections per account and reconcile them in web, extension,
  and iOS clients, including reconnects and labels created on another client.
- [ ] Validate the shared idle-selection flow on an iOS simulator (requires macOS).

- [x] Expand timer and session descriptions to a 5,000-character limit with
  actionable validation errors.

- [x] Preserve unfinished timer drafts across live snapshots and queue edits made during active saves.

- [x] Rebuild native iOS authentication from the web design with password login,
  registration, Google SDK token exchange, and Keychain session persistence.
- [ ] Milestone 2: bring the iOS sign-in and unauthenticated flows to one-to-one
  parity with the current web behavior, states, accessibility, and regression
  coverage (see `docs/ios-milestone-2-sign-in-parity.md`).
- [x] Capture the Milestone 2 web auth state/token matrix and direct browser
  reference checks; native implementation and device acceptance remain open
  (see `docs/ios-auth-state-matrix.md`).
- [x] Implement the first mobile-web-derived iOS workspace milestone: Sessions,
  server-owned timer controls, scoped labels, paginated history, session editing,
  deletion confirmation, light/dark theme parity, and WebSocket/REST reconciliation.
- [x] Finish the aggregate simulator UI-test pass for the new Sessions editor on
  the local Xcode 26.5 runner: all 9 UI cases pass on iPhone 17 Pro.
- [x] Milestone 3: bring the iOS `/logs` page to parity with the current web
  behavior, states, grouping, labels, optimistic editing, accessibility, and
  regression coverage (see `docs/ios-milestone-3-logs-parity.md`).
- [x] Milestone 4: bring the iOS `/labels` page to parity with the current web
  behavior, scopes, colors, dialogs, destructive recovery, accessibility, and
  regression coverage (see `docs/ios-milestone-4-labels-parity.md`).
- [x] Present label visibility as “Don’t show in” in web and iOS label editors,
  with Calendar hidden for newly created labels and no existing-label migration.
- [x] Milestone 5: bring the iOS `/notes` page to parity with the current web
  behavior, rich-text editing, autosave/conflict recovery, labels,
  archive/restore, accessibility, and regression coverage (see
  `docs/ios-milestone-5-notes-parity.md`).
- [ ] Milestone 6: bring the iOS `/paths` page to parity with the current web
  behavior, path management, history, merge/remove recovery, accessibility,
  and regression coverage (see `docs/ios-milestone-6-paths-parity.md`).
- [ ] Milestone 7: bring the iOS `/calendar` page to parity with the current web
  behavior, date grid, day/range editing, labels, accessibility, and regression
  coverage (see `docs/ios-milestone-7-calendar-parity.md`).
- [ ] Complete live Google consent smoke verification with the owner's iOS OAuth client.

- [x] Preserve sign-in across deployment outages and API recreation, keep error
  dispatches from causing false sign-outs, and verify token continuity in smoke tests.

- [x] Establish the approved flat workspace design.
- [x] Extend its shared shell, typography, controls, and flat sections to Sessions,
  Paths, session labels, Timeline, Calendar, Notes, Reports, Imports, and authentication.
- [x] Add persistent light/dark selection, system default, early theme bootstrap,
  and theme-aware dropdowns, dialogs, date picker, and charts.
- [x] Show report Sankey data as chronological path-aggregate columns for days,
  weeks, or months, with flows between adjacent periods.
- [x] Keep the report date interval independent from daily, weekly, monthly,
  quarterly, and yearly chart aggregation.
- [x] Provide quarter date presets and useful rolling report windows: 30 days
  for weekly, 1 year for monthly, and 2 years for quarterly aggregation.
- [x] Add repeatable browser review for all routes and both themes, keyboard
  interaction, responsive layouts, and sparse/error/long-content states.
- [x] Allow Google-only accounts to add password sign-in from Settings while
  retaining Google OAuth sign-in.
- [x] Allow a path to be merged into another owned path from its edit controls,
  with searchable target selection, confirmation, and server-side session transfer.
- [x] Discard timers stopped before 2 seconds so accidental starts do not create sessions.
- [x] Preserve path and label colors, scopes, and assignments in Knowledge Base imports and exports.
- [x] Include logs, timestamps, and label assignments in Knowledge Base imports and exports, including batch undo.
- [x] Add user-scoped native WebSocket timer snapshots with REST polling fallback for web and legacy clients.
- [x] Edit individual sessions directly from a path’s history dialog.
- [x] Compact rich-note cards, preserve clean rich-text clipboard output, keep
  mobile editing controls visible, and add pinned/custom-ordered paths.
- [x] Add timestamped, owner-scoped text logs with chronological groups and in-place editing.
- [x] Let users assign one or more reusable `LOG`-scoped labels to logs from the log timeline.
- [x] Add a persistent Clockify import toggle to the extension settings, gating
  both the floating report overlay and automatic imports.

Continue applying these foundations to future web features. Native iOS and
extension design work remains outside this web redesign; their API contracts,
compatibility identifiers, and server-owned timer rules remain unchanged.

- [x] Resolve the September 2026 timer, session, notes, mobile layout, and page-title regressions; acceptance criteria are recorded in `docs/bug-acceptance-checklists.md`.
- [x] Add hourly Neon snapshot refreshes alongside seven-day local backups, with explicit target confirmation, integrity verification, and documented disposable-database recovery.
- [x] Add the first web-first multi-board vertical slice with user-owned boards,
  statuses, cards, archive/restore, path and `BOARD` label relationships, a
  mobile Kanban view, and a date-filtered Gantt view. iOS parity remains a
  later milestone.
- [x] Extend the board slice with shared Kanban/Gantt mutation reconciliation,
  cursor pagination and explicit page retry, stale-response protection,
  ownership/error tests, mobile/desktop Axe coverage, and disposable visual
  evidence.
- [x] Refine the web board: dialog-based board creation, flat single-row
  board tabs, per-column card creation through an optional card-create
  `statusId`, and a per-board settings dialog for the board name, status
  create/rename/reorder/archive, and board archival. Cards open in a flat,
  auto-saving editor (path, priority, status, date range, labels, title, body;
  ⌘/Ctrl+Enter closes) framed by the card's path colour.
- [x] Give every path its own board from birth (V45 backfills existing paths),
  named after the path and with its cards bound to it; a Show on board switch
  in the path edit form hides or shows it after an in-app confirmation. A
  single Manage boards gear opens a Boards dialog that lists every board,
  opens its settings (with a Back button to the list), and pins or
  drag-reorders any board, so custom boards can sit between path boards; board
  tab order stays independent of the Paths page. Merging paths moves board
  cards by status name.
  Acceptance: `docs/path-boards-acceptance-checklist.md`.
- [x] Let each Kanban column sort its cards by priority from a header toggle.
  The sort is stored on the status (V46) and applied by the server to card
  pages, so dense columns stay in order; sorted columns ignore in-column
  reordering. Board cards share the note body formatting, Add board lives in
  the Boards dialog, and untitled cards stay blank.
  Acceptance: `docs/board-column-sort-acceptance-checklist.md`.
- [x] Start a session from a board card: cards on path boards, or with a path,
  show the tracker's play button (the shared `TimerRunButton`) on the card and
  in its editor while no timer runs; it starts a timer for that path with the
  card title as the description.
  Acceptance: `docs/board-card-timer-acceptance-checklist.md`.
- [x] Label board cards with `BOARD` labels from a searchable Vuetify chip
  picker in the card editor footer; cards show one compact, clipped row of
  label chips between the priority and the title.
- [x] Store user preferences on the server: the theme and Kanban width live
  in `user_preferences` (V48) behind `GET/PUT /preferences`, and the tracker's
  recent paths are derived from time entries. The browser keeps only the
  sign-in token and a first-paint cache.
  Acceptance: `docs/user-preferences-acceptance-checklist.md`.
