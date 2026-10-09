# HARD-03 acceptance checklist: PostgreSQL, time, and volume

**Status:** Complete

Use this checklist with [HARD-03](03-postgres-and-boundaries.md). H2 results
may supplement PostgreSQL evidence but cannot satisfy PostgreSQL-specific
criteria.

## PostgreSQL safety and migrations

- [x] Inventory the current PostgreSQL-sensitive surface against migrations,
  repositories, and tests. Keep this map synchronized when those sources
  change.

### Source-backed coverage map

| Surface | Current source and evidence | Remaining acceptance evidence |
| --- | --- | --- |
| Real PostgreSQL profile | [`IntegrationTestSupport`](../../backend/src/test/java/com/know/integration/IntegrationTestSupport.java) routes all integration suites to PostgreSQL when `KB_TEST_POSTGRES_URL` is set, enables Flyway, and sets Hibernate `ddl-auto=validate`; [`SearchPostgresIntegrationTest`](../../backend/src/test/java/com/know/integration/SearchPostgresIntegrationTest.java) covers the migrated startup path. | Keep CI output/evidence current when migration or profile setup changes. |
| H2 integration profile | [`IntegrationTestSupport`](../../backend/src/test/java/com/know/integration/IntegrationTestSupport.java) uses H2 PostgreSQL mode, Hibernate `create-drop`, Flyway disabled, and a Java alias for `word_similarity`. Most integration suites use this profile. | Treat H2 coverage as useful domain/API evidence only; do not count it as migration, PostgreSQL operator, index, constraint, or transaction evidence. |
| Trigram search | [V5](../../backend/src/main/resources/db/migration/V5__search_trigram_indexes.sql), [V66](../../backend/src/main/resources/db/migration/V66__global_search.sql), and [`SearchService`](../../backend/src/main/java/com/know/service/SearchService.java) use `pg_trgm`, GIN indexes, `<%`, `word_similarity`, `lower`, and `coalesce`. [`SearchPostgresIntegrationTest`](../../backend/src/test/java/com/know/integration/SearchPostgresIntegrationTest.java) runs the existing search cases on PostgreSQL. | Preserve actual PostgreSQL coverage for fuzzy matching, literal-vs-fuzzy ranking, Unicode/case behavior, result caps/pages, and migration/index startup. Record the database extension/version. |
| Partial and expression unique indexes | [V2](../../backend/src/main/resources/db/migration/V2__core_domain.sql) (one running timer per user), [V4](../../backend/src/main/resources/db/migration/V4__case_insensitive_user_email.sql) (case-insensitive email), [V6](../../backend/src/main/resources/db/migration/V6__google_identity.sql) (Google subject), [V7](../../backend/src/main/resources/db/migration/V7__clockify_import_identity.sql) (import identity), [V19](../../backend/src/main/resources/db/migration/V19__daily_calendar_records.sql) (daily-label name), [V27](../../backend/src/main/resources/db/migration/V27__unify_labels.sql) (label name), and [V45](../../backend/src/main/resources/db/migration/V45__path_boards.sql) (one path board per path) define database uniqueness not represented by a simple entity field constraint. PostgreSQL tests race timer starts and repeated note, calendar-day/range, time-entry, log, board-card, tracker-draft label/path assignments, plus same-name label/scope creation; they also exercise import identity/index constraints. | Preserve these races when the corresponding assignment flows change. |
| Database checks and referential actions | [V1](../../backend/src/main/resources/db/migration/V1__foundation.sql)/[V2](../../backend/src/main/resources/db/migration/V2__core_domain.sql) define JSONB metadata, note-target and progress checks, `timestamptz`, and time-entry duration/order checks. [V19](../../backend/src/main/resources/db/migration/V19__daily_calendar_records.sql)/[V27](../../backend/src/main/resources/db/migration/V27__unify_labels.sql) define calendar/label checks and cascades. [V43](../../backend/src/main/resources/db/migration/V43__boards.sql)/[V49](../../backend/src/main/resources/db/migration/V49__board_column_sorts.sql) define board/status/card checks, join-table keys, and cascades. `PostgresDatabaseConstraintIntegrationTest` verifies active-schema time, path, note-target, daily-record, board-card, log, label-color, import-source, and preference-theme checks; one-running-timer uniqueness; and delete cascade/set-null behavior. It does not assert checks from the retired item/progress schema or the migrated-away `daily_label` table. | Add direct-write checks for additional constraints when those boundaries change. |
| Native and locked repository queries | [`TimeEntryRepository`](../../backend/src/main/java/com/know/domain/TimeEntryRepository.java) contains native user-scoped lookup, import identity, and recent-path SQL; [`PathRepository`](../../backend/src/main/java/com/know/domain/PathRepository.java) contains native ordered lookup, including-deleted lookup, and restore SQL; [`BoardCardRepository`](../../backend/src/main/java/com/know/domain/BoardCardRepository.java) contains native priority-page SQL and a locked card update; [`DailyRecordRepository`](../../backend/src/main/java/com/know/domain/DailyRecordRepository.java) locks existing calendar rows; [`UserRepository`](../../backend/src/main/java/com/know/domain/UserRepository.java) locks an owner while creating missing calendar dates and labels. | Run the affected repository/service paths on PostgreSQL and assert UUID mapping/casts, null ordering, stable tie ordering, deleted-row scope, updates, and page boundaries. |
| Time and date storage | Migrations use `timestamptz` for instants and `date` for daily records and card ranges. [`ReportService`](../../backend/src/main/java/com/know/service/ReportService.java) and [`TimerService`](../../backend/src/main/java/com/know/service/TimerService.java) use an injectable UTC `Clock`. `KnowIntegrationTest` pins report time and checks UTC day/week/month windows, leap day, exact half-open instants, rollover, and a running-entry cutoff on PostgreSQL. [`LabelHistoryIntegrationTest`](../../backend/src/test/java/com/know/integration/LabelHistoryIntegrationTest.java) checks requested-zone month/hour conversion and the New York spring-forward transition on PostgreSQL. Gantt `from`/`to` define a client viewport: the API returns every active card, including undated and out-of-window cards, and preserves card dates as `LocalDate`; the client clips bars to the inclusive visible days. | `LabelHistoryService` still uses the system clock. Keep the documented Gantt viewport behavior and date-only round-trip coverage aligned. |
| Pages and result volume | `SearchIntegrationTest` checks a 1,003-result cap and page boundaries on PostgreSQL; `AllBoardsIntegrationTest` checks a 55-card cursor walk; `KnowIntegrationTest` checks a full leap year of calendar days, 48 report entries, and stable ordering for 60 exported logs; `LabelHistoryIntegrationTest` checks six ordered pages of 55 sessions. Existing empty search/history/page/export cases also run on PostgreSQL through the shared profile. | Add any newly introduced endpoint family's empty/high-volume PostgreSQL case to this inventory. |
| Concurrency and rollback | PostgreSQL integration tests race timer starts, note versions, card timestamps/moves, board-tab order, status reorders, every active label/assignment join family, and same-name label/scope creation. Rollback tests force failures after writes in imports and undo, path merge/create/rename/restore/order, calendar updates and labels, note create/update/audit events, board status/order/card flows, label updates/assignments, timer lifecycle/configuration/cancel, and time-entry edits. | The source-by-source audit found remaining transactional paths are read-only or single-row writes. Add failure-after-write cases when a future change introduces multi-write behavior. |

