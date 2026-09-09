# Knowledge Base UI roadmap

- [x] Preserve sign-in across deployment outages and API recreation, keep error
  dispatches from causing false sign-outs, and verify token continuity in smoke tests.

- [x] Establish the approved flat Overview design.
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

Continue applying these foundations to future web features. Native iOS and
extension design work remains outside this web redesign; their API contracts,
compatibility identifiers, and server-owned timer rules remain unchanged.
