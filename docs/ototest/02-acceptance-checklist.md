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

- [x] Confirm the OTOTEST-01 source-backed endpoint inventory is available and
  reconciled before claiming OTOTEST-02 completion; unresolved operation rows
  remain explicit gaps in [`01-api-matrix.md`](01-api-matrix.md).
- [x] Record the source revision and review date for the API behavior map in
  [`01-api-matrix.md`](01-api-matrix.md).
- [x] Test and run evidence is restricted to isolated disposable test databases
  or guarded disposable PostgreSQL jobs; no production data is used.
- [x] Record each controller mapping as an HTTP method plus its fully composed
  `/api/v1` path in the API matrix (107 composed rows reconciled against 105
  controller mapping annotations at the recorded revision).
- [x] Record route aliases as separate operation rows in the API matrix, even
  when they delegate to one service method.
- [x] For each operation row, record controller and method, auth requirement,
  path/query/body inputs, response status and shape, ownership-scoped IDs,
  state effect, evidence link, evidence layer, and current gap (API-01/02 in
  OTOTEST-01; layer conventions and source-based contract reading are recorded
  in the API matrix).
- [x] Use exact test names or named assertions as evidence; a test filename
  without a relevant assertion does not prove coverage. All 357 qualified
  references in the current operation matrix resolve to a test method; the
  evidence description beside each reference names the behavior asserted.
- [x] Distinguish unit/domain, controller/API, service, persistence
  integration, PostgreSQL-guarded, deployed-shaped, browser, and manual
  evidence using test package and guarded-run conventions in the API matrix.
- [x] Do not treat an anonymous-rejection sweep as proof of a specific
  authenticated operation's successful behavior. The operation matrix pairs
  authentication sweeps with operation-specific successful assertions; the
  `/api/v1/auth/me` row, for example, separately names the public-profile
  assertion and anonymous/malformed-token evidence.
- [x] Do not treat a UI or mocked-client assertion as proof of backend
  persistence, authorization, transaction, or database behavior. Operation
  rows link backend test methods only; browser E2E, frontend tests, and guarded
  PostgreSQL evidence are classified separately in the matrix conventions.
- [x] For each state mutation, link evidence of the persisted state or another
  observable effect after the request. The mutation rows in
  [`01-api-matrix.md`](01-api-matrix.md) identify response/readback state,
  reassignment, ordering, emitted activity, or removal outcomes for each
  operation.
- [x] For delete/archive operations, link evidence of absence or archived
  state; for restore operations, link evidence of the restored state. The
  path, note, label, time-entry, calendar, import-batch, board/status, and card
  operation rows name the resulting read, list, or persistence observation.
- [x] Mark an operation `gap` when its contract is unclear or no assertion
  proves the behavior; do not infer coverage from a neighboring operation.
  Unknown board-card priority binding is explicitly marked as a
  maintainer-owned contract decision on create, update, and create-in-column
  rows in [`01-api-matrix.md`](01-api-matrix.md).
- [x] Mark unsupported/internal operations with a rationale and owner rather
  than silently omitting them. Both documented timer-cancel route aliases are
  explicitly marked as having no current supported web/extension caller; the
  Knowledge Base maintainers own the client-support or deprecation decision.

## Flow: Inventory every API operation

- [x] Reconcile every `@RequestMapping` base path with its method-level
  mapping.
- [x] Include every `GET` mapping as its own operation row.
- [x] Include every `POST` mapping as its own operation row.
- [x] Include every `PUT` mapping as its own operation row.
- [x] Include every `PATCH` mapping as its own operation row; none are
  currently declared.
- [x] Include every `DELETE` mapping as its own operation row.
- [x] Include each alias route separately and state whether it has the same
  status, request, response, and side effect as its canonical route. The two
  controller mapping arrays are timer stop/cancel; each route has its own
  matrix row, and `TimerApiTest.canonicalAndExplicitStopRoutesUseTheSameTimerAndResponse`,
  `TimerApiTest.canonicalAndExplicitCancelRoutesCancelTheSameTimer`, and
  `TimerStartIntegrationTest.timerStopAndCancelAliasesHaveMatchingStatusShapeAndEffects`
  compare response/status and resulting current-timer state.
- [x] Include query parameters, defaults, accepted ranges, and repeated
  parameters in each applicable row. The API matrix records every controller
  `@RequestParam`, declared default/optional status, enforced range or enum
  where applicable, and the only supported repeated-value parameters
  (`pathId` and `labelId` on reports), with named binding evidence.
- [x] Include request body fields, validation constraints, and optional fields
  in each applicable row. The API matrix records request DTO fields and
  constraints for JSON operations, raw CSV import shape, service-level
  reference/set rules, and states that methods without a declared body have
  no request body; unproven field behavior remains a gap.
- [ ] Include response code, response fields, and relevant headers/content
  types in each applicable row.
- [ ] Include authentication requirements and any intentionally public
  operation in each applicable row.
- [ ] Include direct resource IDs and referenced resource IDs that require
  owner-scoped resolution.
- [ ] Include each operation's read, create, update, archive, delete, ordering,
  import, or other observable effect.
- [x] Compare the resulting operation rows with the generated `/v3/api-docs`
  operation set (107 exact method/path matches, no set differences) and
  `docs/api.md`; operation rows are linked to documented API families.
- [ ] Compare the operation rows with supported web API call sites and mark
  server operations with no supported client use for a scope decision.

## Flow: Cover authentication and account operations

- [x] `GET /api/v1/auth/google/config` returns the configured client ID or an
  empty client ID when provider login is unconfigured
  (`AuthControllerApiTest.googleConfigReturnsThePublicClientId` and
  `SecurityHardeningIntegrationTest.publicRoutesDoNotRequireAToken`).
- [x] `POST /api/v1/auth/register` creates an account and returns its user ID
  and bearer token (`KnowIntegrationTest.registrationCreatesUserAndLoginReturnsJwt`).
- [x] `POST /api/v1/auth/register` rejects malformed email, password below
  nine characters, and password over 200 characters before user lookup
  (`AuthControllerApiTest.registrationRejectsShortPasswords` and
  `registrationRejectsMalformedEmailsAndPasswordsOverTheMaximumLength`);
  blank email/password inputs are rejected for both register and login by
  `credentialsRejectBlankEmailAndPasswordForRegistrationAndLogin`; exactly
  200 characters succeeds in registration
  (`AuthControllerApiTest.registrationAndPasswordSetupAcceptMaximumLengthPasswords`).
- [x] `POST /api/v1/auth/register` returns conflict for duplicate normalized
  email (`AuthControllerApiTest.duplicateRegistrationIsRejected` and
  `KnowIntegrationTest.registrationCreatesUserAndLoginReturnsJwt`).
- [x] `POST /api/v1/auth/login` accepts valid credentials and returns a bearer
  token (`KnowIntegrationTest.registrationCreatesUserAndLoginReturnsJwt`).
- [x] `POST /api/v1/auth/login` rejects incorrect credentials and returns the
  same unauthorized response for an unknown email and a wrong password
  (`AuthControllerApiTest.invalidLoginDoesNotRevealWhetherAccountExists` and
  `loginUsesTheSameFailureForUnknownEmailAndWrongPassword`). Blank input is
  rejected at request binding by
  `AuthControllerApiTest.credentialsRejectBlankEmailAndPasswordForRegistrationAndLogin`.
- [x] `POST /api/v1/auth/google` links a verified identity to an existing
  account or creates a new account when verification is isolated
  (`AuthControllerApiTest.verifiedGoogleIdentityLinksAnExistingEmail` and
  `verifiedGoogleIdentityCreatesAnAccountWithRandomUnusablePassword`).
