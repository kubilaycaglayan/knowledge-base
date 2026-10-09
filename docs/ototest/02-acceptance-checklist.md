# OTOTEST-02 acceptance checklist: backend API behavior coverage

**Milestone:** [OTOTEST-02 — Backend API behavior coverage](02-backend-api-coverage.md)  
**Status:** In progress; checked criteria have named test evidence in the API matrix
**Product surface:** Knowledge Base `/api/v1` operations used by supported web and Chrome clients  
**Out of scope:** Native client behavior, UI-route acceptance, and installing or exercising the Chrome extension as a browser journey (covered by OTOTEST-03/04)

This checklist makes OTOTEST-02 auditable. It is a plan for reviewing and
linking existing or future functional evidence; it does not claim that named
test files pass or that a nearby test proves an operation. Mark an item only
after the endpoint matrix identifies the assertion that proves it. Keep API
behavior shared with client surfaces in this milestone's server/API evidence;
browser interaction evidence remains a separate layer.

## Source of truth

- [OTOTEST-02 milestone brief](02-backend-api-coverage.md)
- [OTOTEST-01 acceptance checklist and shared API inventory requirements](01-acceptance-checklist.md#shared-backend-api-used-by-web-and-extension)
- [Product test tree](product-test-tree.md)
- [API contract](../api.md)
- Controller mappings under `backend/src/main/java/com/know/api/`
- API/controller, service, integration, and database migration assertions under
  `backend/src/test/java/`

## Review setup and evidence rules

- [ ] Confirm OTOTEST-01's source-backed endpoint inventory is available and
  reconciled before claiming OTOTEST-02 completion; record unresolved inventory
  rows as prerequisites/gaps rather than assuming the endpoint set is final.
- [ ] Record the source revision and review date for the API behavior map.
- [ ] Use only test and run evidence produced against an isolated disposable
  local/CI database or another explicitly approved non-production environment.
- [ ] Record each controller mapping as an HTTP method plus its fully composed
  `/api/v1` path.
- [ ] Record route aliases as separate operation rows, even when they delegate
  to one service method.
- [ ] For each operation row, record controller and method, auth requirement,
  path/query/body inputs, response status and shape, ownership-scoped IDs,
  state effect, evidence link, evidence layer, and current gap.
- [ ] Use exact test names or named assertions as evidence; a test filename
  without a relevant assertion does not prove coverage.
- [ ] Distinguish unit/domain, controller/API, service, persistence
  integration, PostgreSQL-guarded, deployed-shaped, browser, and manual
  evidence.
- [ ] Do not treat an anonymous-rejection sweep as proof of a specific
  authenticated operation's successful behavior.
- [ ] Do not treat a UI or mocked-client assertion as proof of backend
  persistence, authorization, transaction, or database behavior.
- [ ] For each state mutation, link evidence of the persisted state or another
  observable effect after the request.
- [ ] For delete/archive operations, link evidence of absence or archived
  state; for restore operations, link evidence of the restored state.
- [ ] Mark an operation `gap` when its contract is unclear or no assertion
  proves the behavior; do not infer coverage from a neighboring operation.
- [ ] Mark unsupported/internal operations with a rationale and owner rather
  than silently omitting them.

## Flow: Inventory every API operation

- [ ] Reconcile every `@RequestMapping` base path with its method-level
  mapping.
- [ ] Include every `GET` mapping as its own operation row.
- [ ] Include every `POST` mapping as its own operation row.
- [ ] Include every `PUT` mapping as its own operation row.
- [ ] Include every `PATCH` mapping as its own operation row, if any are
  introduced.
- [ ] Include every `DELETE` mapping as its own operation row.
- [ ] Include each alias route separately and state whether it has the same
  status, request, response, and side effect as its canonical route.
- [ ] Include query parameters, defaults, accepted ranges, and repeated
  parameters in each applicable row.
- [ ] Include request body fields, validation constraints, and optional fields
  in each applicable row.
- [ ] Include response code, response fields, and relevant headers/content
  types in each applicable row.
- [ ] Include authentication requirements and any intentionally public
  operation in each applicable row.
- [ ] Include direct resource IDs and referenced resource IDs that require
  owner-scoped resolution.
- [ ] Include each operation's read, create, update, archive, delete, ordering,
  import, or other observable effect.
- [ ] Compare the resulting operation rows with the current OpenAPI document
  and `docs/api.md`; resolve or record any contract discrepancy.
- [ ] Compare the operation rows with supported web API call sites and mark
  server operations with no supported client use for a scope decision.

## Flow: Cover authentication and account operations

- [ ] `GET /api/v1/auth/google/config` has an assertion for configured and
  unconfigured response behavior.
- [ ] `POST /api/v1/auth/register` has a successful account-creation and token
  response assertion.
- [ ] `POST /api/v1/auth/register` has invalid email and password boundary
  assertions.
- [ ] `POST /api/v1/auth/register` has duplicate-account conflict behavior
  evidence.
- [ ] `POST /api/v1/auth/login` has a successful credential and token response
  assertion.
- [ ] `POST /api/v1/auth/login` has invalid-credential and input-boundary
  evidence.
- [ ] `POST /api/v1/auth/google` has a successful verified-token exchange
  assertion where provider verification can be isolated.
- [ ] `POST /api/v1/auth/google` has invalid, unverified, wrong-audience, and
  malformed provider-token behavior evidence as applicable.
- [ ] `GET /api/v1/auth/me` has a successful current-account response
  assertion.
- [ ] `GET /api/v1/auth/me` has missing, malformed, expired, and invalid bearer
  token outcomes linked to authentication/security evidence.
- [ ] `PUT /api/v1/auth/password` has first-password setup and existing-password
  change behavior evidence.
- [ ] `PUT /api/v1/auth/password` has current-password, new-password
  validation, and Google-linked-account boundary evidence as applicable.
- [ ] Authentication responses do not expose password hashes, provider
  secrets, or unnecessary token material beyond the documented bearer token.
- [ ] Authentication throttling behavior links to focused rate-limit evidence
  without substituting that evidence for successful auth operation behavior.

## Flow: Cover Paths operations

- [x] `GET /api/v1/paths` covers the default active-only list, owner scope,
  and ordering. The endpoint has no filter or archived-visibility query.
- [x] `POST /api/v1/paths` covers successful creation and persisted values.
- [x] `GET /api/v1/paths/{id}` covers owned, missing, and foreign IDs.
- [x] `GET /api/v1/paths/{id}/summary` covers aggregation values across
  adjacent persisted intervals and elapsed running time. The endpoint has no
  date range inputs.
- [x] `PUT /api/v1/paths/{id}` covers successful persisted update and invalid
  color values; stale/conflicting state is not applicable because this request
  has no optimistic version field.
- [x] `DELETE /api/v1/paths/{id}` covers the documented delete/archive effect
  and subsequent read behavior.
- [x] `POST /api/v1/paths/{id}/merge` covers source/target ownership, invalid
  or same-target requests, and the resulting record reassignment.
- [x] `POST /api/v1/paths/{id}/restore` covers restoration and a subsequent
  read of the active state.
- [x] `POST /api/v1/paths/{id}/pin` covers pin and unpin outcomes.
- [x] `PUT /api/v1/paths/order` covers complete ordering, invalid/missing IDs,
  and persisted order.

## Flow: Cover Labels operations

- [x] `GET /api/v1/labels` covers the unfiltered list, scope filtering, and
  owner isolation.
- [x] `POST /api/v1/labels` covers creation, defaults, colors, and scopes.
- [x] `PUT /api/v1/labels/{id}` covers update, invalid scope/color values, and
  assignment-sensitive restrictions.
- [x] `DELETE /api/v1/labels/{id}` covers unassigned deletion.
- [x] `DELETE /api/v1/labels/{id}?removeAssignments=true` covers explicit
  assignment removal while preserving the assigned records.
- [x] `DELETE /api/v1/labels/{id}` covers conflict behavior when assignments
  exist and assignment removal was not explicitly requested.
- [x] `GET /api/v1/labels/{id}/history` covers owner scope, timezone
  validation, totals, timeline, hourly values, and related labels.
- [x] `GET /api/v1/labels/{id}/history/records` covers every supported record
  kind, pagination, ordering, preview limits, and empty pages.
- [x] Label history excludes deleted or archived record types according to the
  documented contract.

## Flow: Cover Notes operations

- [x] `GET /api/v1/notes` covers active, archived, paginated, and query-filtered
  list behavior.
- [x] `GET /api/v1/notes/labels` covers available NOTE labels and owner scope.
- [x] `GET /api/v1/notes/{id}` covers owned, missing, foreign, and archived
  note IDs.
- [x] `POST /api/v1/notes` covers standalone note creation and each supported
  path/activity/time-entry association.
- [x] `POST /api/v1/notes` covers rich-text content and server-derived
  `contentText` behavior.
- [x] `PUT /api/v1/notes/{id}` covers successful update and persisted document
  fields.
- [x] `PUT /api/v1/notes/{id}` covers optimistic version success and stale
  version conflict behavior.
- [x] `PUT /api/v1/notes/{id}` covers ownership for its supported references:
  the update body has no path, activity, time-entry, or label ID fields; tags
  are names and a same-name foreign label is not reused or exposed.
- [x] `DELETE /api/v1/notes/{id}` covers archive state and subsequent list and
  detail behavior.
- [x] `POST /api/v1/notes/{id}/restore` returns 204; subsequent detail/list
  reads prove restored state and the incremented version. The restore response
  is intentionally empty, so the version is observed on the detail read.
- [x] `POST /api/v1/notes/{id}/pin` covers pin/unpin state, version, and pinned
  ordering.
- [x] `PUT /api/v1/notes/order` covers complete owned-note ordering and
  invalid or foreign note IDs.
- [x] Note line-history behavior covers unchanged lines, changed lines,
  first-edit migration behavior, and the documented large-document limit.

## Flow: Cover Logs and Activity operations

- [x] `GET /api/v1/logs` covers owner-scoped newest-first order and empty
  results. The endpoint has no filter or pagination query parameters.
- [x] `GET /api/v1/logs/{id}` covers owned, missing, and foreign log IDs.
- [x] `POST /api/v1/logs` covers creation, occurrence timestamp, and persisted
  body. Log labels are assigned through the separate labels operation.
- [x] `PUT /api/v1/logs/{id}` covers persisted body/time update and optimistic
  version conflict behavior.
- [x] `PUT /api/v1/logs/{id}/labels` covers replacement semantics and requires
  owned labels with LOG scope.
- [ ] `DELETE /api/v1/logs/{id}` covers permanent removal and subsequent
  absence.
- [x] `GET /api/v1/activities` covers each supported `from`, `to`, `pathId`,
  and `type` filter independently.
- [x] Activity filtering covers inclusive/exclusive boundary behavior as
  documented for each supported date/time input.
- [x] Activity results do not reveal another user's records through direct or
  referenced IDs.

## Flow: Cover timers and time entries

- [ ] `GET /api/v1/timers/current` covers empty, running, and paused timer
  states.
- [ ] `GET /api/v1/timers/draft` covers default and persisted idle selection
  state.
- [ ] `PUT /api/v1/timers/draft` covers save, validation, owner-scoped path and
  label references, and running-timer conflict behavior.
- [ ] `POST /api/v1/timers` covers server-owned start time, selected context,
  and one-running-timer behavior.
- [ ] Concurrent `POST /api/v1/timers` requests preserve the one-running-timer
  invariant.
- [ ] `PUT /api/v1/timers/{id}` covers update, optional stop/end-time behavior,
  and owner-scoped timer IDs.
- [x] `POST /api/v1/timers/stop` covers stopping the current timer.
- [x] `POST /api/v1/timers/{id}/stop` covers the explicit-ID alias and its
  parity with the canonical stop behavior.
- [x] `POST /api/v1/timers/cancel` covers canceling the current timer without
  recording tracked time.
- [x] `POST /api/v1/timers/{id}/cancel` covers the explicit-ID alias and its
  parity with canonical cancel behavior.
- [ ] Stop behavior covers the under-two-second discard boundary.
- [ ] `POST /api/v1/timers/pause` covers pause state and accumulated duration.
- [ ] `POST /api/v1/timers/resume` covers resumed segments and carried
  duration.
- [ ] `POST /api/v1/timers/finish` covers completion of a paused session.
- [ ] Pause, resume, and finish invalid-state requests cover documented
  conflict behavior.
- [ ] Resume after a selected path becomes inactive covers validation and
  preservation of the paused draft.
- [ ] `POST /api/v1/time-entries` covers manual entry creation and valid
  duration/time boundaries.
- [ ] `GET /api/v1/time-entries` covers owner-scoped ordering and list filters.
- [x] `GET /api/v1/time-entries/{id}` covers owned, missing, and foreign IDs.
- [ ] `PUT /api/v1/time-entries/{id}` covers completed-entry editing and
  invalid interval boundaries.
- [ ] `DELETE /api/v1/time-entries/{id}` covers soft-delete behavior and
  subsequent visibility.
- [ ] `GET /api/v1/statistics` covers tracked-seconds and date/path/label
  aggregation arithmetic.
- [ ] Timer duration assertions use server responses/persisted values rather
  than client-calculated historical duration.

## Flow: Cover timer WebSocket transport

- [ ] The authenticated `/ws/timers` endpoint covers initial authentication,
  `READY`, state snapshots, and heartbeat behavior.
- [ ] The WebSocket endpoint covers unauthorized or malformed first-message
  behavior.
- [ ] WebSocket disconnect/reconnect evidence verifies REST remains
  authoritative and current timer state can be recovered after reconnect.

## Flow: Cover Board and All boards operations

- [ ] `GET /api/v1/boards` covers active, archived, and include-hidden list
  behavior.
- [ ] `POST /api/v1/boards` covers custom board creation.
- [ ] `PUT /api/v1/boards/order` covers complete board ordering and invalid
  board IDs.
- [ ] `POST /api/v1/boards/{id}/visibility` covers visibility changes.
- [ ] `POST /api/v1/boards/{id}/pin` covers pin/unpin changes.
- [ ] `GET /api/v1/boards/{id}` covers owned, missing, and foreign board IDs.
- [ ] `PUT /api/v1/boards/{id}` covers rename behavior and path-board conflict.
- [ ] `POST /api/v1/boards/{id}/archive` covers archive state and restrictions.
- [ ] `POST /api/v1/boards/{id}/restore` covers restored state.
- [ ] `GET /api/v1/boards/{id}/statuses` covers board-owned ordered status
  results.
- [ ] `POST /api/v1/boards/{id}/statuses` covers status creation and initial
  position.
- [ ] `PUT /api/v1/boards/{id}/statuses/{statusId}` covers rename and nested
  ownership.
- [ ] `PUT /api/v1/boards/{id}/statuses/{statusId}/sort` covers each supported
  card sort mode.
- [ ] `PUT /api/v1/boards/{id}/statuses/order` covers full reorder, duplicate
  IDs, missing IDs, and foreign status IDs.
- [ ] `POST /api/v1/boards/{id}/statuses/{statusId}/archive` covers moving
  active cards and preventing removal of the final active status.
- [ ] `POST /api/v1/boards/{id}/statuses/{statusId}/restore` covers restored
  status state.
- [ ] `GET /api/v1/boards/{id}/cards` covers status, archive, and default
  filtering.
- [ ] `GET /api/v1/boards/{id}/cards/page` covers cursor boundaries, page size
  limits, and each supported status sort mode.
- [ ] `POST /api/v1/boards/{id}/cards` covers card creation and validation of
  paths, labels, status, and date fields.
- [ ] `GET /api/v1/boards/{id}/cards/{cardId}` covers nested card ownership.
- [ ] `PUT /api/v1/boards/{id}/cards/{cardId}` covers update, referenced-ID
  ownership, and stale `expectedUpdatedAt` conflict behavior.
- [ ] `POST /api/v1/boards/{id}/cards/{cardId}/move` covers position updates,
  target status ownership, and rejection of archived targets.
- [ ] `POST /api/v1/boards/{id}/cards/{cardId}/move-to-column` covers finding
  or creating the target column and persisted placement.
- [ ] `POST /api/v1/boards/{id}/cards/in-column` covers card creation in an
  existing or newly created column.
- [ ] `POST /api/v1/boards/{id}/cards/{cardId}/transfer` covers source and
  destination board ownership and persisted transfer.
- [ ] `POST /api/v1/boards/{id}/cards/{cardId}/archive` covers archived state
  and list visibility.
- [ ] `POST /api/v1/boards/{id}/cards/{cardId}/restore` covers restoration
  from an active status and fallback placement if its status is archived.
- [ ] `GET /api/v1/boards/{id}/gantt` covers date-range validation,
  inclusive-overlap behavior, and active-status filtering.
- [ ] `GET /api/v1/boards/all/columns` covers merged column names and ordering.
- [ ] `GET /api/v1/boards/all/columns/cards/page` covers merged-column cursor
  paging and boundary validation.
- [ ] `PUT /api/v1/boards/all/columns/sort` covers sort changes across the
  applicable boards/statuses.
- [ ] `GET /api/v1/boards/all/gantt` covers inclusive date range behavior and
  excludes cards that do not meet the documented active-board/status rules.
- [ ] Multi-record board mutations cover transaction rollback when any
  operation in the mutation fails.

## Flow: Cover Calendar operations

- [ ] `GET /api/v1/calendar/labels` covers only the authenticated user's
  CALENDAR-scoped labels.
- [ ] `POST /api/v1/calendar/labels` covers label creation and color
  constraints.
- [ ] `PUT /api/v1/calendar/labels/{id}` covers update and owner-scoped IDs.
- [ ] `DELETE /api/v1/calendar/labels/{id}` covers deletion restrictions for
  labels referenced by historical calendar records.
- [ ] `GET /api/v1/calendar/days` covers date-range validation and inclusive
  endpoints.
- [ ] `PUT /api/v1/calendar/days/{date}` covers replacement semantics for one
  day's note and label assignments.
- [x] `DELETE /api/v1/calendar/days/{date}` covers single-day deletion,
  subsequent absence, foreign-user isolation, and repeated deletion.
- [ ] `PUT /api/v1/calendar/days/range` covers inclusive range mutation while
  preserving existing assignments not requested for removal.
- [ ] Calendar day writes cover owned-label validation without mutating label
  scopes and each supported marker/portion value.
- [ ] Calendar range operations cover invalid dates, reversed ranges, and
  supported maximum span boundaries.

## Flow: Cover Reports, Search, and Preferences

- [ ] `GET /api/v1/reports` covers each preset period and anchor-date boundary.
- [ ] `GET /api/v1/reports` covers custom inclusive ranges and the maximum
  supported range.
- [ ] `GET /api/v1/reports` covers every supported aggregation interval and
  path/label filter composition.
- [ ] Report assertions verify totals and category aggregation arithmetic,
  including timezone/calendar boundary behavior.
- [ ] `GET /api/v1/search` covers each supported record type and type filter.
- [ ] `GET /api/v1/search` covers query length/term limits, limit/offset
  boundaries, unknown types, and invalid fuzzy-mode values.
- [ ] Search assertions cover literal ranking, fuzzy fallback, per-type cap,
  incomplete/time-out behavior, archived visibility, and deleted-record
  exclusion as documented.
- [ ] Search result assertions verify type-specific fields and owner-scoped
  path/label relationships.
- [x] `GET /api/v1/preferences` covers default and previously saved preference
  values for the signed-in user.
- [x] `PUT /api/v1/preferences` covers successful round trip and invalid
  preference values.
- [x] Preferences remain isolated between two disposable users.

## Flow: Cover imports and exports

- [ ] `POST /api/v1/imports/clockify` covers supported payload creation,
  project-to-path mapping, and persisted import-batch ownership.
- [ ] `POST /api/v1/imports/clockify` covers duplicate source IDs and repeated
  import behavior.
- [ ] `POST /api/v1/imports/clockify` covers malformed and unsupported input,
  validation, and documented partial/rollback behavior.
- [x] `GET /api/v1/imports/clockify/batches` covers owner-scoped batch listing
  and ordering.
- [x] `DELETE /api/v1/imports/clockify/batches/{id}` covers undo effects,
  foreign batch rejection, and repeated-undo behavior.
- [x] `GET /api/v1/imports/knowledge-base/export` covers CSV content type,
  escaping, and export of the authenticated user's records only.
- [ ] `POST /api/v1/imports/knowledge-base` covers valid CSV round trip,
  stable-ID duplicate handling, and legacy formats documented as supported.
- [ ] `POST /api/v1/imports/knowledge-base` covers malformed CSV, unsupported
  values, and documented rollback/partial-result behavior.
- [x] `GET /api/v1/imports/knowledge-base/batches` covers owner-scoped batch
  list behavior.
- [x] `DELETE /api/v1/imports/knowledge-base/batches/{id}` covers undo,
  imported-log removal, foreign-batch rejection, and repeat behavior.
- [ ] Import and export coverage verifies labels/scopes and linked path,
  session, note, calendar, and log data according to the format contract.

## Flow: Verify ownership and authentication boundaries

- [ ] Each protected operation has evidence that an unauthenticated request
  receives the documented unauthorized response.
- [ ] Each directly addressed resource family has owned, missing, and foreign
  ID evidence where that operation accepts a resource ID.
- [ ] Each mutation that accepts referenced IDs verifies those IDs belong to
  the authenticated user.
- [ ] Referenced path, label, board, status, card, note, timer, entry, and batch
  IDs are checked wherever applicable to the operation.
- [ ] Foreign resources are not distinguished from missing resources where
  the API contract intentionally returns not found.
- [ ] Cross-user coverage uses at least two disposable accounts and verifies
  both the response and the unchanged owner data.
- [ ] Authenticated network/server failures do not falsely count as token
  rejection or erase the current session.
- [ ] Error responses preserve their intended status through exception/error
  dispatch rather than being converted to unrelated authentication errors.

## Flow: Verify validation, boundaries, and concurrency

- [ ] Every request DTO's required, length, format, and range validations have
  an assertion at the layer that owns the contract.
- [ ] Every path/query parameter with a documented allowed range has lower,
  upper, and out-of-range boundary evidence.
- [ ] Date and timestamp operations have timezone, leap-day, inclusive-range,
  and reversed-range evidence where applicable.
- [ ] Pagination has first-page, middle-page, final-page, invalid-cursor, and
  invalid-limit evidence where applicable.
- [ ] Ordered lists have stable tie-break and reorder persistence evidence
  where ordering is part of the contract.
- [ ] Optimistic version or expected-update-time contracts have both current
  version success and stale version conflict evidence.
- [ ] Idempotent operations document and assert repeated-request outcomes
  where idempotency is part of the API contract.
- [ ] Concurrent timer-start behavior verifies the one-running-timer invariant
  through both service behavior and the PostgreSQL uniqueness safeguard.
- [ ] Multi-record mutation failures verify transaction rollback where
  persistence must remain atomic.
- [ ] PostgreSQL-specific constraints and migration behavior run only under
  the guarded disposable PostgreSQL path.
- [ ] Each new migration that transforms existing rows has a focused assertion
  for the transformed data and supported upgrade behavior.

## Flow: Match each operation to the right evidence layer

- [ ] HTTP status, serialization, request binding, and exception translation
  link to controller/API evidence.
- [ ] Domain decisions and deterministic branching rules link to focused
  service/domain evidence.
- [ ] Persistence, ownership, transaction, and multi-record behavior link to
  integration evidence.
- [ ] PostgreSQL constraints, SQL semantics, and migration behavior link to
  guarded PostgreSQL evidence.
- [ ] Browser E2E evidence is required only where client interaction or
  cross-layer behavior is the risk, and is not used as a substitute for API
  contract evidence.
- [ ] Each API matrix row links the exact named assertion for each evidence
  layer it claims.
- [ ] Existing `SecurityHardeningIntegrationTest`,
  `CrossUserIsolationIntegrationTest`, and
  `InputValidationIntegrationTest` are linked only to the specific behavior
  they actually assert.
- [ ] Relevant CI job or local command is recorded beside each executable
  evidence link.
- [ ] Unavailable, manual, or environment-guarded evidence is labeled with an
  owner and a runbook/command rather than marked complete.

## Flow: Maintain the API contract and report completion

- [ ] Every behavior change updates `docs/api.md` and its API matrix row in the
  same review.
- [ ] Every controller mapping, overload, and alias has exactly one inventory
  entry or a documented exclusion.
- [ ] Each state-changing operation asserts persisted state or an observable
  event, not only a successful HTTP response.
- [ ] Each delete/archive/restore operation asserts the resulting state from a
  subsequent read or equivalent persistence observation.
- [ ] Missing positive operation coverage remains visible as a gap even when
  broad security sweeps pass.
- [ ] Existing HARD-01 through HARD-07 evidence is reused by link when it
  proves the required behavior; duplicate coverage is not added without a
  distinct risk.
- [ ] Acceptance evidence records the exact source revision, command or CI job,
  result, and report link.
- [ ] OTOTEST-02 is not marked complete until every operation and alias is
  covered or explicitly excluded, the API docs and matrix agree, and the
  required backend/PostgreSQL evidence is recorded.
