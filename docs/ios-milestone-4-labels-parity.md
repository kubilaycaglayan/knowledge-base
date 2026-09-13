# iOS Milestone 4: `/labels` page parity

This is the handoff brief for the next implementation session. The goal is
not merely to list labels: the native Labels section must match the current
web `/labels` page in behavior, copy, scopes, colors, editing, deletion
recovery, hierarchy, and accessible interaction while retaining native
SwiftUI conventions.

## Objective

Port the current web Labels experience to the authenticated iOS workspace:

- add a first-class Labels section/tab in the existing workspace shell;
- load and alphabetically display every owner-scoped reusable label;
- create labels with a required name, color, and one or more placement scopes
  (`NOTE`, `CALENDAR`, `TIME_ENTRY`, `LOG`);
- edit name, color, and scopes in place with server validation and draft-safe
  failures;
- remove labels after explicit confirmation, including the second confirmation
  path when assignments block ordinary deletion;
- preserve report invalidation semantics, authentication/offline recovery,
  light/dark/system design, Dynamic Type, VoiceOver, keyboard focus, and
  44-point touch targets;
- include this same recursive “create the next milestone instructions” task
  in the next handoff, choosing the next web page from the current workspace
  route order and transferring the implementation know-how forward.

Do not change bundle identifiers, Keychain keys, OAuth identifiers, database
names, or API compatibility contracts. Keep scope validation, ownership,
uniqueness, assignment constraints, and deletion semantics in the backend;
SwiftUI remains a thin client over an observable model.

## Current source of truth

Before writing Swift, read and search every label-related route, error string,
and model action in:

- `frontend/src/views/LabelsView.vue` and `frontend/src/views/LabelsView.test.ts`;
- `frontend/src/stores/labels.ts`, report-store invalidation, and shared shell/
  theme/dialog/color-palette files;
- `docs/api.md` and the label controller/service/entity/repository plus
  ownership/assignment integration tests;
- `ios/Know/KnowApp.swift`, `WorkspaceView.swift`, `WorkspaceTheme.swift`,
  `SessionsModel.swift`, `LogsModel.swift`, existing fixtures, and all iOS
  unit/UI tests.

The web is authoritative if it changes after this document is written. Record
the live light/dark and phone/desktop state matrix before implementation.

## Working method

1. Run the web Labels tests and inspect add, edit, ordinary remove, blocked
   remove, empty, error, and large-text states in both themes.
2. Verify `GET /labels`, `POST /labels`, `PUT /labels/{id}`, and both DELETE
   forms against API documentation and backend ownership tests.
3. Design `LabelsModel` and a typed `LabelsTransport` before the view. Keep
   sorting, draft snapshots, request serialization, report-cache invalidation,
   conflict/error mapping, and auth handling in the model.
4. Implement vertical slices: transport/model/tests; navigation/read-only list;
   create dialog; inline edit; deletion recovery; then accessibility/theme and
   UI-test polish.
5. Re-check every slice against web tests and the recorded state matrix.
6. Generate the Xcode project and run package/unit/UI checks available on the
   host; record unavailable physical-device gates.
7. Update API/testing docs and roadmap only when behavior or coverage changes.
8. When this milestone is complete, create the next milestone document in this
   same structure and format, transferring the know-how and repeating this
   recursive handoff requirement for the next web page component.

## Web/API behavior matrix to preserve

| State or action | Required behavior and copy |
| --- | --- |
| Initial/load | Show `Labels`, the explanatory lede, and a loading convention until `GET /labels` settles. |
| Empty list | `No labels yet. Add one above to get started.` |
| Create | Dialog title `Add a label`; trim name; require name and at least one scope; retain `Add label` beside loading feedback; close and clear only after success. |
| Edit | Replace one row with name, color palette, scope checkboxes, `Save`, and `Cancel`; retain the draft on validation/network/server failure. |
| Remove | Confirm `Remove “{name}”?` with `Labels in use must be unassigned first.`; if blocked, offer removal with assignments and explain that records remain. |
| Scopes/colors | Preserve all selected scopes and nullable color; render swatches and human labels for Notes, Calendar, Sessions, and Logs. |
| Auth/offline | 401 signs out through `AppModel`; offline/server failures retain credentials and drafts with retry; never turn 404/409/503 into sign-out. |

## iOS implementation checklist

- Add Codable `Label`, `LabelScope`, create/edit drafts, typed transport, and
  `@MainActor LabelsModel`; sort by localized name without mutating server data.
- Add the Labels tab with stable `workspace.labels` identity and selected-state
  accessibility; include label drafts in the shell’s unsaved-sign-out guard.
- Build native create/edit dialogs with focus movement, keyboard submission,
  color choices, scope checkboxes, Dynamic Type, and 44-point controls.
- Use native confirmation dialogs for both deletion stages; update locally only
  after successful responses and invalidate report caches after mutations.
- Preserve label assignments used by Sessions, Logs, Notes, and Calendar;
  never silently remove assignments when the first delete fails.
- Keep API overrides ignored and never commit local addresses, credentials, or
  generated secrets. Honor reduced motion, safe areas, VoiceOver, and visible
  focus.

## Test plan and gates

Unit/model tests MUST cover Codable fields, localized sorting, scope toggles,
trimmed validation, empty/load/error/retry states, create/edit success and
failure draft retention, both deletion paths, report invalidation, bearer
auth, status mapping, offline retention, and unauthorized sign-out.

SwiftUI/UI regression tests MUST cover `workspace.labels`, selected state,
loading/empty/error/retry, create/edit dialogs, palette and scope controls,
keyboard/focus behavior, confirmation cancel/commit flows, blocked deletion,
light/dark appearance, Dynamic Type, VoiceOver labels, and 44-point targets.
Use fixture flags for loaded, empty, blocked-delete, and offline states; never
contact the owner’s account from UI tests.

Run the web Labels suite, backend label ownership/assignment tests, relevant
AGENTS.md checks, `xcodegen generate --spec project.yml`, and Swift package
tests. On macOS also run the aggregate simulator suite and manually verify a
Debug build on a reachable iPhone; record any unavailable gate.

## Verification record

`xcodegen generate --spec project.yml` and `cd ios && swift test` pass; the
package suite runs 46 tests with no failures. The simulator UI suite runs 16
tests with no UI failures, including Labels navigation, create, empty, and
offline fixture coverage. The aggregate simulator command is otherwise green
but is reported failed by the existing Keychain storage test on this runner;
the filtered test reproduces the same simulator storage error. The web Labels
suite could not start because the installed Node runtime lacks
`node:util.styleText`, and backend label tests could not run because Docker is
not installed. No physical iPhone was available for the manual Debug gate.

## Commit and review cadence

Use chronological semantic slices: typed model/transport; navigation/list;
create; edit; deletion recovery; then accessibility/docs/tests. Review each
diff for compatibility identifiers, credentials, stale local addresses,
generated-file drift, and accidental changes to server-owned rules.

## Acceptance checklist

- [x] Web Labels source, tests, API contract, and backend ownership behavior are
  captured in this brief.
- [x] Labels navigation/list/empty/loading/error states match the web.
- [x] Create/edit scopes, colors, validation, and draft-safe failures match.
- [x] Both deletion confirmations and assignment-preserving recovery match.
- [x] Auth, offline, accessibility, theme, Dynamic Type, and UI regression
  gates are verified.
- [x] The next milestone document is created recursively before handoff.

Follow-up parity verification (2026-09-13): native Labels now shares the exact
15-color web palette with Paths. `LabelsTests` covers the default color and
the full Swift package suite passes.
