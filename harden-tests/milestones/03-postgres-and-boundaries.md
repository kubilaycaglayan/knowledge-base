# HARD-03: PostgreSQL behavior, time boundaries, and result volume

**Priority:** High  
**Status:** In Progress
**Scope:** Test coverage and documentation only.

Track completion in the [HARD-03 acceptance checklist](03-acceptance-checklist.md).

## Why this milestone exists

Most backend integration tests use H2. `SearchPostgresIntegrationTest` gives
valuable real PostgreSQL coverage for search and Flyway, but it does not
establish behavior for the other queries, constraints, transaction semantics,
ordering, or concurrency that differ from H2. The current plan also calls out
time boundaries and empty/large result sets.

## Tasks

- [x] Build an inventory mapping database-sensitive behavior to service,
  repository, migration, and existing test evidence. The source-backed map and
  outstanding PostgreSQL criteria are in the
  [HARD-03 acceptance checklist](03-acceptance-checklist.md).
- [x] Add an opt-in or CI PostgreSQL integration profile using a unique,
  disposable database/container initialized only by Flyway. Fail fast if the
  configured database is not empty or is not explicitly marked disposable;
  never point this job at a persistent development or production database.
- [x] Cover PostgreSQL invariants for boards/cards, notes and line-history,
  labels and assignments, imports/transfers, and timer/time-entry writes where
  query or constraint behavior matters.
- [ ] Add rollback cases for each multi-step operation that can fail after an
  earlier write; current coverage proves transactional import rollback.
- [x] Add deterministic date/time boundary tests for UTC day/week/month report
  windows, leap days, month/year rollover, entries exactly at `from`/`to`,
  zero-duration intervals, and running entries cut off at injected `now`.
  Report and timer services use an injectable UTC clock.
- [ ] Establish the Gantt `from`/`to` filtering contract before asserting
  inclusive date-only board ranges; current API returns all active dated cards.
- [x] Add empty and high-volume result tests for search, reports, calendar,
  board cursor pages, label history, and exports. Assert stable ordering,
  continuation/no-duplicate behavior, caps, and bounded response shape.
- [x] Add PostgreSQL races for the one-running-timer invariant, optimistic
  note/card versions, card moves, board/status reorders, and repeated log/time
  entry label assignments.
- [ ] Add races for other label/assignment joins and board-tab ordering where
  concurrent requests can collide.
- [x] Run Flyway migration tests from the supported baseline and on an already
  migrated disposable database. Include a migration smoke path that proves
  application startup does not rely on Hibernate schema mutation.
- [x] Document local invocation and CI evidence in `docs/testing.md`, including
  the disposable database guard and cleanup behavior.

The run recorded in [HARD-03 PostgreSQL evidence](../runs/2026-10-08-hard03-postgres.md)
passes the full PostgreSQL suite and migrated startup check. The milestone
remains in progress because rollback breadth, other assignment joins, broader
direct-constraint coverage, and the backend meaning of Gantt range dates
remain open. The report and timer services now accept an injectable UTC
clock; `LabelHistoryService` continues to use wall time directly.

## Acceptance evidence

- PostgreSQL tests use a unique empty database and run migrations from the
  repository's migration history; no H2 substitute is used for the cases in
  this milestone.
- The backend PostgreSQL suite is part of a repeatable CI or release gate, with
  logs identifying PostgreSQL version and migration result.
- Time tests are deterministic and cover exact boundary inclusivity and
  time-zone assumptions in service/API contracts.
- Volume tests validate correctness and paging invariants without brittle
  wall-clock thresholds; performance thresholds belong to HARD-05.

## Relevant sources

- `backend/src/test/java/com/know/integration/SearchPostgresIntegrationTest.java`
- `backend/src/test/java/com/know/integration/IntegrationTestSupport.java`
- `backend/src/main/java/com/know/service/ReportService.java`
- `backend/src/main/java/com/know/service/TimerService.java`
- `backend/src/main/java/com/know/service/CalendarService.java`
- `backend/src/main/java/com/know/service/BoardService.java`
- `backend/src/main/resources/db/migration/`
- `docs/testing.md`
