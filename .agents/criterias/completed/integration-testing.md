write full integration tests for every completed criteria in this repository

## Coverage audit

Completed criteria with current integration-style evidence:

- add-google-auth: backend API tests cover valid/invalid Google identity handling; AuthView test covers GIS credential callback posting `{ idToken }` to `/auth/google`; smoke rejects invalid Google tokens.
- addable-item-types: backend integration and smoke create/update supported item types; ItemsView test verifies type options and submit payload.
- bug-import-batches: smoke applies V1-V9 migrations to a temporary PostgreSQL database, seeds legacy imported rows, runs V10, and verifies batches, entries, and activities are linked.
- bug-imported-clockify-sessions-repeating-time: backend integration imports multiple entries with distinct intervals and verifies time-entry history durations; smoke imports and undoes Clockify entries.
- clean-code-principles: repo readability audit verifies Java, web, extension, script, and Swift source files avoid very long compressed lines; backend Java, extension scripts, smoke, and iOS sources have been reformatted to satisfy the gate.
- cleanup-after-smoke: cleanup contract checks scoped Compose, image, Buildx, and temp backup cleanup; smoke exercises the cleanup trap.
- editable-paths: backend integration updates path name, description, and color; PathsView test verifies inline edit payload.
- feature-item: DashboardView test creates a new item from the session flow, reloads items, and selects the new item.
- history-clicks: PathsView test expands history inside the selected path card and renders imported session detail there.
- hot-reloading: security/development contract checks Vite `0.0.0.0:5177`, strict port, API proxy, and documented SSH forwarding guidance.
- implement-reports-page: backend integration covers week/month/year report responses; ReportsView test renders daily timeline with path/resource categories.
- integrate-clockify: backend integration and smoke import Clockify JSON, create missing paths, and enforce duplicate external IDs.
- interactive-timer: backend integration covers running timer path/start/description configuration; DashboardView test keeps active timer controls visible and sends the PUT update.
- items-source: backend integration and smoke persist/edit item source; ItemsView test submits source from the UI.
- paths-have-colors: backend integration validates default/custom colors and invalid hex; PathsView test selects a palette color.
- pop-the-recent-up: backend integration verifies path list order after recent use; smoke checks used path order in deployed-shaped API.
- reactivity-bug: DashboardView tests reload item choices after session-flow item creation and reload recent time entries after stopping a timer.
- reports-improve: ReportsView test verifies graph SVG bars and accessible day bars; security/accessibility contracts cover report UI prerequisites.
- session-start-dialog: DashboardView test verifies the first rendered section is the session grid with focus controls.
- tracked-session-information: DashboardView test verifies recent entries show path name and shortened description.
- undoable-imports: backend integration and smoke list import batches and undo a batch; ImportsView test covers list and undo UI.

Remaining weak evidence:

- None identified in the current audit.

## Proof

- afeac1b Add backend integration coverage for completed criteria
- 48b7838 Make Google auth security check quote agnostic
- 5de5f61 Make activity filtering portable for smoke tests
- 6f56664 Cover Google credential sign-in flow
- 0fb1954 Assert hot reload development contract
- 30eed18 Cover legacy Clockify batch backfill in smoke
- 791e649 Cover dashboard timer stop refresh
- 36b4f83 Cover report year period selection
- 2200f30 Format backend Java sources
- b4ca6a0 Add readability coverage for clean code criterion
- fe089ac Complete integration testing criterion
- 7138fbf Record integration testing proof commits
