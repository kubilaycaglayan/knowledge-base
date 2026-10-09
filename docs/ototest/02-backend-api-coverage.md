# OTOTEST-02 — Backend API behavior coverage

**Priority:** High  
**Status:** Proposed  
**Dependencies:** OTOTEST-01

Track evidence and completion criteria in the [OTOTEST-02 acceptance
checklist](02-acceptance-checklist.md).

## Goal

Ensure each API operation has explicit tests for its successful contract and
the important failure/boundary behavior that applies to it. Keep shared
security sweeps as complementary evidence; they do not replace operation
behavior tests.

## Tasks

- [ ] Use the OTOTEST-01 endpoint matrix to identify operations without a
  positive functional assertion, including `/api/v1/preferences`, activity
  filtering, all-boards columns/sort/page/Gantt, import/export variants, and
  timer/time-entry aliases.
- [ ] For each uncovered operation, add or extend focused API/integration
  coverage for response status/body and persisted side effects.
- [ ] Cover invalid path/query/body inputs, missing referenced records, and
  conflict behavior where the operation supports them.
- [ ] Check ownership for both directly addressed resources and referenced
  resource IDs (paths, labels, boards/statuses/cards, notes, timers, and
  entries as applicable).
- [ ] Verify pagination, ordering, filters, inclusive date boundaries,
  archived state, and idempotency where part of the contract.
- [ ] Keep PostgreSQL-specific constraints, transaction rollback, and Flyway
  migration behavior in the guarded disposable PostgreSQL job.
- [ ] Add focused data migration assertions for each new migration that
  transforms existing rows; do not attempt to re-test every historical
  migration unless a regression or supported upgrade path requires it.
- [ ] Link API documentation operations to tests and update it when contracts
  change.

## Task workflow by API family

- **Auth:** register/login/Google config and token flow; `/me`; password
  update. Assert status/body, normalization, invalid credentials/inputs,
  rate-limit outcomes, and no credential/token leakage.
- **Paths, Labels, Notes, Logs:** list/detail/create/update/delete or archive,
  restore, merge/history, pin/order, label assignment, and note document
  operations. Assert persisted state, referenced-ID ownership, missing IDs,
  invalid values, duplicate names/relationships where constrained, and
  ordering/history stability.
- **Sessions/timers/time entries:** current/draft/start/update/stop/pause/
  resume/finish/cancel and aliases; list/detail/update/delete entries and
  statistics. Assert server-derived elapsed duration, one-running-timer
  invariant under concurrent requests, idempotency/conflict, invalid time
  boundaries, aliases matching canonical behavior, and owner isolation.
- **Boards/All boards:** board visibility/pin/order/archive/restore; statuses
  create/rename/sort/reorder/archive/restore; card create/detail/update/move,
  move-to-column, create-in-column, transfer, archive/restore, cursor pages,
  per-board and all-board Gantt; column list/page/sort. Assert transaction
  rollback, card/status/board/path ownership, stale update conflicts, ordering,
  archived target restrictions, page cursor boundaries, inclusive Gantt
  overlap and last-active-status safeguards.
- **Calendar/Activity/Reports/Search/Preferences:** filters and default values,
  date boundaries, sorting/empty results, preferences round trip and
  ownership, search filtering/ranking contract, aggregation arithmetic, and
  validation errors.
- **Imports/Exports:** Clockify import/batches/undo and Knowledge Base
  CSV import/export/batches/undo. Assert user scope, escaping/round-trip,
  malformed/unsupported input, duplicate handling, rollback/partial results,
  batch ownership and repeated undo semantics.
- **Cross-cutting:** run auth, cross-user, malformed-input, database-specific
  and migration-specific checks using the current hardening suites. Add a
  focused case only if the existing assertion does not exercise the specific
  endpoint contract.

## Test design

- Use controller/API tests for HTTP mapping, status, serialization, and error
  translation.
- Use service/domain tests for branching rules and deterministic boundary
  cases.
- Use integration tests when persistence, authorization, transactions, or
  multiple records are part of the behavior.
- Run database-specific behavior only against a verified disposable database
  under the existing PostgreSQL guard.
- Reuse the existing `SecurityHardeningIntegrationTest`,
  `CrossUserIsolationIntegrationTest`, and
  `InputValidationIntegrationTest`; do not duplicate their broad sweeps.

## Acceptance

- Every controller mapping and alias links to at least one named functional
  test, or has an explicit documented exclusion with rationale.
- Each state-changing operation asserts the resulting persisted state or
  emitted observable effect, not only a success status.
- Applicable invalid-input, ownership, conflict, and boundary cases are linked
  in the matrix.
- The backend test suite and PostgreSQL CI job pass; record exact CI/run links
  in the matrix.
- API docs and test references are updated in the same behavior change.
- Every controller method, composed route, and alias is accounted for; a
  shared anonymous-rejection sweep alone does not satisfy functional coverage.
- Every mutation asserts saved state by rereading through the API/repository
  or verifies an observable event; every delete/archive asserts subsequent
  absence or archived state and restore asserts returned state.
- Applicable tests cover missing/foreign direct IDs and foreign referenced
  IDs, invalid body/query/path input, boundary values, and conflict/rollback.
- The matrix names one fast unit/service check for domain rules, one API or
  persistence integration check for contract/state, and a browser E2E only
  where the client interaction or cross-layer risk requires it.
- PostgreSQL-only cases use the guarded disposable PostgreSQL path; no test
  cleanup can target a shared or production database.
