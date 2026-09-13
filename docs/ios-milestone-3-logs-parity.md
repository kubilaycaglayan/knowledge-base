# iOS Milestone 3: `/logs` page parity

This is the handoff brief for the next implementation session. The goal is
not merely to display a list of logs: the native Logs section must match the
current web `/logs` page in behavior, copy, grouping, editing, labels,
concurrency recovery, hierarchy, and accessible interaction while retaining
native SwiftUI conventions.

## Objective

Port the current web logs experience to the authenticated iOS workspace:

- add a first-class **Logs** section/tab in the existing workspace shell;
- load the signed-in user’s complete, newest-first log list and reusable
  `LOG`-scoped labels;
- group entries using the web’s local-calendar rules (`Last hour`, `Today`,
  `Yesterday`, Monday-based `This week`/`Last week`, month groups), with the
  same hour/day visual separators and timestamp hierarchy;
- create an untitled text log with a required client timestamp, a clock-following
  default, manual timestamp override, drift indication, keyboard submission,
  loading feedback, and draft-safe success/failure behavior;
- edit both body and occurrence timestamp in place, including the web’s
  optimistic-concurrency recovery when another window/device saves first;
- permanently remove a log only after an explicit confirmation;
- assign and unassign one or more existing `LOG` labels, including the empty
  label-catalog state, label-menu dismissal, swatches, and assignment errors;
- preserve authentication/session behavior: owner scoping, 401 sign-out,
  offline/server-error credential retention, retry, and unsaved drafts;
- match the approved light/dark/system workspace design on small and large
  iPhones, Dynamic Type, VoiceOver, keyboard focus, safe areas, and 44-point
  touch targets.

Do not change bundle identifiers, Keychain keys, OAuth identifiers, database
names, or API compatibility contracts. Keep log validation, ownership,
ordering, persistence, and version checks in the backend/API layer; SwiftUI
views should remain thin clients over an observable model.

## Current source of truth

Before writing Swift, read these files and search for every log-related route,
error string, and model action:

- `frontend/src/views/LogsView.vue` and `frontend/src/views/LogsView.test.ts`;
- `frontend/src/stores/logs.ts`, `frontend/src/stores/labels.ts`, and the
  shared shell/theme files (`frontend/src/App.vue`, `frontend/src/theme.css`,
  `frontend/src/dashboard-shell.css`);
- `docs/api.md` and `backend/src/main/java/com/know/api/LogController.java`;
- `backend/src/main/java/com/know/service/LogService.java`, `Log.java`,
  `LogRepository.java`, and the `logsAreOwnedTimestampedAndOptimisticallyEditable`
  integration test in `KnowIntegrationTest.java`;
- the existing iOS architecture in `KnowApp.swift`, `WorkspaceView.swift`,
  `SessionsModels.swift`, `SessionsModel.swift`, `SessionsView.swift`,
  `WorkspaceTheme.swift`, and the `KnowTests`/`KnowUITests` fixtures.

The web is authoritative if it changes after this document is written. Do not
copy a screenshot and infer behavior that is already expressed by the source
and tests.

## Working method

1. Run the web Logs tests and inspect `/logs` in light and dark themes at a
   desktop width and a phone-sized width. The development web app is already
   available at `http://localhost:3000`; use it as a live design reference
   (with a disposable/local account) for spacing, typography, responsive
   behavior, and interaction details. Record the state matrix below, then
   update it if the web has changed.
2. Verify the API contract and ownership behavior against the backend test.
   Logs are not paginated: `GET /logs` returns the owner’s complete list,
   sorted by `occurredAt DESC, id DESC`.
3. Design the Swift model/transport boundary before the view. A model should
   own loading, polling/refresh, drafts, request serialization, sorting,
   label assignment, conflict retry, and user-facing errors. The view should
   render state and send intent.
4. Implement in vertical slices: models/API and unit tests; workspace
   navigation plus read-only timeline; composer/create; inline edit/delete;
   labels; then parity/accessibility polish and UI tests.
5. Re-check every slice against the web tests and state matrix. Keep entered
   text and timestamps when a request fails or a background refresh completes.
