# OTOTEST-04 — Real-stack and extension journeys

**Priority:** High  
**Status:** Complete
**Dependencies:** OTOTEST-01, OTOTEST-02, OTOTEST-03

## Goal

Use a small set of deployed-shaped browser journeys to prove that important
web and Chrome extension flows work across UI, API, authentication, and
persistence boundaries.

## Web journey tasks

- [x] Select real-stack journeys from documented uncovered risks rather than
  duplicating existing board, timer, search, line-history, and auth-rate-limit
  suites. The first uncovered slice is Notes create/edit/archive/restore,
  asserted through UI, fresh API reads, and reloads in
  `notes.real-stack.acceptance.test.mjs`.
- [x] Add representative create/edit/archive/restore journeys for Notes,
  Paths, Logs, Labels, and Calendar against isolated disposable data.
- [x] Add report filter/range and settings/preferences persistence journeys
  where persistence affects user-visible behavior.
- [x] Add import/export journeys for supported Clockify and Knowledge Base
  transfer flows, including validation and failure recovery.
- [x] Assert server persistence after navigation or reload for selected
  mutation workflows.
- [x] Exercise authentication/session recovery and at least one ownership
  boundary through the browser where it adds evidence beyond API integration
  tests.
- [x] Reuse the disposable Compose conventions and isolated port/credential
  generation from current runners. Cleanup must remain project-scoped.

## Journey workflow and minimum slices

1. Select a high-risk gap from the OTOTEST-01 matrices; record why the slice
   needs browser + real API evidence rather than only a unit/integration test.
2. Seed/reuse only a disposable local account. Use stable test markers, assert
   the user owns created records, and clean only resources created by the run.
3. Exercise the route in a browser: navigate/create, validate a visible
   success, move to another route or reload, then verify persisted state.
4. Exercise one negative/recovery branch in the same suite when practical
   (invalid import, failed save/retry, stale edit conflict, rejected foreign
   resource, or undo). Keep exhaustive boundary combinations in unit/API tests.
5. Prioritize slices: Notes CRUD/format/archive; Paths CRUD/merge/undo;
   Logs CRUD/labels; Labels/history; Calendar day/range labels; Reports date
   filters; Settings preferences/password; Clockify and Knowledge Base
   import/export/undo. Existing board, timer, search, line-history, and
   auth-rate-limit E2E may be linked where the assertion matches.
6. Extension: install the built MV3 artifact, inspect required permissions,
   set local API endpoint, authenticate using disposable credentials, exercise
   popup timer sync plus one options/content-script/service-worker path, then
   verify restart/reconnect and API persistence. Do not log tokens or expose
   browser storage in artifacts.

## Chrome extension tasks

- [x] Define a repeatable Chromium test harness for loading the built
  Manifest V3 extension with a local Knowledge Base API or controlled test
  server. `./scripts/run-extension-browser-e2e.sh` builds the package and runs
  the browser journey against a loopback API fixture.
- [x] Exercise extension build/install/load and verify the manifest, required
  permissions, popup and options entrypoints. Evidence:
  `extension.real-browser.acceptance.test.mjs`.
- [x] Exercise sign-in/configuration, timer start/stop/sync, notes flows, and
  Clockify behavior supported by the current product.
- [x] Verify denied permission recovery through the extension Options module
  tests in `chrome-extension/options.test.js`. The packaged suite covers worker
  restart/reconnect, unavailable API, and expired auth. Browser-native host
  permission prompts are not automated in this Chromium harness.
- [x] Capture browser console errors and fail on unexpected extension/runtime
  errors; keep secrets out of logs and artifacts.
- [x] Run the packaged desktop Chromium extension acceptance journey in the
  required `verify / web-and-extension` job using a fresh temporary profile and
  loopback fixture. Browser-native permission prompt rendering remains manual.
- [x] Keep fast Node module tests as the primary location for exhaustive edge
  cases; browser tests should focus on browser integration and critical
  journeys.

The packaged browser suite runs in the required `verify / web-and-extension`
job and verifies install, manifest permissions, popup and options rendering,
saved API configuration, a Clockify content-script request through the service
worker, signed-in timer start/stop, note creation/editing, expired-session
return to sign-in, recovery UI for an unavailable API, and a fresh packaged
worker after restarting the persistent Chromium profile. Local runs use the
same harness and an isolated temporary profile.
Unexpected console and page errors fail the suite. Denied host-permission
behavior is asserted by the Options module suite; Chromium prompt rendering
remains outside the packaged browser journey.

## Completed browser slices

