# OTOTEST-01 — Web route evidence matrix

**Source revision:** `ce71ce50af11d9b7e8853e65e1a6f9c8cec45245` (`origin/main` baseline)
**Source review:** `frontend/src/main.ts`, page tests, `frontend/scripts/*acceptance*`, `frontend/src/App.vue`
**Inventory reviewer:** Codex source review; maintainer review outstanding.
**Evidence command:** `cd frontend && npm test` (Vitest); browser suites use their named npm scripts. Tests were not run during this inventory milestone.

“Component” means a Vue/Vitest assertion; it does not prove browser history, real API persistence, or visual layout. Rows marked gap have no assertion located for the stated route behavior. `/development` is temporary tooling and excluded from supported route completeness.

| Route / state | Source | Existing evidence | Evidence class | Gap / next evidence |
| --- | --- | --- | --- | --- |
| `/` Sessions | `frontend/src/main.ts`, `views/SessionsView.vue` | `views/SessionsView.test.ts` (`SessionsView`); `scripts/session-tracker.acceptance.test.mjs` | Component; browser | Direct-load, auth recovery, and real persisted journey not established by component test |
| `/sessions` redirect | `frontend/src/main.ts` | No route assertion located | Gap | Assert final URL and Back/Forward behavior |
| `/sessions/:id` | `frontend/src/main.ts`, `views/SessionsView.vue` | `views/DeepLinks.test.ts` | Component | Unknown/foreign ID and browser direct-load behavior need explicit assertions |
| `/paths` | `views/PathsView.vue` | `views/PathsView.test.ts` | Component | Real persistence and keyboard reorder behavior not established |
| `/paths/:id` | `frontend/src/main.ts`, `views/PathsView.vue` | `views/DeepLinks.test.ts` | Component | Unknown/foreign ID direct-load behavior needs explicit assertion |
| `/timeline` | `views/TimelineView.vue` | `views/TimelineView.test.ts` | Component | Query/history and real API failure behavior need explicit assertion |
| `/logs` | `views/LogsView.vue` | `views/LogsView.test.ts` | Component | Browser direct-load and persisted CRUD journey not established |
| `/logs/:id` | `views/LogsView.vue` | `views/DeepLinks.test.ts` | Component | Unknown/foreign ID direct-load behavior needs explicit assertion |
| `/reports` with query | `views/ReportsView.vue`, `main.ts` | `views/ReportsView.test.ts`, `components/reports/ReportDateRange.test.ts` | Component | Router history behavior and full reload semantics lack browser assertion |
| `/calendar` | `views/CalendarView.vue` | `views/CalendarView.test.ts` | Component | Touch range selection and persisted browser journey need assertion |
| `/imports` | `views/ImportsView.vue` | `views/ImportsView.test.ts` | Component | Import history/undo through browser and API not established |
| `/settings` | `views/SettingsView.vue` | `views/SettingsView.test.ts` | Component | Preference persistence across real reload needs assertion |
| `/labels` | `views/LabelsView.vue` | `views/LabelsView.test.ts` | Component | Browser history and persisted CRUD journey not established |
| `/labels/:id` | `views/LabelsView.vue` | `views/DeepLinks.test.ts` | Component | Unknown/foreign ID and related-record browser navigation need assertion |
| `/board` and query selection | `views/BoardView.vue` | `views/BoardView.test.ts`, `scripts/board.acceptance.test.mjs`, `scripts/board.real-stack.acceptance.test.mjs` | Component; browser; real stack | All boards/Gantt and direct-load fallback evidence should be mapped per behavior in later milestones |
| `/board/archive` and query focus | `views/BoardArchiveView.vue` | `views/BoardArchiveView.test.ts` | Component | Browser restore and query deep-link behavior need assertion |
| `/notes` with `archived`, `q` | `views/NotesView.vue` | `views/NotesView.test.ts` | Component | URL/history restoration and persisted browser flow need assertion |
| `/notes/:id` | `views/NotesView.vue` | `views/NotesView.test.ts` (`NotesView`); no direct route assertion confirmed | Component candidate; route gap | Missing/foreign/archived direct-load behavior needs an explicit route assertion |
| `/development` | `views/DevelopmentView.vue` | `views/DeepLinks.test.ts` (route exclusion/navigation assertion) | Component; excluded | Temporary label-picker tooling; excluded from supported product routes; keep navbar exclusion assertion |
| Shared authenticated shell | `frontend/src/App.vue` | `App.test.ts`, `components/GlobalSearch.test.ts`, `components/AppSnackbar.test.ts`, `components/FloatingTimeTracker.test.ts`, `scripts/nav-shell.acceptance.test.mjs` | Component; browser | Inventory each control/keyboard/focus/mobile state in the control matrix; logged-out direct-link behavior needs named browser evidence |

## Update rule

When a route, redirect, query contract, or deep-link behavior changes, update this row and the feature/control row in `01-control-matrix.md` in the same change. Record the exact test declaration and command; do not infer coverage from a filename.