- [x] `POST /api/v1/auth/google` has invalid, unverified, configured-audience, and
  malformed provider-token behavior evidence as applicable.
  HTTP missing/null/blank/oversized token binding is covered by
  `AuthControllerApiTest.googleLoginRejectsBlankAndOverlongIdTokensAtTheRequestBoundary`;
  an exact 10,000-character token reaches the verifier
  (`AuthControllerApiTest.googleIdTokenAtMaximumLengthReachesTheVerifier`);
  verifier-level malformed tokens are covered by
  `GoogleIdTokenIdentityVerifierTest.configuredVerifierRejectsMalformedTokenWithoutThrowing`.
  Claim-level unverified email, missing email/subject, and normalized identity
  behavior are covered by
  `GoogleIdTokenIdentityVerifierTest.rejectsProviderIdentitiesWithoutVerifiedEmailOrSubject`
  and `GoogleIdTokenIdentityVerifierTest.normalizesVerifiedProviderIdentityAndFallsBackToEmailName`.
  The configured
  audience is asserted directly through the Google library verifier by
  `GoogleIdTokenIdentityVerifierTest.configuredVerifierTrustsOnlyTheTrimmedConfiguredAudience`;
  Google rejects tokens whose audience does not match this configured client ID.
- [x] `GET /api/v1/auth/me` returns the authenticated account's public profile
  without its password hash (`AuthControllerApiTest.currentAccountReturnsOnlyTheAuthenticatedUsersPublicProfile`).
- [x] `GET /api/v1/auth/me` rejects missing, malformed, expired, and invalid
  bearer tokens (`SecurityHardeningIntegrationTest.everyProtectedRouteRejectsAnonymousRequests`
  and `malformedTokensAreRejectedWithoutServerErrors`).
- [x] `PUT /api/v1/auth/password` supports first-password setup for Google-only
  accounts and changing an existing password
  (`AuthControllerApiTest.googleOnlyUserCanSetPasswordAfterAuthentication`
  and `passwordChangeWithCorrectCurrentPasswordPersistsTheReplacement`).