6. Exercise the real phone against the Ubuntu development backend before
   handoff. The phone must use the Ubuntu host address, never `localhost`.
7. Update API/testing documentation and `docs/roadmap.md` only when behavior
   or verification coverage changes. Commit coherent slices and review each
   diff for generated files, credentials, stale local addresses, or accidental
   compatibility-identifier changes.

## Web/API behavior matrix to preserve

| State or action | Required behavior and copy |
| --- | --- |
| Initial load | Composer is available while `/logs` and `/labels?scope=LOG` load. Do not show the settled empty state until both requests settle. The current web page has no separate loading sentence; use the existing iOS loading convention without changing settled copy. |
| Loaded list | Render logs newest first. Consecutive entries share a group heading. A group crossing a local day gets a day-break rule; entries crossing a local hour get an hour-break rule. |
| Empty list | `No logs yet. Capture a thought above.` |
| Log-load failure | `Unable to load logs. Please try again.` with an accessible retry action. Label-load failure is separate: `Unable to load log labels. Please try again.` |
| New-log draft | Body is untitled free text. Timestamp starts at the device’s current local minute and follows the clock until the user edits it. A manually changed value remains fixed; if it drifts more than 60 seconds, expose the reset action (`Use browser time` on web; use device-time wording on iOS). |
| Create | Return/submit sends `POST /logs` with `{body, occurredAt}` where `occurredAt` is an ISO-8601 UTC instant. Ignore blank-only submits as the web does; the server trims valid body text and enforces nonblank/max 20,000 characters. Disable only after the request starts, retain the `Save` label beside a spinner, and clear/reset the composer only if the user did not change it while saving. Announce `Log saved.` politely. |
| Group headings/times | Group labels follow the web’s local `Date` calculations: `Last hour` takes priority, then `Today`, `Yesterday`, Monday-based `This week`, `Last week`, `This month`, `Last month`, or localized `MMMM yyyy`. In `Last hour`/`Today`, show `HH:mm`; older groups show abbreviated month/day plus `HH:mm` (for example `Sept 10 11:00` in the web’s `en-GB` formatter). Use an explicit local calendar/time zone and support fractional or whole-second ISO strings. |
| Inline edit | Edit controls replace one row with a datetime input, body text area, `Save`, and `Cancel`. Save both body and timestamp; do not lose the draft on validation, network, or server failure. Close edit mode only after a successful response and only if the draft still equals the submitted snapshot. |
| Concurrent edit | Send the row’s `version` in `PUT /logs/{id}`. On HTTP 409 (`Log changed in another window`), fetch `GET /logs/{id}` and retry the same local snapshot with the latest version. Never replace the user’s draft with the fetched body. If the retry fails, keep edit mode and show `Unable to save this log. Your text is still here; try again.` |
| Delete | Ask `Remove this log? This cannot be undone.` before `DELETE /logs/{id}`. Remove it locally only after a successful response. On failure show `Unable to remove this log. Please try again.` |
| Labels available | Fetch `GET /labels?scope=LOG`. If no labels exist, omit the row label control. Otherwise expose a label chooser with a checkbox per label, color swatches, close button, Escape/outside-tap dismissal, and an active visual when a log has assignments. |
| Label mutation | `PUT /logs/{id}/labels` receives the complete next `{labelIds:[UUID]}` set, not a delta. The response is authoritative; update only that row’s assignments. Serialize/disable duplicate toggles while saving. On failure show `Unable to update this log’s labels. Please try again.` |
| Auth/offline | Every request is bearer-authenticated and owner-scoped by the server. A current-token 401 signs out through the existing `AppModel` path. Offline/server failures retain the token, entered text, and edit draft and expose retry. Do not convert a 404/409/503 into a false sign-out. |

## API contract and implementation notes

The API root remains `/api/v1`; `APIClient` already appends that root and
adds the bearer token. Add Codable request/response types rather than passing
untyped view dictionaries around:

| Endpoint | Request | Response/notes |
| --- | --- | --- |
| `GET /logs` | — | `[Log]`, newest first by `occurredAt`, then `id`; fields are `id`, `body`, `occurredAt`, `labelIds`, `createdAt`, `updatedAt`, `version`. |
| `GET /logs/{id}` | — | One owner-scoped `Log`; used only for 409 recovery. |
| `POST /logs` | `body: String`, `occurredAt: Instant` (required) | 201 and the saved `Log`; server trims body and assigns id/version/timestamps. |
| `PUT /logs/{id}` | `body`, `occurredAt`, optional `version` | 200 and the saved `Log`; 409 if the supplied version is stale. |
| `PUT /logs/{id}/labels` | `{ "labelIds": [UUID] }` | 200 and the saved `Log`; the list replaces assignments and every id must be an owned `LOG` label. |
| `DELETE /logs/{id}` | — | 204; permanent delete, owner-scoped. |
| `GET /labels?scope=LOG` | — | Available reusable labels with `id`, `name`, nullable `color`, and scopes. Label creation/editing stays in the Labels section; Logs only assigns existing labels. |

The current `APIClient.send` collapses non-2xx responses into a generic
`URLError`, so it cannot reliably distinguish 409 from offline or 401. Extend
the shared client with a typed HTTP/status error (and, where safe, the server
message) while preserving its existing GET retry behavior and unauthorized /
offline handling. Match existing `APIError` call sites so Sessions and auth do
not regress. A typed conflict is safer than matching a localized error string.

Use an ISO-8601 formatter that accepts both fractional and whole seconds and
always serializes UTC. Keep server ordering deterministic after create/update:
sort by occurrence descending and UUID descending, matching the repository;
do not merely prepend an edited older log.

Do not reuse `SessionFormatting.group` unchanged: it intentionally omits some
of the web log groups. Give logs a dedicated formatter that implements the
web’s `Last hour` priority, Monday week boundary, local day/hour comparisons,
and localized month fallback. Use `LazyVStack` for a long timeline and keep
body text wrapping/breaking resilient to very long or multiline content.

## iOS implementation checklist

- Add `Log`, `LogLabel`, draft, formatter, transport protocol, and an
  observable `LogsModel` in the same thin-client style as Sessions. Keep the
  model `@MainActor`; invalidate stale completions after sign-out or a newer
  load, and never let refresh overwrite a row currently being edited.
- Add `LogsAPI` methods for every endpoint above. Pass the current app token;
  route 401 through the existing `unauthorized` closure. Treat 409 as a
  conflict, not as offline.
- Load logs and `LOG` labels concurrently. Expose `loading`, `loaded`,
  `busy/saving`, `error`, selected label menu state, and a draft/edit state
  explicitly. Provide pull-to-refresh and refresh on workspace activation;
  if periodic refresh is added to match the web’s 15-second visible refresh,
  pause it while editing and cancel it when inactive.
- Add the Logs tab to `WorkspaceView` with a stable identifier such as
  `workspace.logs`, selected-state accessibility, and the same shell spacing,
  theme, safe-area, sign-out confirmation, and max-width rules as Sessions.
  Include log editing in the shell’s “unsaved changes” guard before sign-out.
- Build the composer with a multiline `TextField`/`TextEditor`, a local
  `DatePicker` for the occurrence time, and a clearly labeled Save button.
  Use `@FocusState`, Return/keyboard submission, `textContentType` only where
  meaningful, Dynamic Type, and a minimum 44-point hit area. Keep the
  timestamp-following clock interruptible and provide a reset button when the
  user has diverged from device time.
- Render headings, timestamps, bodies, label chips/menu, edit controls, and
  destructive delete controls with accessible names. Icon-only buttons need
  labels; status/errors use VoiceOver announcements or polite live semantics;
  focus the first actionable error where practical.
- Make edit mode draft-safe. Snapshot body/timestamp/version at submit time,
  disable duplicate saves while retaining the original label, retry a 409
  with the latest version, and close only after the saved snapshot is applied.
- Use a native confirmation dialog for deletion with a destructive action and
  cancel. Do not remove the row optimistically unless there is a recoverable
  undo path; the web waits for the 204.
- Present existing `LOG` labels using native controls (a sheet/popover/menu is
  acceptable) while preserving checkbox semantics, color swatches, active
  state, Escape/dismiss behavior, and full-set replacement requests. Do not
  add label creation to Logs unless the web adds it.
