# iOS Milestone 6: Paths parity

Reference captured on 2026-09-13. The visual and behavioral source of truth is
`frontend/src/views/PathsView.vue`, `frontend/src/views/PathsView.test.ts`,
`frontend/src/stores/paths.ts`, the shared workspace theme, and the authenticated
mobile-web rendering. The API source of truth is `docs/api.md` and
`backend/src/main/java/com/know/api/PathController.java`.

The current native `PathsView` is a legacy list/create scaffold in
`ios/Know/KnowApp.swift`. Milestone 6 replaces that scaffold with a native
workspace implementation. Existing `Know` target paths, bundle identifiers,
Keychain identifiers, API version, and persisted appearance settings remain
compatible.

## Acceptance checklist

- [x] Native Paths section uses the shared workspace shell, flat surfaces,
  spacing, typography, colors, light/dark/system appearance, safe areas, and
  Dynamic Type behavior already established by Sessions, Logs, Labels, and
  Notes.
- [x] The page has the `Organize` eyebrow, “Your paths” heading, supporting
  copy, accessible add-path control, loading state, recoverable load error,
  empty state (“Your first path is waiting to be named.”), and resilient layout
  for long names and descriptions.
- [x] Path rows show the color marker, name, backend activity label (`today`,
  `this week`, `this month`, or `passive`), description or “No description yet”,
  and History/Edit actions. Links in descriptions are safe external links with
  an accessible name and no unsafe URL interpolation.
- [x] Add path presents a focused, keyboard-operable form with required name,
  optional description, shared color palette, cancel, submit, inline error,
  retained draft on failure, loading feedback that preserves the action label,
  and a minimum 44-point control target. Name and description are trimmed as
  appropriate; password or credential rules do not apply to these fields.
- [x] Inline editing supports name, description, and color; Enter submits,
  Escape/cancel restores the row, blank names surface validation, errors retain
  the draft, and save refreshes the row and any open summary.
- [x] Active paths offer confirmed removal. A successful delete removes the row
  immediately, invalidates dependent summaries/reports, closes its history, and
  exposes an accessible status message with an 8-second Undo action. Undo calls
  restore, reinserts the path, and has a recoverable failure state. Archived or
  otherwise inactive paths do not offer removal.
- [x] Merge is available from edit mode and excludes the source path. The native
  chooser supports search, selection, cancellation, confirmation, loading and
  failure states. Confirmation clearly states that all sessions move and the
  source is removed. A successful merge refreshes paths and invalidates reports;
  no client-side session reassignment is attempted.
- [x] History opens one modal at a time, loads the selected path summary on
  demand, traps/manages focus, supports Close/Escape and VoiceOver, reports
  server-computed total tracked time including a running timer, and shows the
  latest 50 activity records grouped by local Today/Yesterday/Last week/This
  month/Last month/date labels.
- [x] History filters the same timer-start/timer-stop pair into one tracked
  activity, renders duration from the server-backed record, description/detail,
  time, TIME_ENTRY labels including removed-label fallbacks, and an Edit session
  action when `timeEntryId` is present. Empty history and summary-load errors
  offer clear recovery.
- [x] Session editing launched from history preserves the existing Sessions
  editor contract: owned path selection (including Unassigned), multiple owned
  TIME_ENTRY labels, description, source, start/end validation, server duration
  rules, retained draft on rejection, and unsaved-change protection. Saving
  refreshes the open path summary and invalidates report data.
- [x] All reads, writes, summary requests, merges, deletes, restores, and linked
  session edits are authenticated and ownership-scoped. A 401 expires the
  current session through the existing AppModel path; offline and 5xx errors
  preserve the token and expose retry. Stale work must not overwrite a newer
  path selection or sign out a replacement session.
- [ ] Navigation, focus, buttons, dialogs, labels, status/error announcements,
  contrast, reduced motion, VoiceOver names, keyboard/Return behavior, and
  touch targets meet the repository accessibility rules. No important state is
  conveyed by color alone, and native controls remain usable at the largest
  tested Dynamic Type size.
- [ ] Add model/API tests, native view tests, and simulator UI coverage for
  light/dark/system appearance, small and large iPhones, empty/loading/offline/
  rejection states, edit/remove/undo/merge/history flows, long content, large
  text, focus recovery, and sign-out/expired-auth behavior.
- [x] Update `docs/api.md`, `docs/roadmap.md`, `ios/README.md` where behavior or
  supported native sections changes, and record web reference, Swift package,
  simulator, accessibility, and smoke evidence in this document.

## API contract and invariants

All paths endpoints use `/api/v1` and the bearer token:

| Action | Request | Response / behavior |
| --- | --- | --- |
| List | `GET /paths` | Up to 100 owner-scoped paths, newest update first; each includes `id`, `name`, nullable `description`/`color`, `status`, `activityLabel`, `createdAt`, and `updatedAt`. |
| Create | `POST /paths` with `name`, optional `description`, six-digit hex `color` | `201` and the created path. Name is required and max 160 characters; description max 2000. |
| Read | `GET /paths/{id}` | One owned path with its computed activity label. |
| Summary | `GET /paths/{id}/summary` | Owned path, accumulated tracked seconds including a running timer, and at most 50 recent activity records. |
| Update | `PUT /paths/{id}` with the same path request | Updated owned path; server recomputes `activityLabel`. |
| Remove | `DELETE /paths/{id}` | `204`; soft-deletes the path and preserves historical references. |
| Restore | `POST /paths/{id}/restore` | `204`; owner-scoped restore of a removed path. |
| Merge | `POST /paths/{id}/merge` with `{ "targetPathId": "<owned UUID>" }` | `204`; atomically moves every source-path session to the target and soft-deletes the source. |

The backend is authoritative for activity labels, ownership, merge atomicity,
timer duration, and the one-running-timer invariant. A path cannot merge into
itself. Archived paths remain readable for history but cannot receive new time
entries. A client must not infer or rewrite tracked duration locally.

Summary activity records may represent sessions and ordinary activities. The
web reference removes duplicate `TIMER_STARTED` records when a corresponding
`TIMER_STOPPED` record exists, removes timer bookkeeping records from the
visible history, and derives a single session display from `timeEntryId`.
Native formatting must preserve the record’s instant and use locale-aware
display while grouping consistently with the existing Sessions and Logs
formatters.

## Native structure

Keep path concerns out of `AppModel` beyond shared authenticated refresh and
session expiry. Introduce a `PathsModel`, transport protocol, API transport,
and isolated UI-testing fixture following the established Logs, Labels, Notes,
and Sessions patterns. The model owns loading, drafts, cached summaries,
mutation serialization, undo expiry, and error/retry state. `WorkspaceView`
injects the model and keeps the existing `workspace.paths` navigation identifier.

Reuse `Path`, `Activity`, shared color palette, `WorkspaceTheme`, dialog/focus
patterns, and the existing session editor where their contracts already match.
Extend Codable models only additively for `activityLabel`, timestamps, summary
activity labels, and any fields needed by the API response. Do not rename legacy
packages, targets, paths, database identifiers, or Keychain identifiers.

## Reference verification

The existing web suite covers path history/summary, session editing from
history, cached list loading, activity labels, URL links, color selection,
inline edit, merge search/confirmation/cancellation, removal/undo, inactive
path behavior, empty and failure states, and cancellation safety in
`frontend/src/views/PathsView.test.ts`. Re-run the focused suite with the Node
26 isolated-localStorage setup documented in `docs/ios-auth-state-matrix.md`,
then capture representative light/dark screenshots at compact and regular
widths before comparing native output.

Completion requires evidence for every checked item above. Source inspection or
passing model tests alone does not prove visual, accessibility, simulator, or
physical-device parity. Do not claim physical-device verification unless an
iPhone flow has actually been run; do not claim live Google verification as part
of this milestone.

## Verification log

- Baseline inspection on 2026-09-13: web Paths behavior was implemented and
  covered by `PathsView.test.ts`; native Paths has now been replaced with the
  Milestone 6 implementation described above.
- Baseline API inspection on 2026-09-13: path list, CRUD, soft-delete/restore,
  merge, and summary endpoints are owner-scoped in `PathController`; merge is
  transactional in `PathManagementService`.
- Swift package verification on 2026-09-13: 66 tests passed, including the
  Paths model tests for load/create/update, remove/undo/merge, validation, and
  offline recovery.
- Swift package verification on 2026-09-13: focused Paths API transport coverage
  passed, including bearer authentication, create/update/delete/restore/merge
  paths, and the merge target request body.
- XcodeGen simulator build and focused iPhone 17 Pro UI verification on
  2026-09-13: `testAuthenticatedWorkspaceControlsAreReachable`,
  `testPathsHistoryAndEditControlsAreReachable`, and
  `testPathsEmptyAndOfflineFixturesOfferRecovery` passed with parallel testing
  disabled. The known Xcode LLDB debugger-store warning was emitted, but no UI
  assertion failed.
- Swift package verification on 2026-09-13: all five `PathsTests` passed,
  including 5xx retry-state and 401 session-expiry callback behavior.
- XcodeGen simulator verification on 2026-09-13: merge confirmation/removal
  Undo and accessibility text-size paths passed with parallel testing disabled.
- 2026-09-13: path loading now clears only for the current load revision, and
  the removal Undo banner exposes an accessible eight-second recovery message;
  the focused Paths package tests remain green.
- 2026-09-13: focused iPhone 17 Pro UI accessibility case passed for selected
  Paths navigation, add/history/edit/remove accessible names, and button
  hittability. Full VoiceOver and contrast review remains open.
- 2026-09-13: repository accessibility contract passed all 38 checks after
  updating its native Paths source-location expectations; security, cleanup,
  shell syntax, and the full 57-test Swift package suite also passed.
- 2026-09-13: native Paths and Labels editors now consume the exact 15-color
  web shared palette, with a unit test preventing future palette drift. Focused
  Paths workspace and Dynamic Type simulator tests passed afterward.
- Full visual, VoiceOver, large Dynamic Type, backend integration, smoke, and
  physical-device evidence remains open.