- [x] `PUT /api/v1/auth/password` requires the current password for existing
  passwords and enforces new-password length boundaries; Google-linked accounts
  with an existing password follow that same rule
  (`AuthControllerApiTest.passwordChangeRejectsMissingCurrentPasswordWhenAlreadyConfigured`,
  `passwordChangeRequiresTheCurrentPasswordWhenAlreadyConfigured`,
  `passwordChangeRequiresCurrentPasswordEvenWhenGoogleIsAlsoLinked`, and
  `passwordSetupRejectsNewPasswordsOutsideTheSupportedLength` covers blank,
  eight-character, and over-200-character new passwords; exact 200-character
  password setup succeeds
  (`AuthControllerApiTest.registrationAndPasswordSetupAcceptMaximumLengthPasswords`).
- [x] Registration, password login, and Google login responses do not expose
  password hashes or the linked Google subject
  (`KnowIntegrationTest.registrationCreatesUserAndLoginReturnsJwt` and
  `AuthControllerApiTest.verifiedGoogleIdentityLinksAnExistingEmail`);
  the account endpoint likewise omits the stored hash
  (`AuthControllerApiTest.currentAccountReturnsOnlyTheAuthenticatedUsersPublicProfile`).
- [x] Authentication throttling has focused HTTP-boundary evidence for login,
  registration, and Google token exchange
  (`AuthControllerApiTest.rateLimitedAuthenticationReturnsTooManyRequests`,
  `loginBudgetIsPerNormalizedEmailAndIgnoresForwardedAddressHeaders`, and
  `registrationAndGoogleBudgetsAreAppliedAtTheHttpBoundary`).

## Flow: Cover Paths operations

- [x] `GET /api/v1/paths` covers the default active-only list, owner scope,
  and ordering. The endpoint has no filter or archived-visibility query.
- [x] `POST /api/v1/paths` covers successful creation and persisted values,
  rejects blank names and over-limit name/description, and accepts both exact
  maxima (`PathAuthorizationApiTest.pathNamesAreValidatedBeforePersistence`).
- [x] `GET /api/v1/paths/{id}` covers owned, missing, and foreign IDs.
- [x] `GET /api/v1/paths/{id}/summary` covers aggregation values across
  adjacent persisted intervals and elapsed running time. The endpoint has no
  date range inputs.
- [x] `PUT /api/v1/paths/{id}` covers successful persisted update and invalid
  color values; stale/conflicting state is not applicable because this request
  has no optimistic version field. Blank or over-160-character names and
  over-limit descriptions are also rejected before owner lookup
  (`PathAuthorizationApiTest.pathUpdateValidatesTextAndColorBeforeOwnershipLookup`).
- [x] `DELETE /api/v1/paths/{id}` covers the documented delete/archive effect
  and subsequent read behavior.
- [x] `POST /api/v1/paths/{id}/merge` covers source/target ownership, invalid
  or same-target requests, and the resulting record reassignment.
- [x] `POST /api/v1/paths/{id}/restore` covers restoration and a subsequent
  read of the active state.
- [x] `POST /api/v1/paths/{id}/pin` covers pin and unpin outcomes.
- [x] `PUT /api/v1/paths/order` covers complete ordering, invalid/missing IDs,
  malformed body, list shape, and UUID item rejection before repository access, and
  persisted order (`PathAuthorizationApiTest.pathOrderingRejectsInvalidRequestBodiesBeforeRepositoryAccess`).

## Flow: Cover Labels operations

- [x] `GET /api/v1/labels` covers the unfiltered list, scope filtering, and
  owner isolation; an unknown scope returns 400 before service execution
  (`LabelApiTest.unknownLabelScopeIsRejectedBeforeServiceInvocation`).
- [x] `POST /api/v1/labels` covers creation, defaults, colors, and scopes.
  It also rejects blank/over-limit names and accepts the 80-character
  maximum (`LabelApiTest.invalidLabelPayloadIsRejected` and
  `LabelApiTest.labelNameLimitRejectsOverlongAndAcceptsMaximumLength`).
- [x] `PUT /api/v1/labels/{id}` covers update, invalid scope/color values, and
  assignment-sensitive restrictions; blank/over-limit names return 400 and
  the 80-character maximum succeeds
  (`LabelApiTest.labelUpdateValidatesNameAndAcceptsTheMaximumLength`).
- [x] `DELETE /api/v1/labels/{id}` covers unassigned deletion.
- [x] `DELETE /api/v1/labels/{id}?removeAssignments=true` covers explicit
  assignment removal while preserving the assigned records.
- [x] `DELETE /api/v1/labels/{id}` covers conflict behavior when assignments
  exist and assignment removal was not explicitly requested.
- [x] `GET /api/v1/labels/{id}/history` covers owner scope, timezone
  validation, totals, timeline, hourly values, and related labels.
- [x] `GET /api/v1/labels/{id}/history/records` covers every supported record
  kind, pagination, ordering, preview limits, and empty pages. Missing/unknown
  kind and non-integer page values return 400 before service access
  (`LabelApiTest.labelHistoryRequiresValidKindAndIntegerPageBeforeServiceInvocation`).
- [x] Label history excludes deleted or archived record types according to the
  documented contract.

## Flow: Cover Notes operations

- [x] `GET /api/v1/notes` covers active, archived, paginated, and query-filtered
  list behavior; negative page clamps to zero and page size clamps to 1–100.
  First, middle, final, and beyond-final pages return the expected results
  (`NoteListIntegrationTest.notePaginationClampsPageAndSizeAndReturnsAnEmptyFinalPage`).
- [x] `GET /api/v1/notes/labels` covers available NOTE labels and owner scope.
- [x] `GET /api/v1/notes/{id}` covers owned, missing, foreign, and archived
  note IDs.
- [x] `POST /api/v1/notes` covers standalone note creation and each supported
  path/activity/time-entry association.
- [x] `POST /api/v1/notes` covers rich-text content and server-derived
  `contentText` behavior.
- [x] `POST /api/v1/notes` rejects missing or blank required content and text
  over field limits, and accepts the exact title maximum
  (`NoteApiTest.noteCreateValidatesRequiredContentAndTextLimits`).
- [x] `PUT /api/v1/notes/{id}` covers successful update and persisted document
  fields.
- [x] `PUT /api/v1/notes/{id}` covers optimistic version success and stale
  version conflict behavior.
- [x] `PUT /api/v1/notes/{id}` rejects missing/blank content and title or
  contentText values over field limits, and accepts the maximum title
  (`NoteApiTest.noteUpdateValidatesRequiredContentAndTextLimits`).
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
  malformed body, list shape, and UUID item rejection before service access, and invalid or
  foreign note IDs (`NoteApiTest.noteOrderingRejectsInvalidRequestBodiesBeforeServiceAccess`).
- [x] Note line-history behavior covers unchanged lines, changed lines,
  first-edit migration behavior, and the documented large-document limit.

## Flow: Cover Logs and Activity operations

- [x] `GET /api/v1/logs` covers owner-scoped newest-first order and empty
  results. The endpoint has no filter or pagination query parameters.
- [x] `GET /api/v1/logs/{id}` covers owned, missing, and foreign log IDs.
- [x] `POST /api/v1/logs` covers creation, occurrence timestamp, and persisted
  body, plus required/blank timestamp and body validation and the 20,000-
  character body boundary (`LogApiTest.logBodyAndTimestampRespectRequiredAndMaximumLengthBoundaries`).
  Log labels are assigned through the separate labels operation.
- [x] `PUT /api/v1/logs/{id}` covers persisted body/time update and optimistic
  version conflict behavior; exact 20,000-character body passes request
  validation and missing/blank/over-limit inputs return 400
  (`LogApiTest.logBodyAndTimestampRespectRequiredAndMaximumLengthBoundaries`).
- [x] `PUT /api/v1/logs/{id}/labels` covers replacement semantics and requires
  owned labels with LOG scope; missing/null lists, non-array values, malformed
  UUID items, and 101 IDs return 400 before service execution, while exactly
  100 IDs pass request validation
  (`LogApiTest.logLabelAssignmentRequiresACollectionOfAtMostOneHundredIds`).
- [x] `DELETE /api/v1/logs/{id}` covers permanent removal and subsequent
  absence.
- [x] `GET /api/v1/activities` covers each supported `from`, `to`, `pathId`,
  and `type` filter independently; malformed timestamps, path IDs, and type
  names return 400 before service execution
  (`ActivityApiTest.malformedActivityFilterValuesAreRejectedBeforeTheServiceCall`).
- [x] Activity filtering covers inclusive/exclusive boundary behavior as
  documented for each supported date/time input.
- [x] Activity results do not reveal another user's records through direct or
  referenced IDs. Note creation with a foreign `activityId` is rejected by
  `CrossUserIsolationIntegrationTest.intruderCannotReferenceOwnedResourcesFromTheirOwnData`.

## Flow: Cover timers and time entries

- [x] `GET /api/v1/timers/current` covers empty, running, and paused timer
  states (paused sessions have no current running timer and remain in the draft).
- [x] `GET /api/v1/timers/draft` covers default and persisted idle selection
  state.
- [x] `PUT /api/v1/timers/draft` covers save, validation, owner-scoped path and
  label references, and running-timer conflict behavior.
- [x] `POST /api/v1/timers` covers server-owned start time, selected context,
  and one-running-timer behavior.
- [x] Concurrent `POST /api/v1/timers` requests preserve the one-running-timer
  invariant (`TimerPauseIntegrationTest.concurrentTimerStartsKeepThePostgresOneRunningTimerInvariant`);
  service behavior rejects a second start before target validation or mutation
  (`TimerServiceEdgeTest.startingWhileAnotherTimerRunsConflictsBeforeTargetValidationOrMutation`),
  and guarded PostgreSQL evidence directly exercises the partial unique index
  (`PostgresDatabaseConstraintIntegrationTest.postgresEnforcesTimeEntryChecksAndPathReferentialActions`).
- [x] `PUT /api/v1/timers/{id}` covers update, optional stop/end-time behavior,
  and owner-scoped timer IDs; null label lists and missing start values are
  rejected before service execution
  (`TimerApiTest.runningAndManualEntryRequestsRequireTheirLabelAndTimeFields`).
  Timer start, running update, and manual entry each accept a 5000-character
  description (`TimerApiTest.timerAndEntryDescriptionsAcceptTheirMaximumLength`).
- [x] `POST /api/v1/timers/stop` covers stopping the current timer.
- [x] `POST /api/v1/timers/{id}/stop` covers the explicit-ID alias and its
  parity with the canonical stop behavior.
- [x] `POST /api/v1/timers/cancel` covers canceling the current timer without
  recording tracked time.
- [x] `POST /api/v1/timers/{id}/cancel` covers the explicit-ID alias and its
  parity with canonical cancel behavior.
- [x] Stop behavior covers the under-two-second discard boundary
  (`TimerServiceEdgeTest.stoppingATimerUnderTwoSecondsDiscardsItInsteadOfSavingASession`;
  exactly two seconds is covered by `stoppingATimerAtTwoSecondsPersistsTheSession`).
- [x] `POST /api/v1/timers/pause` covers pause state and accumulated duration
  (`TimerPauseIntegrationTest.pauseRecordsTheSegmentAndKeepsTheSessionContext`).
- [x] `POST /api/v1/timers/resume` covers resumed segments and carried
  duration (`TimerPauseIntegrationTest.resumeContinuesThePausedSession`).
- [x] `POST /api/v1/timers/finish` covers completion of a paused session and
  confirms the recorded segment duration remains persisted
  (`TimerPauseIntegrationTest.finishEndsAPausedSession`).
- [x] Pause, resume, and finish invalid-state requests cover documented
  conflict behavior (`pauseWithoutARunningTimerConflicts`,
  `resumeRequiresAPausedSession`, and `finishEndsAPausedSession`).
- [x] Resume after a selected path becomes inactive covers validation and
  preservation of the paused draft (`TimerPauseIntegrationTest.resumeRequiresAPausedSession`).
- [x] `POST /api/v1/time-entries` covers manual entry creation, persisted
  duration/time, and missing/reversed interval validation; null label lists,
  missing end times, and over-limit descriptions return 400; exact maximum
  description length succeeds (`TimerApiTest.runningAndManualEntryRequestsRequireTheirLabelAndTimeFields`
  and `TimerApiTest.timerAndEntryDescriptionsAcceptTheirMaximumLength`).
- [x] `GET /api/v1/time-entries` covers owner-scoped newest-first ordering and
  optional page/size pagination metadata, including routing unpaged requests
  to the unpaged service operation, defaulting size to 50 when only page is
  set, and forwarding explicit page/size values
  (`TimerApiTest.timeEntryHistoryRoutesUnpagedAndExplicitlyPagedRequestsToService`);
  non-integer page/size values return 400 before service execution
  (`TimerApiTest.timeEntryHistoryRejectsNonIntegerPaginationBeforeServiceAccess`).
  Persisted first, middle, final, and empty-owner pages are covered by
  `TimeEntryHistoryIntegrationTest.historyIsOwnerScopedNewestFirstAndPaginatesWithMetadata`.
- [x] `GET /api/v1/time-entries/{id}` covers owned, missing, and foreign IDs.
- [x] `PUT /api/v1/time-entries/{id}` covers completed-entry editing,
  persisted targets/duration, foreign ownership, and invalid interval boundaries;
  null label lists return 400 before service execution
  (`TimerApiTest.runningAndManualEntryRequestsRequireTheirLabelAndTimeFields`).
- [x] `DELETE /api/v1/time-entries/{id}` covers soft-delete behavior, owner
  isolation, and subsequent detail/history visibility.
- [x] `GET /api/v1/statistics` covers tracked-seconds and date/path/label
  aggregation arithmetic, including cross-owner isolation.
- [x] Timer duration assertions use server responses or persisted rows:
  `TimerPauseIntegrationTest.pauseRecordsTheSegmentAndKeepsTheSessionContext`
  compares pause response, draft, and recorded entry;
  `TimerPauseIntegrationTest.finishEndsAPausedSession` compares paused response
  with persisted segment; `ManualTimeEntryIntegrationTest.manualEntryPersistsDurationAndRejectsInvalidIntervals`
  verifies response/readback duration; `TimerServiceEdgeTest.stoppingATimerUnderTwoSecondsDiscardsItInsteadOfSavingASession`
  and `TimerServiceEdgeTest.stoppingATimerAtTwoSecondsPersistsTheSession`
  verify stop threshold behavior from the service result.

## Flow: Cover timer WebSocket transport

- [x] The authenticated `/ws/timers` endpoint covers initial authentication,
  `READY`, state snapshots, and heartbeat behavior
  (`timerWebSocketReceivesCommittedStateForTheAuthenticatedUser`,
  `timerWebSocketPingsAuthenticatedClientsOftenEnoughForIdleProxies`).
- [x] The WebSocket endpoint covers malformed, missing-token, wrong-type, and
  invalid-token first-message behavior with policy-violation closure
  (`TimerWebSocketAuthIntegrationTest.malformedMissingAndWrongTypeFirstMessagesAreRejected`,
  `KnowIntegrationTest.timerWebSocketClosesAnInvalidAuthenticationWithPolicyViolation`).
- [x] WebSocket disconnect/reconnect evidence verifies REST remains
  authoritative and current timer state can be recovered after reconnect
  (`TimerWebSocketReconnectIntegrationTest.restRemainsAuthoritativeAndRecoversCurrentTimerAfterReconnect`).

## Flow: Cover Board and All boards operations

- [x] `GET /api/v1/boards` covers active, archived, include-hidden, and
  owner-scoped list behavior
  (`BoardListIntegrationTest.boardListDefaultsToVisibleActiveAndSupportsArchivedAndHiddenLists`).
- [x] `POST /api/v1/boards` covers custom board creation, trimmed response and
  readback, and the four ordered default statuses
  (`BoardCreationIntegrationTest.creatingCustomBoardReturnsAndPersistsBoardWithDefaultStatuses`);
  blank and over-120-character names return 400 while the 120-character limit
  succeeds (`BoardControllerApiTest.boardCreateRequiresNonblankNameAndAcceptsTheMaximumLength`).
- [x] `PUT /api/v1/boards/order` covers complete board ordering, duplicate and
  foreign board IDs, missing/null/empty/non-array lists and malformed UUID
  items, and unchanged order after rejected requests
  (`PinOrderIntegrationTest.boardOrderPersistsCompleteOwnedOrderAndRejectsDuplicateOrForeignIds`
  and `BoardControllerApiTest.boardOrderRequiresANonemptyIdList`).
- [x] `POST /api/v1/boards/{id}/visibility` covers persisted hide/unhide,
  active-list visibility, card preservation, custom-board conflict, and foreign
  ownership (`PathBoardIntegrationTest.hidingAPathBoardKeepsItsCards`,
  `visibilityOnlyAppliesToPathBoards`, and `pathBoardMutationsRejectForeignBoards`).
- [x] `POST /api/v1/boards/{id}/pin` covers pinning path and custom boards,
  persisted unpin state, pin ordering, and foreign ownership
  (`PathBoardIntegrationTest.anyBoardCanBePinned`,
  `pathBoardMutationsRejectForeignBoards`, and
  `PinOrderIntegrationTest.pinnedBoardJoinsTheEndOfThePinnedBoards`).
- [x] `GET /api/v1/boards/{id}` covers owned, missing, and foreign board IDs
  (`BoardDetailIntegrationTest.boardDetailReturnsOwnedBoardAndHidesMissingAndForeignBoards`).
- [x] `PUT /api/v1/boards/{id}` covers persisted custom-board rename and the
  path-board conflict (`BoardRenameIntegrationTest.customBoardRenamePersistsAndPathBoardRenameConflicts`);
  blank and over-limit names are rejected and the 120-character maximum is
  accepted (`BoardControllerApiTest.boardUpdateValidatesNameAndAcceptsTheMaximumLength`).
- [x] `POST /api/v1/boards/{id}/archive` covers response/detail state, archived
  and active list visibility, repeated archive idempotence, and mutation
  restrictions (`KnowIntegrationTest.archivedBoardsAreRetainedReadOnlyAndArchiveRestoreIsIdempotent`).
- [x] `POST /api/v1/boards/{id}/restore` covers response/detail state, active
  list visibility, and repeated restore idempotence
  (`KnowIntegrationTest.archivedBoardsAreRetainedReadOnlyAndArchiveRestoreIsIdempotent`).
- [x] `GET /api/v1/boards/{id}/statuses` covers board-owned ordered status
  results plus missing and foreign board IDs
  (`BoardCreationIntegrationTest.creatingCustomBoardReturnsAndPersistsBoardWithDefaultStatuses`,
  `BoardDetailIntegrationTest.boardDetailReturnsOwnedBoardAndHidesMissingAndForeignBoards`).
- [x] `POST /api/v1/boards/{id}/statuses` covers creation response, persisted
  board ownership, appended initial position, and foreign board protection
  (`BoardStatusCreateIntegrationTest.creatingStatusAppendsItAfterDefaultsAndPersistsItsBoardOwnership`).
- [x] `PUT /api/v1/boards/{id}/statuses/{statusId}` covers persisted rename,
  stable identity/position, and nested board ownership
  (`BoardStatusRenameIntegrationTest.statusRenamePersistsAndRejectsAStatusFromAnotherBoard`).
- [x] `PUT /api/v1/boards/{id}/statuses/{statusId}/sort` covers MANUAL,
  PRIORITY, and PRIORITY_LAST, priority ordering, and invalid/foreign/archived
  restrictions (`BoardColumnSortIntegrationTest.statusesDefaultToManualSort`,
  `BoardColumnSortIntegrationTest.statusSortCanBeSetAndCleared`,
  `BoardColumnSortIntegrationTest.priorityPagesOrderByPriorityThenPosition`,
  `BoardColumnSortIntegrationTest.statusSortRejectsUnknownValuesAndForeignBoards`,
  and `BoardControllerApiTest.statusSortRequiresAnExplicitSortMode`).
- [x] `PUT /api/v1/boards/{id}/statuses/order` covers full reorder, duplicate,
  missing, and foreign status IDs, missing/null/empty/non-array ID lists and
  malformed UUID items, with saved order preserved after rejected
  requests (`BoardStatusOrderIntegrationTest.statusOrderPersistsCompleteOrderAndRejectsDuplicateMissingAndForeignIds`
  and `BoardControllerApiTest.statusOrderRequiresANonemptyIdList`).
- [x] `POST /api/v1/boards/{id}/statuses/{statusId}/archive` covers moving
  active cards after existing destination cards, persisted archive state, and
  preventing removal of the final active status
  (`BoardStatusArchiveIntegrationTest.archivingStatusMovesCardsAfterExistingDestinationCards`,
  `BoardStatusArchiveIntegrationTest.archivingFinalActiveStatusConflicts`).
- [x] `POST /api/v1/boards/{id}/statuses/{statusId}/restore` covers active
  response/readback state, stable identity, position, and board ownership
  (`BoardStatusRestoreIntegrationTest.restoredStatusPersistsItsActiveStateIdentityAndPosition`).
- [x] `GET /api/v1/boards/{id}/cards` covers active default, status filter,
  archived filter, and foreign board isolation
  (`BoardCardListIntegrationTest.cardListDefaultsFiltersStatusesAndListsArchivedCardsForOwner`).
- [x] `GET /api/v1/boards/{id}/cards/page` covers empty/small/exact/overflow
  boundaries, safe default page size, stable cursor, PRIORITY and PRIORITY_LAST
  page walks, malformed/out-of-range cursor and limit rejection
  (`BoardControllerApiTest.cardPageValidatesCursorAndLimitBoundariesBeforeCardLookup`,
  `BoardControllerApiTest.cardPagesUseTwentyAsTheSafeDefaultAndReturnAStableCursor`,
  `BoardControllerApiTest.cardPagesHandleEmptySmallExactAndOverflowBoundaries`,
  `BoardColumnSortIntegrationTest.priorityPagesWalkEveryCardOnce`, and
  `BoardColumnSortIntegrationTest.priorityLastPagesOrderLowFirst`).
- [x] `POST /api/v1/boards/{id}/cards` covers persisted card creation with
  paths/labels, requested status/position, and date/status/path/label
  validation (`KnowIntegrationTest.boardCardsAcceptMultiplePathsAndBoardScopedLabels`
  and `BoardControllerApiTest.cardIsCreatedInTheRequestedStatusAtItsEnd`,
  `invalidCardDateRangeIsRejectedBeforePersistence`,
  `cardCreateRejectsAForeignOrArchivedStatus`,
  `cardCanReferenceMultipleOwnedPaths`, and
  `cardRejectsForeignPathAndLabelReferences`); titles over 240 characters
  return 400 and the exact maximum succeeds
  (`BoardControllerApiTest.cardTitleLimitRejectsOverlongAndAcceptsMaximumLength`).
- [x] `GET /api/v1/boards/{id}/cards/{cardId}` covers owned detail plus missing,
  foreign, and wrong-board card IDs
  (`BoardCardDetailIntegrationTest.cardDetailReturnsOwnedCardAndHidesMissingOrMisnestedCards`).
- [x] `PUT /api/v1/boards/{id}/cards/{cardId}` covers persisted scalar and
  owned-reference updates, foreign reference rejection, and stale
  `expectedUpdatedAt` conflict behavior
  (`BoardCardUpdateIntegrationTest.cardUpdatePersistsFieldsAndOwnedReferences`,
  `BoardControllerApiTest.staleCardUpdateReturnsConflictWithoutOverwritingTheNewerCard`,
  and `BoardControllerApiTest.cardRejectsForeignPathAndLabelReferences`).
- [x] `POST /api/v1/boards/{id}/cards/{cardId}/move` covers persisted target
  status/position order and rejection of foreign and archived statuses
  (`BoardCardMoveIntegrationTest.cardMovePersistsDestinationPositionAndRejectsForeignOrArchivedStatuses`);
  missing status and negative position are rejected at request binding by
  `BoardControllerApiTest.cardMoveRequiresStatusAndNonnegativePosition`.
- [x] `POST /api/v1/boards/{id}/cards/{cardId}/move-to-column` covers finding
  or creating the target column, persisted status/position, and foreign board
  protection; blank/over-80-character names and negative positions return 400
  without changing the card or creating a column, while an exact 80-character
  name moves the card and persists the new status
  (`AllBoardsIntegrationTest.moveToColumnCreatesAMissingColumn`).
- [x] `POST /api/v1/boards/{id}/cards/in-column` covers card creation in an
  existing or newly created column, response metadata, persisted placement,
  blank and over-80-character column rejection without creating a status,
  exact 80-character column acceptance, over-limit title rejection plus exact
  title maximum, and foreign requests
  (`AllBoardsIntegrationTest.createInColumnCreatesAMissingColumn` and
  `AllBoardsIntegrationTest.createInColumnEnforcesColumnNameMaximumWithoutCreatingInvalidStatus`).
- [x] `POST /api/v1/boards/{id}/cards/{cardId}/transfer` covers existing/new
  target columns, persisted transfer readback, path-board references, and
  foreign/archived board rejection
  (`AllBoardsIntegrationTest.transferMovesACardToAnotherBoard` and
  `AllBoardsIntegrationTest.transferRejectsForeignAndArchivedBoards`);
  missing and null destination IDs return 400 without moving the card.
- [x] `POST /api/v1/boards/{id}/cards/{cardId}/archive` covers response/detail
  state, archived vs active list visibility, and preserved relationships
  (`KnowIntegrationTest.archivingAndRestoringACardReturnsItsRelationships`).
- [x] `POST /api/v1/boards/{id}/cards/{cardId}/restore` covers active-status
  restoration, fallback to an active status after the prior status is archived,
  and persisted visibility/placement
  (`BoardCardRestoreIntegrationTest.restoringCardWithArchivedStatusFallsBackToFirstActiveStatus`
  and `KnowIntegrationTest.archivingAndRestoringACardReturnsItsRelationships`).
- [x] `GET /api/v1/boards/{id}/gantt` covers window validation, active dated,
  undated, and out-of-window cards per API behavior, plus archived-status
  filtering (`KnowIntegrationTest.ganttReturnsDatedCardsWithOpenViewDisabled`,
  `KnowIntegrationTest.ganttExcludesCardsInArchivedStatuses`,
  `BoardControllerApiTest.ganttIncludesUndatedAndOutOfWindowActiveCards`, and
  `BoardControllerApiTest.ganttRejectsReversedDateWindows`); missing, malformed,
  and impossible `from`/`to` values return 400 before repository access
  (`BoardControllerApiTest.boardGanttRequiresValidFromAndToDatesBeforeRepositoryAccess`).
- [x] `GET /api/v1/boards/all/columns` covers merged names/order, user tab
  scope, hidden/archived/foreign exclusions, and empty/authenticated behavior
  (`AllBoardsIntegrationTest.columnsMergeByNameInTabOrder` and
  `AllBoardsIntegrationTest.columnsCoverOnlyTheUsersTabBoards`).
- [x] `GET /api/v1/boards/all/columns/cards/page` covers cross-board cursors,
  many-page stability, empty/unknown columns, missing names, malformed and
  out-of-range cursor/limit values, foreign-user isolation, the first and middle
  pages, limits at 1 and 100, and sort modes
  (`AllBoardsIntegrationTest.columnPagesInterleaveBoardsByPosition`,
  `AllBoardsIntegrationTest.columnCursorWalkRemainsStableAcrossManyPages`, and
  `AllBoardsIntegrationTest.columnPagesFollowTheColumnSort`).
- [x] `PUT /api/v1/boards/all/columns/sort` covers per-user sort persistence,
  priority order across boards, isolation from board-local modes, reset, invalid
  body/name/sort values, and the exact 80-character name maximum
  (`AllBoardsControllerApiTest.columnSortValidatesRequiredNameLengthAndSortAtTheApiBoundary`,
  `AllBoardsIntegrationTest.mergedColumnSortIsStoredPerUserWithoutTouchingBoards`
  and `AllBoardsIntegrationTest.columnPagesFollowTheColumnSort`).
- [x] `GET /api/v1/boards/all/gantt` covers reversed range validation, returns
  dated and undated cards regardless of the requested window, and excludes
  archived boards and hidden path boards; missing and malformed date query
  values return 400
  (`AllBoardsIntegrationTest.ganttCoversEveryTabBoard`).
- [x] Multi-record board mutations cover PostgreSQL transaction rollback for
  board/status ordering, status archive card moves, card moves, and creating a
  status together with a card operation
  (`PostgresDatabaseConstraintIntegrationTest.postgresBoardTabOrderRollsBackEarlierRowsWhenLaterUpdateFails`,
  `postgresStatusOrderRollsBackEarlierRowsWhenLaterUpdateFails`,
  `postgresStatusArchiveRollsBackEarlierCardMovesWhenALaterMoveFails`,
  `postgresCardMoveRollsBackEarlierPositionUpdatesWhenLaterUpdateFails`,
  `postgresMoveToNewColumnRollsBackColumnWhenCardMoveFails`, and
  `postgresCardCreateRollsBackNewColumnWhenCardInsertFails`).

## Flow: Cover Calendar operations

- [x] `GET /api/v1/calendar/labels` covers alphabetical results, only the
  authenticated user's CALENDAR-scoped labels, multi-scope inclusion, and the
  empty state
  (`CalendarLabelPickerIntegrationTest.calendarLabelListIncludesOnlyOwnedCalendarScopedLabelsInNameOrder`).
- [x] `POST /api/v1/calendar/labels` covers trimmed creation, optional color,
  persisted palette color, and malformed or unsupported colors without creating
  records (`CalendarLabelPickerIntegrationTest.calendarLabelCreationPersistsOptionalPaletteColorAndRejectsOtherColors`);
  blank/over-limit names are rejected and the 80-character maximum is accepted
  (`CalendarLabelPickerIntegrationTest.calendarLabelNamesEnforceTheBlankAndMaximumLengthRules`).
- [x] `PUT /api/v1/calendar/labels/{id}` covers owner-only updates, response
  and list readback, day-assignment propagation, and invalid palette colors
  (`KnowIntegrationTest.calendarLabelColorCanBeChangedOnlyByItsOwnerAndFlowsToDayRecords`).
- [x] `DELETE /api/v1/calendar/labels/{id}` covers successful unused-label
  deletion, owner scoping, rejection for a label referenced by a historical
  day, and retained day assignment
  (`KnowIntegrationTest.calendarLabelDeleteRemovesUnusedLabelsAndPreservesLabelsReferencedByDays`).
- [x] `GET /api/v1/calendar/days` covers inclusive start/end records, invalid
  date text, reversed and over-year ranges, and the accepted one-year boundary
  (`KnowIntegrationTest.calendarDaysUseInclusiveBoundsAndRejectInvalidRanges`);
  missing, malformed, and impossible date query values return 400 before
  service access (`CalendarApiTest.calendarDaysRequireValidDateQueryValuesBeforeServiceAccess`).
- [x] `PUT /api/v1/calendar/days/{date}` covers replacing one day's note and
  label assignments, including persisted readback and omitted marker portions;
  malformed and impossible path dates return 400 before service execution
  (`CalendarApiTest.calendarDayWritesRejectMalformedPathDatesBeforeServiceAccess`);
  missing assignment IDs and duplicate labels are rejected before changing the
  saved day (`KnowIntegrationTest.calendarDayLifecycleSupportsNotesMarkersAndPortionedLeave`
  and `KnowIntegrationTest.calendarRejectsMalformedAssignmentsAndOutOfRangeChangesEndToEnd`);
  the 20000-character note limit is accepted and 20001 is rejected. Required
  assignment lists and nested label IDs also return 400 before service access
  (`CalendarApiTest.calendarWritesRequireAssignmentListsAndOwnedLabelIdsBeforeServiceAccess`).
- [x] `DELETE /api/v1/calendar/days/{date}` covers single-day deletion,
  subsequent absence, foreign-user isolation, repeated deletion, and malformed
  or impossible path-date rejection before service execution
  (`CalendarApiTest.calendarDayDeleteRejectsMalformedPathDatesBeforeServiceAccess`).
- [x] `PUT /api/v1/calendar/days/range` covers inclusive start/end mutation,
  preserves an existing note and label assignment, and confirms all changes
  through a subsequent range read
  (`KnowIntegrationTest.calendarRangeAppliesLeaveAcrossEveryDayWithoutReplacingExistingLabels`);
  required dates, assignment list, and nested label IDs return 400 before service
  access (`CalendarApiTest.calendarWritesRequireAssignmentListsAndOwnedLabelIdsBeforeServiceAccess`);
  missing/null/malformed start dates and a missing end date are rejected before
  service execution (`CalendarApiTest.calendarRangeRequiresValidDateBodyFieldsBeforeServiceAccess`).
- [x] Calendar day writes cover owned-label validation without mutating label
  scopes, foreign-label rejection, and each supported marker/portion value
  (`CalendarLabelPickerIntegrationTest.dayAcceptsAnOwnedLabelHiddenFromCalendarWithoutChangingItsScopes`,
  `CalendarLabelPickerIntegrationTest.anotherUsersLabelIsStillRejected`,
  `KnowIntegrationTest.calendarDayWritesPersistEverySupportedPortionAndMarkerValue`,
  and `KnowIntegrationTest.noMarkerCalendarLabelsPersistButDoNotAppearInReports`).
- [x] Calendar range operations cover malformed dates, reversed and over-year
  ranges, missing required start/end values, and acceptance of the one-year
  maximum span; range note length accepts 20000 characters and rejects 20001
  (`KnowIntegrationTest.calendarRejectsMalformedAssignmentsAndOutOfRangeChangesEndToEnd`).

## Flow: Cover Reports, Search, and Preferences

- [x] `GET /api/v1/reports` covers WEEK, MONTH, and YEAR windows anchored on
  leap day plus a WEEK window crossing a year boundary
  (`KnowIntegrationTest.reportPresetsUseAnchorBoundariesForLeapDayAndYearRollover`).
- [x] `GET /api/v1/reports` covers inclusive custom start/end dates and the
  maximum two-year span
  (`KnowIntegrationTest.customReportReturnsEachCalendarRangeDayForChartAndLogConsumers`,
  `KnowIntegrationTest.customReportAcceptsTheTwoYearMaximumWindowIncludingBothEndpoints`,
  and `ReportApiTest.customRangeAllowsTwoYearsButRejectsAnythingLonger`).
- [x] `GET /api/v1/reports` covers all five supported aggregation intervals
  and OR-within/AND-between path and label filter composition
  (`ReportApiTest.customDateRangeAcceptsEverySupportedAggregation`,
  `ReportServiceTest.customReportPreservesEverySupportedSankeyAggregation`,
  `ReportApiTest.pathAndLabelFiltersReachTheOwnedServiceTogether`, and
  `ReportServiceTest.labelFilterCombinesWithPathFilterAndKeepsOnlyMatchingEntries`).
- [x] Report assertions verify daily totals equal the report total, path and
  label category sums, clipped UTC boundary intervals, and exact leap-day
  half-open interval arithmetic
  (`ReportServiceTest.monthlyReportShowsDailyPathAndLabelBreakdownsWithClippedIntervals`,
  `KnowIntegrationTest.postgresReportRangeUsesUtcLeapDayAndExactHalfOpenInstantBoundaries`,
  and `KnowIntegrationTest.postgresRunningEntryReportUsesInjectedNowAtUtcDayBoundary`).
- [x] `GET /api/v1/search` covers every supported record type individually and
  a multi-type filter (`SearchIntegrationTest.findsEveryRecordTypeByItsOwnText`,
  `SearchIntegrationTest.everyRecordTypeCanBeSelectedIndividually`, and
  `SearchIntegrationTest.typesFilterNarrowsTheGroups`).
- [x] `GET /api/v1/search` covers query length/term limits, inclusive limit/offset
  boundaries, unknown types, and invalid fuzzy-mode values
  (`SearchApiTest.searchRejectsUnboundedQueryInput`,
  `SearchApiTest.searchAcceptsInclusiveQueryAndPageBoundaries`,
  `SearchApiTest.searchRejectsOutOfRangePagesAndUnknownTypes`, and
  `SearchIntegrationTest.invalidParametersAreRejected` /
  `manyTermsAreCappedRatherThanRejected`).
- [x] Search assertions cover literal ranking, fuzzy fallback, per-type cap,
  the incomplete/time-out response signal, archived visibility, and
  deleted-record exclusion
  (`SearchIntegrationTest.titlesRankExactThenPrefixThenContainedThenBody`,
  `SearchIntegrationTest.nearMissSpellingsMatchLongerTermsWhenNothingMatchesLiterally`,
  `SearchIntegrationTest.literalMatchesAnywhereKeepNearMissesOut`,
  `SearchIntegrationTest.totalsAreCappedAtTheCandidateLimit`,
  `SearchApiTest.searchResponseExposesIncompleteTimeoutSignal`,
  `SearchIntegrationTest.archivedRecordsAreIncludedAndFlagged`,
  `deletedSessionsAndPathsAreLeftOut`, and `deletedLogsDisappear`).
- [x] Search result assertions verify type-specific fields and owner-scoped
  path/label relationships
  (`SearchIntegrationTest.findsEveryRecordTypeByItsOwnText`,
  `SearchIntegrationTest.recordsMatchThroughTheirPathAndLabels`,
  `SearchIntegrationTest.directMatchesRankAboveMatchesThroughALabel`,
  `SearchIntegrationTest.anotherUsersLabelOrPathNeverCausesAMatch`, and
  `SearchIntegrationTest.otherUsersNeverSeeTheResults`).
- [x] `GET /api/v1/preferences` covers default and previously saved preference
  values for the signed-in user.
- [x] `PUT /api/v1/preferences` covers successful round trip and invalid
  preference values; board search accepts 200 characters, rejects 201, and
  Gantt sort state accepts two rules and rejects more than two without
  overwriting the saved state. Unknown theme, nested view, search over-limit,
  and invalid sort values are rejected at the HTTP boundary before service
  access (`PreferencesApiTest.preferenceRequestAndNestedBoardStateConstraintsRejectBeforeServiceAccess`)
  (`UserPreferencesIntegrationTest.boardStateEnforcesMaximumSearchAndGanttSortCount`).
- [x] Preferences remain isolated between two disposable users.

## Flow: Cover imports and exports

- [x] `POST /api/v1/imports/clockify` covers supported payload creation,
  project-to-path mapping, and persisted import-batch ownership; missing/null/
  empty lists, non-array values, and non-object list elements are rejected at
  the controller boundary
  (`ImportControllerApiTest.clockifyImportRequiresAtLeastOneEntryBeforeCallingTheService`
  and `KnowIntegrationTest.clockifyImportCreatesEntriesAndPaths`).
- [x] `POST /api/v1/imports/clockify` covers duplicate source IDs within one
  payload and across repeated imports, without duplicate persisted entries, and
  retains an audit batch per request
  (`KnowIntegrationTest.clockifyImportIsIdempotentOnDuplicateExternalId`).
- [x] `POST /api/v1/imports/clockify` covers malformed and unsupported input,
  interval validation, and rollback of a partially processed request
  (`KnowIntegrationTest.clockifyImportRejectsMalformedAndUnsupportedPayloadsWithoutPersistingData`
  and PostgreSQL-only
  `KnowIntegrationTest.postgresClockifyImportRollsBackEarlierPathEntryAndBatchOnLaterInvalidInterval`).
  Missing, null, and empty `timeentries` lists return 400 before invoking the
  import service (`ImportControllerApiTest.clockifyImportRequiresAtLeastOneEntryBeforeCallingTheService`).
- [x] `GET /api/v1/imports/clockify/batches` covers owner-scoped batch listing
  and ordering.
- [x] `DELETE /api/v1/imports/clockify/batches/{id}` covers undo effects,
  foreign batch rejection, and repeated-undo behavior.
- [x] `GET /api/v1/imports/knowledge-base/export` covers CSV content type,
  escaping, and export of the authenticated user's records only.
- [x] `POST /api/v1/imports/knowledge-base` covers valid CSV round trip,
  stable-ID duplicate handling, and supported legacy rows without color fields
  or log entities (`KnowIntegrationTest.knowledgeBaseImportRoundTripsAllEntitiesPropertiesRelationshipsAndUndo`,
  `KnowIntegrationTest.knowledgeBaseCsvImportAcceptsLegacyRowsWithoutColorOrLogEntities`,
  and `KnowledgeBaseTransferServiceTest.importingTheSameStableIdsSkipsExistingRecords`);
  missing body and non-CSV content type return 400/415 before service execution
  (`KnowledgeBaseTransferControllerApiTest.importRequiresCsvContentAndRejectsOtherMediaTypesBeforeServiceAccess`).
- [x] `POST /api/v1/imports/knowledge-base` covers malformed CSV, unsupported
  values, and rollback after an earlier valid row was processed
  (`KnowIntegrationTest.knowledgeBaseCsvImportRejectsMalformedAndUnsupportedRowsWithoutPartialState`
  and `KnowledgeBaseTransferServiceTest.rejectsMissingOversizedAndMalformedCsvBeforeCreatingAImportBatch`).
- [x] `GET /api/v1/imports/knowledge-base/batches` covers owner-scoped batch
  list behavior.
- [x] `DELETE /api/v1/imports/knowledge-base/batches/{id}` covers undo,
  imported-log removal, foreign-batch rejection, and repeat behavior.
- [x] Import and export coverage verifies label scopes and assignments plus
  linked path, session, note, calendar, activity, and log data according to the
  CSV contract
  (`KnowIntegrationTest.knowledgeBaseImportRoundTripsAllEntitiesPropertiesRelationshipsAndUndo`,
  `KnowIntegrationTest.knowledgeBaseCsvExportHasDownloadHeadersIsOwnerScopedAndRoundTripsEscapedText`,
  `KnowledgeBaseTransferServiceTest.exportContainsActiveDomainRecordsAndNestedAssignments`,
  and `KnowledgeBaseTransferServiceTest.exportContainsLogsAndTheirLabelAssignments`).

## Flow: Verify ownership and authentication boundaries

- [x] Every protected API route rejects an unauthenticated request with 401
  (`SecurityHardeningIntegrationTest.everyProtectedRouteRejectsAnonymousRequests`);
  the dynamic sweep discovers routes from Spring MVC mappings rather than
  duplicating a static path list.
- [x] Direct resource families have owner-visible records plus foreign and
  missing ID evidence for the same operation; foreign and missing IDs both
  return 404 and leave owner data unchanged
  (`CrossUserIsolationIntegrationTest.foreignAndMissingDirectIdsHaveTheSameNotFoundResponse`,
  `CrossUserIsolationIntegrationTest.intruderCannotReadChangeOrDeleteOwnedResources`,
  `BoardDetailIntegrationTest.boardDetailReturnsOwnedBoardAndHidesMissingAndForeignBoards`,
  `BoardCardDetailIntegrationTest.cardDetailReturnsOwnedCardAndHidesMissingOrMisnestedCards`,
  `NoteDetailIntegrationTest.noteDetailReturnsOwnedNoteAndHidesMissingForeignAndArchivedIds`,
  and `LogDetailIntegrationTest.logDetailReturnsOwnedLogAndHidesMissingAndForeignIds`).
- [x] Mutations that accept referenced IDs verify those IDs belong to the
  authenticated user, with foreign path/activity/entry/label/status/board
  references and unchanged owner data covered by
  `CrossUserIsolationIntegrationTest.intruderCannotReferenceOwnedResourcesFromTheirOwnData`.
- [x] Referenced path, label, board, status, card, activity, entry, and batch
  IDs are checked wherever applicable. Notes, timers, and cards are addressed
  directly by their own resource routes rather than accepted as references;
  import batch references are covered by the two owner-scoped undo tests below.
  Batch list and undo ownership are covered for both import types by
  `KnowIntegrationTest.knowledgeBaseBatchListAndUndoAreOwnerScopedAndRepeatedUndoIsIdempotent`
  and `clockifyBatchListAndUndoAreOwnerScopedOrderedAndIdempotent`; foreign
  and missing batch IDs both return 404.
- [x] Foreign resources are not distinguished from missing resources where
  the API contract intentionally returns not found: direct resource operations
  and both import batch undo routes assert identical 404 response bodies
  (`CrossUserIsolationIntegrationTest.foreignAndMissingDirectIdsHaveTheSameNotFoundResponse`,
  `KnowIntegrationTest.knowledgeBaseBatchListAndUndoAreOwnerScopedAndRepeatedUndoIsIdempotent`,
  and `clockifyBatchListAndUndoAreOwnerScopedOrderedAndIdempotent`).
- [x] Cross-user coverage uses disposable owner and intruder accounts and
  verifies responses plus unchanged owner data
  (`CrossUserIsolationIntegrationTest.intruderCannotReadChangeOrDeleteOwnedResources`,
  `CrossUserIsolationIntegrationTest.intruderCannotReferenceOwnedResourcesFromTheirOwnData`,
  `KnowIntegrationTest.knowledgeBaseBatchListAndUndoAreOwnerScopedAndRepeatedUndoIsIdempotent`,
  and `KnowIntegrationTest.clockifyBatchListAndUndoAreOwnerScopedOrderedAndIdempotent`).
- [x] Authenticated network, timeout, 404, 500, 502, 503, and 504 failures do
  not erase the current session; a stale 401 cannot clear a newer sign-in
  (`frontend/src/lib/api.test.ts`: `turns server failures into a human-readable error and preserves technical details`,
  `preserves client error text and sign-in on HTTP 404`,
  `preserves sign-in on HTTP %s`,
  `preserves sign-in when the API connection drops during deployment`,
  `aborts requests that remain pending for 15 seconds`, and
  `does not erase a newer sign-in when an older request returns 401`; verified
  with `cd frontend && npm test -- --run src/lib/api.test.ts` (16 tests passed).
- [x] Response status errors preserve their intended status and reason in the
  API error envelope (`ApiExceptionHandlerTest.domainStatusErrorsPreserveStatusAndReason`);
  authenticated and anonymous route outcomes are covered by the integration
  security and ownership tests.

## Flow: Verify validation, boundaries, and concurrency

- [ ] Every request DTO's required, length, format, and range validations have
  an assertion at the layer that owns the contract.
  Path merge's required target and UUID format are covered at the controller
  boundary by `PathAuthorizationApiTest.pathMergeRequiresAValidTargetId`.
  Board status create/update's blank and maximum-length rules are covered by
  `BoardControllerApiTest.statusCreateAndUpdateValidateRequiredNameAndMaximumLength`.
- [ ] Every path/query parameter with a documented allowed range has lower,
  upper, and out-of-range boundary evidence.
- [x] Date and timestamp operations have timezone, leap-day, inclusive-range,
  and reversed-range evidence where applicable. The API matrix links calendar
  and report leap-day/inclusive/reversed cases, requested-zone label history,
  activity's positive/negative offset and range-boundary assertions, manual
  time-entry and timer-configuration offset normalization, Clockify import
  offset normalization, and reversed board Gantt ranges. Activity evidence
  passed backend and guarded PostgreSQL jobs at source
  `e9c2109e9b7b82dcdfb8b87d6fdf6016e36c1335` in [PR #145 CI](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/38016095062);
  current-batch additions remain subject to the next backend run.
- [x] Pagination has first-page, middle-page, final-page, invalid-cursor, and
  invalid-limit evidence where applicable.
  The all-board column card page has a multi-page persisted walk and rejects
  cursors below `-1` and limits outside `1..100`
  (`AllBoardsIntegrationTest.columnPagesInterleaveBoardsByPosition` and
  `columnCursorWalkRemainsStableAcrossManyPages`). Note and time-entry history
  assert first/middle/final/beyond-final pages; label history walks six
  PostgreSQL-backed pages without gaps; search walks first, middle, final, and
  empty offsets; board cursor paging covers empty, exact, overflow, and invalid
  limits (`NoteListIntegrationTest.notePaginationClampsPageAndSizeAndReturnsAnEmptyFinalPage`,
  `TimeEntryHistoryIntegrationTest.historyIsOwnerScopedNewestFirstAndPaginatesWithMetadata`,
  `LabelHistoryIntegrationTest.postgresHighVolumeRecordPagesHaveStableOrderWithoutGaps`,
  `SearchIntegrationTest.groupsAreLimitedAndPagedWithATotal`, and
  `BoardControllerApiTest.cardPagesHandleEmptySmallExactAndOverflowBoundaries`,
  `BoardControllerApiTest.cardPageRejectsOutOfRangeAndMalformedCursorOrLimitBeforeCardLookup`).
- [ ] Ordered lists have stable tie-break and reorder persistence evidence
  where ordering is part of the contract.
- [x] Optimistic version or expected-update-time contracts have both current
  version success and stale version conflict evidence. Note saves, log updates,
  and board-card updates have successful persisted-update and stale-conflict
  assertions in their corresponding rows of [`01-api-matrix.md`](01-api-matrix.md);
  operations without an expected-version field do not claim this behavior.
- [x] Idempotent operations document and assert repeated-request outcomes
  where idempotency is part of the API contract. Evidence includes repeated
  calendar-day deletion, board archive and restore, Clockify duplicate source
  imports, and both import-batch undo routes; each corresponding operation row
  in [`01-api-matrix.md`](01-api-matrix.md) names the exact assertion and
  resulting state/count.
- [x] Concurrent timer-start behavior verifies the one-running-timer invariant
  through service behavior, concurrent HTTP starts, and the PostgreSQL
  uniqueness safeguard (tests linked in the timer operation row above).
- [ ] Multi-record mutation failures verify transaction rollback where
  persistence must remain atomic.
- [x] PostgreSQL-specific constraint assertions run only under the guarded
  disposable PostgreSQL path. `PostgresDatabaseConstraintIntegrationTest`
  assumes `KB_TEST_POSTGRES_URL`, and `IntegrationTestSupport` verifies that
  configured database with `PostgresTestDatabaseGuard` before wiring it into
  the suite. CI provisions a per-run database in the `backend-postgres` job
  (`.github/workflows/verify.yml`); migration transformation tests remain
  separately named under `db.migration`.
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
- [x] Every controller mapping, overload, and alias has exactly one inventory
  entry or a documented exclusion. At the recorded source baseline, 105
  mapping annotations compose to 107 routes; the matrix contains 107 unique
  method/path pairs and no duplicate rows.
- [x] Each state-changing operation asserts persisted state or an observable
  event, not only a successful HTTP response. The operation-by-operation audit
  and state evidence links are recorded above and in [`01-api-matrix.md`](01-api-matrix.md).
- [x] Each delete/archive/restore operation asserts the resulting state from a
  subsequent read or equivalent persistence observation. The operation rows
  identify active/archived list visibility, detail readback, or guarded
  persistence evidence as applicable.
- [x] Missing positive operation coverage remains visible as a gap even when
  broad security sweeps pass. Unknown board-card priority binding remains a
  maintainer-owned gap on all three affected operation rows.
- [ ] Existing HARD-01 through HARD-07 evidence is reused by link when it
  proves the required behavior; duplicate coverage is not added without a
  distinct risk.
- [ ] Acceptance evidence records the exact source revision, command or CI job,
  result, and report link.
- [ ] OTOTEST-02 is not marked complete until every operation and alias is
  covered or explicitly excluded, the API docs and matrix agree, and the
  required backend/PostgreSQL evidence is recorded.