- **Notes, desktop Chromium:** `creates, edits, archives, restores, and reloads
  a note with persisted API state` in
  `frontend/scripts/notes.real-stack.acceptance.test.mjs`, run with
  `./scripts/run-notes-e2e.sh`. It delays the initial note read to verify the
  title stays unavailable until the saved value has loaded, then checks the
  saved title/body through fresh API reads. It checks the exact Archive
  confirmation, a simulated UI-layer 503 with retained active state and retry,
  active/archive collection membership after archive, and exactly one active
  copy with no archived copy after restore across reloads. The component test
  covers duplicate Restore activation while the request is pending.
- **Notes ownership, mobile-sized Chromium:** `rejects a second browser account
  reading the first user's note` in the same real-stack Notes suite. A second
  disposable account requests the first account's note ID and receives 404.
- **Chrome extension, desktop Chromium:** the packaged popup/options and
  Clockify content-script to service-worker journey in
  `frontend/scripts/extension.real-browser.acceptance.test.mjs`, run with
  `./scripts/run-extension-browser-e2e.sh`.
- **Paths, desktop Chromium:** `creates, edits, removes, restores, and reloads
  a Path with persisted API state` in
  `frontend/scripts/paths.real-stack.acceptance.test.mjs`, run with
  `./scripts/run-paths-e2e.sh`. It verifies the removal confirmation and undo,
  then checks the restored description after reload.
- **Logs, desktop Chromium:** `creates, edits, deletes, and reloads a Log with
  persisted API state` in `frontend/scripts/logs.real-stack.acceptance.test.mjs`,
  run with `./scripts/run-logs-e2e.sh`. The flow confirms deletion before
  removing the entry and checks the API and UI after reload.
- **Labels, desktop Chromium:** `creates, edits, removes, and reloads a Label
  with persisted API state` in
  `frontend/scripts/labels.real-stack.acceptance.test.mjs`, run with
  `./scripts/run-labels-e2e.sh`. It covers confirmation for removing an
  unassigned label and verifies it stays absent after reload.
- **Calendar, desktop Chromium:** `creates, edits, clears, and reloads a
  Calendar day note with persisted API state` in
  `frontend/scripts/calendar.real-stack.acceptance.test.mjs`, run with
  `./scripts/run-calendar-e2e.sh`. It follows a query-selected date and checks
  each state with a fresh range API read.
- **Reports and Settings, desktop Chromium:** `persists report range in
  navigation and theme preference after reload` in
  `frontend/scripts/reports-settings.real-stack.acceptance.test.mjs`, run with
  `./scripts/run-reports-settings-e2e.sh`. It checks report range values via
  the API and URL, and theme preference via local storage, document theme, and
  the Settings control.
- **Transfers, desktop Chromium:** `exports and reimports Knowledge Base CSV,
  validates input, and imports Clockify sessions` in
  `frontend/scripts/transfers.real-stack.acceptance.test.mjs`, run with
  `./scripts/run-transfers-e2e.sh`. It exports a real Path, imports that CSV
  into a second disposable account with a fresh destination ID, and confirms
  the Path through that account's API. It recovers from invalid Clockify JSON,
  imports a Clockify session, and confirms its batch and session through fresh
  API reads.

The extension test restarts the persistent Chromium profile while a timer is
running, confirms the worker reconnects to the same server timer, and stops
the timer. The Options module tests cover denied permission handling;
browser-native prompt rendering remains outside the packaged browser journey.

## Acceptance

- Existing and new real-stack suites run without sharing development or
  production data and clean up only their own resources.
- Journey assertions cover a user-visible result and its corresponding API
  persistence/state.
- Extension acceptance runs against the built artifact in Chromium and
  verifies popup/options plus at least one background/content-script
  integration behavior.
- CI/local commands, required browser binaries, environment settings, and
  artifacts are documented in `docs/testing.md`.
- Desktop and mobile-sized profiles are reported distinctly; emulation is not
  described as physical-device evidence.
- Each selected user-data mutation is confirmed through a fresh page/API read
  after navigation or reload; a toast alone is insufficient.
- At minimum there is one real-stack create/edit/archive-or-restore slice for
  each supported major record domain (Notes, Paths, Logs, Labels, Calendar),
  plus report/filter and settings/preference persistence and both transfer
  formats. If an item is deliberately deferred, the matrix names owner, risk,
  and release decision.
- Extension test loads the packaged build, checks popup and options render,
  validates one background/content integration, and handles unavailable API,
  expired auth, and worker restart without uncaught errors or secret output.
- E2E cleanup is scoped and verified; a failed mid-run test does not leave a
  timer running or mutate shared data.

## Out of scope

The iOS app is inactive, so this milestone adds no native iOS simulator,
device, or backend testing flows.