- [x] Review each row for newly added native queries, constraints, indexes,
  cascades, or transaction behavior and link the resulting PostgreSQL test.
- [x] Verify the repository/CI inventory directly when completing the
  milestone; the audit now finds full PostgreSQL coverage in the
  `backend-postgres` job and a migrated startup invocation.
- [x] Run the suite against a unique disposable PostgreSQL database/container
  with the supported PostgreSQL version recorded in output.
- [x] Fail before executing tests if the database is non-empty, not explicitly
  disposable, or points at a protected/persistent host.
- [x] Apply the repository's Flyway migration history and record migration
  versions/results; never enable Hibernate schema creation/update for this run.
- [x] Verify startup and tests from the supported migration baseline and from
  an already migrated disposable database where both paths are supported.
- [x] Prove cleanup is scoped to the test container/database and does not drop
  a shared or protected volume.
- [x] Include the exact invocation, environment variables required (names
  only), and cleanup behavior in `docs/testing.md` without recording secrets.
  The harness now performs the empty/disposable-target checks before Spring
  starts; an empty-mode refusal against an already migrated database was
  verified and recorded in the run evidence.

## Domain and concurrency behavior

- [x] Exercise PostgreSQL boards/cards, note versions and line history, labels
  and assignments, imports/transfers, and timer/time-entry writes when schema
  or query behavior is database-sensitive.