- Honor `prefers-reduced-motion`, light/dark/system tokens from
  `WorkspaceTheme`, visible focus, Dynamic Type, VoiceOver, keyboard dismissal,
  long/multiline text, and iPhone safe areas. Use native semantics instead of
  custom gesture-only controls.
- Keep local API overrides in ignored `ios/Local.xcconfig` or the supported
  `KNOW_API_URL` environment variable. For the user’s Ubuntu dev backend,
  configure `http://<ubuntu-host>:8080/api/v1`, ensure Spring/Docker publishes
  port 8080 on the LAN (`0.0.0.0`), allow the port through the Ubuntu firewall,
  and keep the phone and server on the same reachable network. Never commit a
  real host address, token, or password.

## Test plan and gates

Write tests with each vertical slice. Use stable accessibility identifiers,
not pixel coordinates or localized visible strings alone.

Unit/model tests MUST cover:

- Codable decoding/encoding of fractional and whole-second timestamps,
  trimming/nonblank handling, deterministic newest-first sorting, and every
  grouping boundary (last hour, today, yesterday, Monday week, month);
- initial load success, empty list, log-load failure/retry, label-load failure,
  refresh while idle, and refresh that does not overwrite an active edit draft;
- create success, loading/duplicate-submit protection, a changed draft while
  the request is in flight, server validation failure, and offline failure;
- edit success for body plus timestamp, cancel, draft retention after failure,
  typed 409 → GET latest → PUT latest-version retry, failed retry, and a 404
  or unauthorized response without corrupting another session;
- delete confirmation intent, successful removal, failed removal, and label
  assignment replacement (including empty and duplicate ids);
- transport request paths, HTTP methods, JSON bodies, bearer token use, and
  status/error mapping. Keep existing auth and Sessions APIClient tests green.

SwiftUI/UI regression tests MUST cover:

- `workspace.logs` navigation and selected state, loading/empty/error/retry,
  long/multiline body rendering, group headings and separators;
- composer typing, Return submission, clock-follow/reset behavior, save
  spinner, success announcement, and draft retention;
- inline edit of body and timestamp, cancel, save/error/conflict recovery,
  deletion confirmation/cancel/commit, and labels with no labels, one label,
  multiple labels, active checkboxes, and dismissal;
- small-phone layout, keyboard avoidance/dismissal, light/dark appearance,
  Dynamic Type accessibility size, VoiceOver labels/traits, focus rings, and
  44-point controls. Add fixture flags for loaded, empty, and offline states
  without making a UI test contact the owner’s account.

Run the web `LogsView` tests as the reference suite and the backend integration
test for ownership, labels, ordering, optimistic updates, and deletion. On a
macOS host, generate the Xcode project, run package/unit tests, build and run
the aggregate simulator UI suite, then install Debug on an iPhone and verify
the Ubuntu `:8080` flow manually. Run the relevant checks from `AGENTS.md`
(backend, frontend build/tests, accessibility/security/smoke, shell syntax,
and available iOS checks), and record any check unavailable on the host.

## Commit and review cadence

Commit regularly in chronological and semantic order: each commit should
represent the next coherent slice of work, build on the preceding slice, and
use a subject that describes the behavior it adds. Do not mix unrelated auth,
icon, generated-project, or local-environment changes into a Logs commit, and
do not wait for the whole milestone. Recommended sequence:

1. this handoff/API notes and the log state matrix;
2. typed API errors, log models/transport, formatters, and unit tests;
3. workspace Logs navigation, read-only timeline, fixtures, and UI tests;
4. composer/create and draft-safe loading/error behavior;
5. inline editing, version-conflict recovery, deletion, and tests;
6. scoped labels, accessibility/theme/responsive polish, docs/roadmap, and
   final simulator/physical-device verification.

Each commit should build and leave relevant tests green where practical.
Review for accidental changes to `com.know.ios`, Keychain services, OAuth
settings, generated Xcode files, local IPs, secrets, and server-owned rules.

## Acceptance checklist

- [x] Current web Logs source, tests, API contract, and backend ownership test
  are captured in this brief.
- [x] `docs/roadmap.md` links this milestone as the next iOS workspace item.
- [x] Logs tab/navigation and selected state match the workspace shell.
- [x] Loading, empty, populated, error, retry, offline, and expired-session
  states are safe and accessible.
