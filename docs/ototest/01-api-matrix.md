# OTOTEST-01 — Backend API operation inventory

**Source revision:** `ce71ce50af11d9b7e8853e65e1a6f9c8cec45245` (`origin/main` baseline)  
**Source review:** `backend/src/main/java/com/know/api/*Controller.java` on 2026-10-09  
**Inventory reviewer:** Codex source review; maintainer review outstanding.  
**Evidence candidates:** `backend/src/test/java/com/know/api/`, `.../integration/`, and `.../service/`  
**Execution commands:** `docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"`; PostgreSQL-specific integration tests use the guarded disposable PostgreSQL path. Tests were not run in OTOTEST-01.

All operations require authentication unless the row says public. The authenticated principal is the owner scope for user data. “Candidate” identifies a suite to inspect; it is not a coverage claim until an assertion is mapped to the operation. `Gap` means the inventory has not established a named assertion for that operation.

| Verb + composed path | Controller method / inputs | Candidate evidence / current classification | State and important edges to map |
| --- | --- | --- | --- |
| GET `/api/v1/auth/google/config` | `AuthController.googleConfig`; none; public | `AuthControllerApiTest`; assertion-level mapping gap | Client ID config, absent config |
| POST `/api/v1/auth/register` | `AuthController.register`; credentials; public | `AuthControllerApiTest`; rate-limit tests in `AuthAttemptLimiterTest`, `SecurityHardeningIntegrationTest` | Created account/token, duplicate email, invalid input, throttling |
| POST `/api/v1/auth/login` | `AuthController.login`; credentials; public | Same candidates | Token/account response, invalid credentials, throttling |
| POST `/api/v1/auth/google` | `AuthController.google`; ID token; public | Same candidates plus `GoogleIdTokenIdentityVerifierTest` | Valid/invalid identity, link/create behavior, throttling |
| GET `/api/v1/auth/me` | `AuthController.account`; auth principal | `AuthControllerApiTest`; assertion-level mapping gap | Current account, invalid/missing principal |
| PUT `/api/v1/auth/password` | `AuthController.setPassword`; current/new password | `AuthControllerApiTest`; assertion-level mapping gap | Password update, wrong current password, Google-only account |
| GET `/api/v1/paths` | `PathController.list` | `PathAuthorizationApiTest` (`pathListIncludesBackendComputedActivityLabels`); `KnowIntegrationTest` | Owner scope, hidden/archived state |
| POST `/api/v1/paths` | `PathController.create`; `PathRequest` | `PathAuthorizationApiTest` (`pathNamesAreValidatedBeforePersistence`, `pathColorsAcceptPaletteHexValuesAndRejectUnsafeValues`) | Persistence, name/color validation |
| GET `/api/v1/paths/{id}` | `PathController.get` | `PathAuthorizationApiTest` (`authenticatedUserCannotReadAnotherUsersPath`) | Missing/foreign ID |
| GET `/api/v1/paths/{id}/summary` | `PathController.summary` | `PathAuthorizationApiTest`; named success assertion not established | Summary aggregation, missing/foreign ID |
| PUT `/api/v1/paths/{id}` | `PathController.update`; `PathRequest` | `PathAuthorizationApiTest`; named persisted update assertion not established | Validation, foreign ID, board/path consistency |
| DELETE `/api/v1/paths/{id}` | `PathController.delete` | `PathAuthorizationApiTest`; assertion-level gap | Archive/delete effect, referenced records |
| POST `/api/v1/paths/{id}/merge` | `PathController.merge`; `targetPathId` | `PathManagementServiceTest`; API assertion-level gap | Self/foreign target, transfer/history persistence |
| POST `/api/v1/paths/{id}/restore` | `PathController.restore` | `PathAuthorizationApiTest` (`restoringAnotherUsersOrMissingPathIsRejected`) | Foreign/missing ID and restored state |
| POST `/api/v1/paths/{id}/pin` | `PathController.pin`; `pinned` | `PathAuthorizationApiTest` (`pinningRequiresOwnershipAndPersistsTheRequestedState`) | Owner check and persisted requested state |
| PUT `/api/v1/paths/order` | `PathController.order`; ordered `pathIds` | `PathAuthorizationApiTest` (`pathOrderingRejectsForeignIds`) | Full membership, duplicate/foreign IDs, stable order |
| GET `/api/v1/labels` | `LabelController.list` | `LabelApiTest`; `KnowIntegrationTest`; success assertion mapping gap | Owner, scopes, empty list |
| GET `/api/v1/labels/{id}/history` | `LabelController.history` | `LabelHistoryIntegrationTest`; API named assertion gap | History traversal, cycles, foreign ID |
| GET `/api/v1/labels/{id}/history/records` | `LabelController.records` | `LabelHistoryIntegrationTest`; API named assertion gap | Related record list, paging/empty/foreign |
| POST `/api/v1/labels` | `LabelController.create`; request | `LabelApiTest` (`invalidLabelPayloadIsRejected`) | Validation, duplicate and persisted label |
| PUT `/api/v1/labels/{id}` | `LabelController.update`; request | `LabelApiTest`; named persisted update assertion not established | Ownership, scope/color/name update |
| DELETE `/api/v1/labels/{id}` | `LabelController.delete` | `LabelApiTest`; named post-delete assertion not established | Ownership, usages, subsequent absence |
| GET `/api/v1/logs` | `LogController.get`; list/query inputs | `KnowIntegrationTest`, `InputValidationIntegrationTest`; exact mapping gap | Filter/paging/order, empty list, owner scope |
| GET `/api/v1/logs/{id}` | `LogController.get`; path `id` | `KnowIntegrationTest`; exact mapping gap | Missing/foreign ID |
| POST `/api/v1/logs` | `LogController.create`; `LogRequest` | `LogServiceTest`, `KnowIntegrationTest`; exact persisted assertion mapping gap | Text/time validation, persisted result |
| PUT `/api/v1/logs/{id}` | `LogController.update`; request/version | `LogServiceTest`, `LineEditsIntegrationTest`; endpoint mapping gap | Owner, stale version conflict, persisted edit |
| DELETE `/api/v1/logs/{id}` | `LogController.delete` | `KnowIntegrationTest`; endpoint mapping gap | Owner and subsequent absence |
| PUT `/api/v1/logs/{id}/labels` | `LogController.setLabels`; label IDs | `KnowIntegrationTest`; endpoint mapping gap | Foreign label, persistence and readback |
| GET `/api/v1/activities` | `ActivityController.list`; filters/query | No operation-specific API test confirmed | Date/path/type filters, ownership, empty results |
| GET `/api/v1/reports` | `ReportController.report`; dates, period, aggregation, path/label filters | `ReportApiTest` (`customDateRangeAcceptsAnIndependentAggregation`, `pathAndLabelFiltersReachTheOwnedServiceTogether`, `reportPeriodAndAnchorReachTheOwnedService`, `customRangeAllowsTwoYearsButRejectsAnythingLonger`) | Invalid/reversed/oversized ranges, aggregation, filters, empty data |
| GET `/api/v1/search` | `SearchController.search`; `q`, `limit`, `offset`, `types` | `SearchApiTest`, `SearchIntegrationTest`, `SearchPostgresIntegrationTest` | Query/type validation, pagination, owner filtering, ranking |
| GET `/api/v1/preferences` | `PreferencesController.get` | `UserPreferencesIntegrationTest`; operation-level API mapping gap | Defaults and per-user isolation |
| PUT `/api/v1/preferences` | `PreferencesController.update`; theme/board state | `UserPreferencesIntegrationTest`; operation-level API mapping gap | Validation, round trip, ownership of board reference |
| GET `/api/v1/timers/current` | `TimerController.current` | `TimerApiTest`, `TimerPauseIntegrationTest`; mapping to named assertions outstanding | No running timer, running/paused state |
| GET `/api/v1/timers/draft` | `TimerController.draft` | `TimerApiTest`; named success mapping gap | Draft retrieval and owner scope |
| PUT `/api/v1/timers/draft` | `TimerController.saveDraft` | `TimerApiTest`; named state mapping gap | Draft persistence/clear behavior |
| POST `/api/v1/timers` | `TimerController.start` | `TimerApiTest`, `TimerServiceEdgeTest`, `SecurityHardeningIntegrationTest` | One-running invariant, conflicts, referenced owner IDs |
| PUT `/api/v1/timers/{id}` | `TimerController.configure` | `TimerApiTest`; named mapping gap | Running timer update, ownership and time bounds |
| POST `/api/v1/timers/stop` | `TimerController.stop`; canonical alias | `TimerApiTest`, `TimerPauseIntegrationTest`; alias parity assertion gap | Stop effect, no-current conflict |
| POST `/api/v1/timers/{id}/stop` | `TimerController.stop`; ID alias | Same candidates; alias parity assertion gap | Foreign/mismatched ID and same state effect |
| POST `/api/v1/timers/pause` | `TimerController.pause` | `TimerPauseIntegrationTest`, `TimerApiTest` | State transition and repeated pause |
| POST `/api/v1/timers/resume` | `TimerController.resume` | `TimerPauseIntegrationTest`, `TimerApiTest` | State transition, repeated resume |
| POST `/api/v1/timers/finish` | `TimerController.finish` | `TimerApiTest`, `TimerServiceEdgeTest` | Persisted entry/duration and invariant |
| POST `/api/v1/timers/cancel` | `TimerController.cancel`; canonical alias | `TimerApiTest`; alias parity mapping gap | Cancellation and no-current conflict |
| POST `/api/v1/timers/{id}/cancel` | `TimerController.cancel`; ID alias | Same candidates; alias parity mapping gap | Foreign/mismatched ID and same effect |
| POST `/api/v1/time-entries` | `TimerController.manual` | `TimerApiTest`, `KnowIntegrationTest` | Persisted manual entry, times/labels/path validation |
| GET `/api/v1/time-entries` | `TimerController.history`; filters/page | `TimerApiTest`, `KnowIntegrationTest` | Owner, filtering, paging and order |
| GET `/api/v1/time-entries/{id}` | `TimerController.get` | `TimerApiTest`; named owner assertion mapping gap | Missing/foreign ID |
| PUT `/api/v1/time-entries/{id}` | `TimerController.edit` | `TimerApiTest`, `KnowIntegrationTest` | Persisted edit, validation, foreign ID |
| DELETE `/api/v1/time-entries/{id}` | `TimerController.remove` | `TimerApiTest`, `KnowIntegrationTest` | Delete followed by absence, foreign ID |
| GET `/api/v1/statistics` | `TimerController.statistics` | `TimerApiTest`, `ReportServiceTest`; API assertion gap | Date boundaries, empty data, owner scope |
| GET `/api/v1/calendar/labels` | `CalendarController.labels` | `CalendarApiTest`, `CalendarLabelPickerIntegrationTest` | Scope, ordering, ownership |
| POST `/api/v1/calendar/labels` | `CalendarController.createLabel` | `CalendarApiTest`; persisted success mapping gap | Validation and persisted label |
| PUT `/api/v1/calendar/labels/{id}` | `CalendarController.updateLabel` | `CalendarApiTest`; persisted success mapping gap | Owner and update readback |
| DELETE `/api/v1/calendar/labels/{id}` | `CalendarController.deleteLabel` | `CalendarApiTest`; absence mapping gap | Referenced label and subsequent absence |
| GET `/api/v1/calendar/days` | `CalendarController.days`; date range | `CalendarApiTest`, `KnowIntegrationTest` | Inclusive bounds, owner and empty range |
| PUT `/api/v1/calendar/days/range` | `CalendarController.replaceRange` | `CalendarApiTest`, `KnowIntegrationTest` | Range boundaries, allocation validation, persistence |
| PUT `/api/v1/calendar/days/{date}` | `CalendarController.replaceDay` | `CalendarApiTest`, `KnowIntegrationTest` | Date parsing, allocation and persistence |
| DELETE `/api/v1/calendar/days/{date}` | `CalendarController.deleteDay` | `CalendarApiTest`; absence mapping gap | Date behavior and subsequent absence |
| POST `/api/v1/imports/clockify` | `ImportController.clockify` | `ImportControllerApiTest`, `ClockifyImportServiceTest` | Validation, batch state, duplicate/partial errors |
| GET `/api/v1/imports/clockify/batches` | `ImportController.batches` | `ImportControllerApiTest`; owner/paging mapping gap | Owner scope, order, empty list |
| DELETE `/api/v1/imports/clockify/batches/{id}` | `ImportController.undo` | `ImportControllerApiTest`; persisted undo mapping gap | Owner, undo effects, repeated undo |
| GET `/api/v1/imports/knowledge-base/export` | `KnowledgeBaseTransferController.export` | `KnowledgeBaseTransferControllerApiTest`, `KnowledgeBaseTransferServiceTest` | CSV contract, escaping, Unicode, strict owner scope |
| POST `/api/v1/imports/knowledge-base` (`text/csv`) | `KnowledgeBaseTransferController.importCsv` | Same candidates | Round trip, malformed/unsupported input, rollback/report |
| GET `/api/v1/imports/knowledge-base/batches` | `KnowledgeBaseTransferController.batches` | Same candidates; owner/paging mapping gap | Owner scope, order, empty list |
| DELETE `/api/v1/imports/knowledge-base/batches/{id}` | `KnowledgeBaseTransferController.undo` | Same candidates; state mapping gap | Owner, undo effect, repeated undo |
| GET `/api/v1/boards` | `BoardController.list`; `archived`, `includeHidden` | `BoardControllerApiTest` (class), `KnowIntegrationTest`; operation assertions require reconciliation | Defaults, filtering, owner scope |
| POST `/api/v1/boards` | `BoardController.create` | `BoardControllerApiTest`, `KnowIntegrationTest`; named persistence mapping gap | Create board/default status, validation |
| PUT `/api/v1/boards/order` | `BoardController.order` | `PinOrderIntegrationTest`; endpoint assertion mapping gap | Complete owned set, invalid/duplicate IDs, order persistence |
| POST `/api/v1/boards/{id}/visibility` | `BoardController.visibility` | `BoardControllerApiTest`; named mapping gap | Owner and persisted visibility |
| POST `/api/v1/boards/{id}/pin` | `BoardController.pin` | `PinOrderIntegrationTest`; endpoint assertion mapping gap | Owner and persisted pin state |
| GET `/api/v1/boards/{id}` | `BoardController.get` | `BoardControllerApiTest`; named mapping gap | Missing/foreign ID |
| PUT `/api/v1/boards/{id}` | `BoardController.update` | `BoardControllerApiTest`; named mapping gap | Path-board restriction, validation, state |
| POST `/api/v1/boards/{id}/archive` | `BoardController.archive` | `BoardControllerApiTest`, `KnowIntegrationTest`; mapping gap | Custom board rule, archive state |
| POST `/api/v1/boards/{id}/restore` | `BoardController.restore` | Same candidates; mapping gap | Restored state and owner |
| GET `/api/v1/boards/{id}/statuses` | `BoardController.statusList` | `BoardControllerApiTest`; mapping gap | Ordered statuses and owner |
| POST `/api/v1/boards/{id}/statuses` | `BoardController.createStatus` | `BoardControllerApiTest`; mapping gap | New status and position |
| PUT `/api/v1/boards/{id}/statuses/{statusId}` | `BoardController.updateStatus` | `BoardControllerApiTest`; mapping gap | Status belongs to board, persisted rename |
| PUT `/api/v1/boards/{id}/statuses/{statusId}/sort` | `BoardController.sortStatus` | `BoardColumnSortIntegrationTest`; mapping gap | Sort mode and priority ordering |
| PUT `/api/v1/boards/{id}/statuses/order` | `BoardController.reorderStatuses` | `BoardControllerApiTest`; mapping gap | Every status required, persisted order |
| POST `/api/v1/boards/{id}/statuses/{statusId}/archive` | `BoardController.archiveStatus` | `BoardControllerApiTest`; mapping gap | Last active status conflict, card move and archive |
| POST `/api/v1/boards/{id}/statuses/{statusId}/restore` | `BoardController.restoreStatus` | `BoardControllerApiTest`; mapping gap | Persisted status restoration |
| GET `/api/v1/boards/{id}/cards` | `BoardController.cardList`; `statusId`, `archived` | `BoardControllerApiTest`, `KnowIntegrationTest`; mapping gap | Filters, owner, archived state |
| GET `/api/v1/boards/{id}/cards/page` | `BoardController.cardPage`; `statusId`, `cursor`, `limit` | `BoardControllerApiTest`; mapping gap | Cursor boundaries and sort modes |
| POST `/api/v1/boards/{id}/cards` | `BoardController.createCard` | `BoardControllerApiTest`, `LineEditsIntegrationTest`; mapping gap | Ownership of referenced paths/labels, date validation, persistence |
| GET `/api/v1/boards/{id}/cards/{cardId}` | `BoardController.getCard` | `BoardControllerApiTest`; mapping gap | Missing/foreign card and board mismatch |
| PUT `/api/v1/boards/{id}/cards/{cardId}` | `BoardController.updateCard` | `BoardControllerApiTest`, `LineEditsIntegrationTest`; mapping gap | Stale version conflict, referenced ownership, persistence |
| POST `/api/v1/boards/{id}/cards/{cardId}/move` | `BoardController.moveCard` | `BoardControllerApiTest`; mapping gap | Status ownership, archived target, position |
| POST `/api/v1/boards/{id}/cards/{cardId}/move-to-column` | `BoardController.moveCardToColumn` | `BoardControllerApiTest`; mapping gap | Create/reuse column and card placement |
| POST `/api/v1/boards/{id}/cards/in-column` | `BoardController.createCardInColumn` | `BoardControllerApiTest`; mapping gap | Transactional status/card creation and validation |
| POST `/api/v1/boards/{id}/cards/{cardId}/transfer` | `BoardController.transferCard` | `BoardControllerApiTest`; mapping gap | Source/target ownership, transfer rollback/state |
| POST `/api/v1/boards/{id}/cards/{cardId}/archive` | `BoardController.archiveCard` | `BoardControllerApiTest`; mapping gap | Archived state and owner |
| POST `/api/v1/boards/{id}/cards/{cardId}/restore` | `BoardController.restoreCard` | `BoardControllerApiTest`; mapping gap | Restore/fallback status, persisted state |
| GET `/api/v1/boards/{id}/gantt` | `BoardController.gantt`; `from`, `to` | `BoardControllerApiTest`; mapping gap | Inclusive overlap and reversed range |
| GET `/api/v1/boards/all/columns` | `AllBoardsController.columns` | `AllBoardsIntegrationTest`; named mapping gap | Aggregate columns, owner and empty state |
| GET `/api/v1/boards/all/columns/cards/page` | `AllBoardsController.columnPage`; `name`, `cursor`, `limit` | `AllBoardsIntegrationTest`; mapping gap | Cursor/limit validation, cross-board owner scope |
| PUT `/api/v1/boards/all/columns/sort` | `AllBoardsController.sortColumn`; name/sort | `AllBoardsIntegrationTest`; mapping gap | Persisted preference and ordering |
| GET `/api/v1/boards/all/gantt` | `AllBoardsController.gantt`; `from`, `to` | `AllBoardsIntegrationTest`; mapping gap | Inclusive overlap, active statuses, reversed range |

## Notes and checklist

The matrix lists every mapping found in the controllers. `BoardControllerApiTest`, `TimerApiTest`, and similar class references are candidate suites, not proof that every row has a positive operation assertion. A maintainer review should confirm exact methods and identify gaps before marking acceptance complete. The `/api/v1/timers/stop` and `/api/v1/timers/cancel` aliases are separate rows so their parity can be verified. API authentication, owner isolation, invalid input, persisted effects, and PostgreSQL-only constraints are separate evidence dimensions; a broad rejection sweep does not establish a successful operation contract.

When controller mappings or API contracts change, update the affected row and the API documentation in the same change. Use exact test method names after reading the test; retain `Gap` until a meaningful assertion is verified.
