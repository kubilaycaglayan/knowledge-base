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
