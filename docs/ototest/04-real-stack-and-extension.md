# OTOTEST-04 — Real-stack and extension journeys

**Priority:** High  
**Status:** Proposed  
**Dependencies:** OTOTEST-01, OTOTEST-02, OTOTEST-03

## Goal

Use a small set of deployed-shaped browser journeys to prove that important
web and Chrome extension flows work across UI, API, authentication, and
persistence boundaries.

## Web journey tasks

- [ ] Select real-stack journeys from documented uncovered risks rather than
  duplicating existing board, timer, search, line-history, and auth-rate-limit
  suites.
- [ ] Add representative create/edit/archive/restore journeys for Notes,
  Paths, Logs, Labels, and Calendar against isolated disposable data.
- [ ] Add report filter/range and settings/preferences persistence journeys
  where persistence affects user-visible behavior.
- [ ] Add import/export journeys for supported Clockify and Knowledge Base
  transfer flows, including validation and failure recovery.
- [ ] Assert server persistence after navigation or reload for selected
  mutation workflows.
- [ ] Exercise authentication/session recovery and at least one ownership
  boundary through the browser where it adds evidence beyond API integration
  tests.
- [ ] Reuse the disposable Compose conventions and isolated port/credential
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

- [ ] Define a repeatable Chromium test harness for loading the built
  Manifest V3 extension with a local Knowledge Base API or controlled test
  server.
- [ ] Exercise extension build/install/load and verify the manifest, required
  permissions, popup and options entrypoints.
- [ ] Exercise sign-in/configuration, timer start/stop/sync, notes flows, and
  Clockify behavior supported by the current product.
- [ ] Verify service-worker restart/reconnect behavior and errors from denied
  permissions or unavailable API dependencies where feasible.
- [ ] Capture browser console errors and fail on unexpected extension/runtime
  errors; keep secrets out of logs and artifacts.
- [ ] Keep fast Node module tests as the primary location for exhaustive edge
  cases; browser tests should focus on browser integration and critical
  journeys.

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