- [x] Cover rollback after multi-step operations fail after an earlier write;
  assert no partial child, association, or audit data remains. PostgreSQL
  failure-after-write cases cover import and undo, path merge/create/rename/
  restore/order, board seeding/status/card movement/order/create, calendar
  day/range/label updates, note create/update and audit writes, label
  assignments and changes, timer start/stop/pause/resume/configure/cancel,
  time-entry edits, and association cleanup. The source-by-source audit found
  remaining transactional paths are read-only or single-row writes.
- [x] Concurrently attempt to start timers for one user and prove exactly one
  running timer remains and all returned responses reflect persisted state.
- [x] Race stale note/card versions and assert the documented conflict response
  preserves the winner's content and version.
- [x] Race card moves, board/status reorders, and repeated log/time-entry label
  assignment writes; assert persisted invariants and stable API outcomes.
- [x] Add races for other database-backed label/assignment joins where
  concurrent calls can collide, including note labels, calendar day/range
  labels, board card paths/labels, and timer draft labels. Same-name label and
  scope creation also runs concurrently against PostgreSQL.
- [x] Confirm every case is user-scoped and cross-user references remain
  rejected under PostgreSQL as well as H2.

## Time and result boundaries

- [x] Treat the existing `ReportServiceTest` cases (UTC year report, inclusive
  custom range, same-day empty report, clipping, and running-entry clipping) as
  service-level baseline only; they do not prove PostgreSQL query boundaries.
- [x] Preserve the `LabelHistoryIntegrationTest` `Europe/Istanbul` case and run
  it under PostgreSQL; add the `America/New_York` spring-forward conversion
  case there as well.
- [x] Freeze/inject the clock; assert UTC day, week, and month report boundaries
  including events exactly at inclusive/exclusive endpoints.
- [x] Establish the date-only Gantt contract: `from`/`to` describe the
  inclusive client viewport; the API returns all active cards, including
  undated and out-of-window cards. PostgreSQL tests preserve date-only values,
  and client calendar tests cover inclusive endpoints and clipping.
- [x] Cover leap day, month/year rollover, zero-duration intervals, and a
  running entry ending at the injected `now`.
- [x] Record and assert UTC report boundaries and requested-zone conversion,
  including the supported `America/New_York` spring-forward transition.
- [x] Cover empty and high-volume search, reports, calendar, board cursor pages,
  label history, and exports using deterministic fixture sizes.
- [x] Assert stable ordering, no duplicate or missing records across page
  boundaries, valid continuation tokens, documented caps, and bounded response
  shape; do not gate on noisy wall-clock timing here.
- [x] Ensure fixture cleanup is complete even when an assertion or migration
  fails; the documented trap stops only the disposable PostgreSQL container.
- [x] Capture PostgreSQL container logs in ignored artifacts for diagnosis of
  database constraint failures; the documented cleanup trap also saves them
  when a test or migration command fails.
- [x] Link CI or release-gate results and name every omitted database-sensitive
  area before marking the milestone complete.

HARD-03 is **Complete**. The test inventory, CI gate, migration paths, target
guard, concurrency races, clock/DST boundaries, active-schema PostgreSQL
constraints, volume checks, and rollback coverage are complete. The audit
found no remaining multi-write transactional paths without failure-after-write
coverage; future multi-write changes should add matching rollback probes. See
the dated [run evidence](../runs/2026-10-08-hard03-postgres.md).