- [x] Group headings, local timestamps, hour/day separators, ordering, and
  long/multiline text match the web behavior.
- [x] Composer create flow, draft retention, clock reset, inline edit, typed
  conflict recovery, delete confirmation, and LOG-label replacement are
  implemented in the shared iOS model/transport boundary.
- [x] Swift package tests cover the Logs model and formatter; Xcode project
  generation succeeds. Physical-device and aggregate simulator verification
  remain host/device gates when available.
- [x] Create flow follows the device clock, supports manual time, submits on
  Return, preserves drafts, and reports success/failure correctly.
- [x] Inline body/timestamp editing, version-aware conflict retry, and draft
  retention are implemented and tested.
- [x] Deletion requires confirmation and only removes the row after 204.
- [x] Existing owned `LOG` labels can be assigned/unassigned with full-set
  replacement, color cues, dismissal, and error recovery.
- [ ] Light/dark/system themes, Dynamic Type, VoiceOver, keyboard/focus,
  reduced motion, safe areas, and 44-point targets are verified.
- [ ] Web reference, backend integration, model/unit, simulator UI, and
  physical-iPhone checks pass or have documented host limitations.
- [ ] Ubuntu server `:8080` phone smoke test is complete without committed
  local configuration or credentials.
- [x] Documentation, roadmap, fixtures, and tests are updated; changes are
  committed in reviewed slices.

The implementation and focused regression/UI coverage for these behaviors are
now present. Theme, accessibility, full simulator/physical-device, Ubuntu API,
and live web/backend gates remain intentionally open until those environments
are exercised.

## Verification log

- 2026-09-13: `swift test --filter LogsTests` passed all 9 Logs model/formatter
  tests, including failed-edit draft retention, conflict replay, and every
  calendar grouping boundary.
- 2026-09-13: focused iPhone 17 Pro simulator UI test for Logs composer,
  labels, edit, confirmation/delete passed; the large Dynamic Type Logs case
  also passed. Xcode emitted its known LLDB debugger-store warning.
- 2026-09-13: focused iPhone 17 Pro simulator create-flow test passed and
  verified the polite `Log saved.` success announcement after saving a draft.
- 2026-09-13: Logs light/dark appearance screenshot regression passed on the
  iPhone 17 Pro simulator. This records rendered artifacts for review; full
  VoiceOver, contrast, reduced-motion, and physical-device checks remain open.
- 2026-09-13: LOG label chooser now renders the server-provided color swatch
  alongside its checkbox/name state; model coverage verifies color and scope
  fields are retained.
- 2026-09-13: device-following log timestamps are normalized to the local
  minute (seconds zeroed), while manual DatePicker overrides remain unchanged;
  the focused Logs suite passes 8 tests.
- 2026-09-13: added deterministic coverage for all LogFormatting calendar
  groups, including Last hour, Monday-based week boundaries, both month
  groups, and localized month fallback.
- 2026-09-13: the focused `KnowTests/testLogsAPIUsesAuthenticatedContractAndFullLabelReplacement`
  test passed, covering Logs API bearer authentication, request paths and
  methods, timestamp encoding, optimistic-lock versioning, and full label ID
  replacement.

## Prompt for a fresh session

> Implement `docs/ios-milestone-3-logs-parity.md`. Start by reading the current
> `frontend/src/views/LogsView.vue`, `LogsView.test.ts`, logs store, API docs,
> backend LogService/controller/integration test, and the existing SwiftUI
> Sessions architecture. Open the running development app at
> `http://localhost:3000` to inspect the live web design and interactions.
> Build a state matrix first, then implement the Logs workspace section in
> tested vertical slices. Preserve API ownership,
> timestamp/version/label contracts, draft-safe 409 recovery, compatibility
> identifiers, and server-owned rules. Add stable UI fixtures and accessibility
> tests, run web/backend/iOS checks, and finish with a physical iPhone smoke
> test against the Ubuntu development backend at port 8080. Treat current web
> behavior as the source of truth. Commit chronologically and semantically,
> with each commit containing one coherent implementation slice.
