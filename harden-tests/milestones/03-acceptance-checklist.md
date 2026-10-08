# HARD-03 acceptance checklist: PostgreSQL, time, and volume

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
| Real PostgreSQL profile | [`SearchPostgresIntegrationTest`](../../backend/src/test/java/com/know/integration/SearchPostgresIntegrationTest.java) is the only test class found using `KB_TEST_POSTGRES_URL`; it extends [`SearchIntegrationTest`](../../backend/src/test/java/com/know/integration/SearchIntegrationTest.java), enables Flyway, and sets Hibernate `ddl-auto=validate`. | Add a repeatable CI/release invocation and include non-search repository/service suites that need PostgreSQL semantics. Record PostgreSQL version and Flyway result. |
| H2 integration profile | [`IntegrationTestSupport`](../../backend/src/test/java/com/know/integration/IntegrationTestSupport.java) uses H2 PostgreSQL mode, Hibernate `create-drop`, Flyway disabled, and a Java alias for `word_similarity`. Most integration suites use this profile. | Treat H2 coverage as useful domain/API evidence only; do not count it as migration, PostgreSQL operator, index, constraint, or transaction evidence. |
| Trigram search | [V5](../../backend/src/main/resources/db/migration/V5__search_trigram_indexes.sql), [V66](../../backend/src/main/resources/db/migration/V66__global_search.sql), and [`SearchService`](../../backend/src/main/java/com/know/service/SearchService.java) use `pg_trgm`, GIN indexes, `<%`, `word_similarity`, `lower`, and `coalesce`. [`SearchPostgresIntegrationTest`](../../backend/src/test/java/com/know/integration/SearchPostgresIntegrationTest.java) runs the existing search cases on PostgreSQL. | Preserve actual PostgreSQL coverage for fuzzy matching, literal-vs-fuzzy ranking, Unicode/case behavior, result caps/pages, and migration/index startup. Record the database extension/version. |
| Partial and expression unique indexes | [V2](../../backend/src/main/resources/db/migration/V2__core_domain.sql) (one running timer per user), [V4](../../backend/src/main/resources/db/migration/V4__case_insensitive_user_email.sql) (case-insensitive email), [V6](../../backend/src/main/resources/db/migration/V6__google_identity.sql) (Google subject), [V7](../../backend/src/main/resources/db/migration/V7__clockify_import_identity.sql) (import identity), [V19](../../backend/src/main/resources/db/migration/V19__daily_calendar_records.sql) (daily-label name), [V27](../../backend/src/main/resources/db/migration/V27__unify_labels.sql) (label name), and [V45](../../backend/src/main/resources/db/migration/V45__path_boards.sql) (one path board per path) define database uniqueness not represented by a simple entity field constraint. | Assert duplicate and concurrent-write outcomes on PostgreSQL, including whether the application maps constraint violations to stable API responses and whether another user remains independent. |
| Database checks and referential actions | [V1](../../backend/src/main/resources/db/migration/V1__foundation.sql)/[V2](../../backend/src/main/resources/db/migration/V2__core_domain.sql) define JSONB metadata, note-target and progress checks, `timestamptz`, and time-entry duration/order checks. [V19](../../backend/src/main/resources/db/migration/V19__daily_calendar_records.sql)/[V27](../../backend/src/main/resources/db/migration/V27__unify_labels.sql) define calendar/label checks and cascades. [V43](../../backend/src/main/resources/db/migration/V43__boards.sql)/[V49](../../backend/src/main/resources/db/migration/V49__board_column_sorts.sql) define board/status/card checks, join-table keys, and cascades. | Exercise representative invalid direct writes and deletes/restores against PostgreSQL to prove constraints, `ON DELETE CASCADE`, and `ON DELETE SET NULL` match domain expectations. Distinguish API validation tests from database enforcement tests. |
| Native repository queries | [`TimeEntryRepository`](../../backend/src/main/java/com/know/domain/TimeEntryRepository.java) contains native user-scoped lookup, import identity, and recent-path SQL; [`PathRepository`](../../backend/src/main/java/com/know/domain/PathRepository.java) contains native ordered lookup, including-deleted lookup, and restore SQL; [`BoardCardRepository`](../../backend/src/main/java/com/know/domain/BoardCardRepository.java) contains native priority-page SQL. | Run the affected repository/service paths on PostgreSQL and assert UUID mapping/casts, null ordering, stable tie ordering, deleted-row scope, updates, and page boundaries. |
| Time and date storage | Migrations use `timestamptz` for instants and `date` for daily records and card ranges. [`ReportService`](../../backend/src/main/java/com/know/service/ReportService.java) derives UTC day windows and calls `Instant.now()`; [`TimerService`](../../backend/src/main/java/com/know/service/TimerService.java) and [`LabelHistoryService`](../../backend/src/main/java/com/know/service/LabelHistoryService.java) also read wall time directly. | Add deterministic PostgreSQL-backed endpoint/repository boundaries for exact instants, UTC date windows, DST/zone conversion where contractual, zero-duration and running entries. Current services do not expose an injected clock seam. |
| Pages and result volume | H2 tests cover search caps/pages ([`SearchIntegrationTest`](../../backend/src/test/java/com/know/integration/SearchIntegrationTest.java)), merged-board cursor behavior ([`AllBoardsIntegrationTest`](../../backend/src/test/java/com/know/integration/AllBoardsIntegrationTest.java)), and label-history pages ([`LabelHistoryIntegrationTest`](../../backend/src/test/java/com/know/integration/LabelHistoryIntegrationTest.java)). | Repeat database-sensitive query cases on PostgreSQL with empty, boundary, and high-volume fixtures; verify deterministic order, no gaps/duplicates, correct next cursor, and bounded response size. |
| Concurrency and rollback | H2 tests cover sequential stale note-version responses ([`NoteVersionIntegrationTest`](../../backend/src/test/java/com/know/integration/NoteVersionIntegrationTest.java)) and service-level timer/import behavior ([`TimerServiceEdgeTest`](../../backend/src/test/java/com/know/service/TimerServiceEdgeTest.java), [`ClockifyImportServiceTest`](../../backend/src/test/java/com/know/service/ClockifyImportServiceTest.java)); no PostgreSQL-specific concurrency suite or injected transaction-failure matrix was found. | Race timer starts, stale note/card writes, board moves/order, and duplicate identities on PostgreSQL. Force failure after an earlier step and prove the transaction leaves no partial rows or associations. |

- [ ] Review each row for newly added native queries, constraints, indexes,
  cascades, or transaction behavior and link the resulting PostgreSQL test.
- [ ] Verify the repository/CI inventory directly when completing the
  milestone; the current source audit found no CI invocation of
  `SearchPostgresIntegrationTest`.
- [ ] Run the suite against a unique disposable PostgreSQL database/container
  with the supported PostgreSQL version recorded in output.
- [ ] Fail before executing tests if the database is non-empty, not explicitly
  disposable, or points at a protected/persistent host.
- [ ] Apply the repository's Flyway migration history and record migration
  versions/results; never enable Hibernate schema creation/update for this run.
- [ ] Verify startup and tests from the supported migration baseline and from
  an already migrated disposable database where both paths are supported.
- [ ] Prove cleanup is scoped to the test container/database and does not drop
  a shared or protected volume.
- [ ] Include the exact invocation, environment variables required (names
  only), and cleanup behavior in `docs/testing.md` without recording secrets.
  Explicitly state that the current opt-in test does not perform the empty or
  disposable-target check itself until a guard is implemented.

## Domain and concurrency behavior

- [ ] Exercise PostgreSQL boards/cards, note versions and line history, labels
  and assignments, imports/transfers, and timer/time-entry writes when schema
  or query behavior is database-sensitive.
- [ ] Cover rollback after each multi-step operation fails after an earlier
  write; assert no partial child, association, or audit data remains.
- [ ] Concurrently attempt to start timers for one user and prove exactly one
  running timer remains and all returned responses reflect persisted state.
- [ ] Race stale note/card versions and assert the documented conflict response
  preserves the winner's content and version.
- [ ] Race board ordering/moves and duplicate label/assignment writes where
  concurrent calls can violate ordering or uniqueness; assert invariant and
  stable API outcomes.
- [ ] Confirm every case is user-scoped and cross-user references remain
  rejected under PostgreSQL as well as H2.

## Time and result boundaries

- [ ] Treat the existing `ReportServiceTest` cases (UTC year report, inclusive
  custom range, same-day empty report, clipping, and running-entry clipping) as
  service-level baseline only; they do not prove PostgreSQL query boundaries.
- [ ] Treat the existing `LabelHistoryIntegrationTest` `Europe/Istanbul` case
  as H2 integration evidence only; preserve it and add PostgreSQL coverage for
  date-to-instant conversion.
- [ ] Freeze/inject the clock; assert UTC day, week, and month report boundaries
  including events exactly at inclusive/exclusive endpoints.
- [ ] Cover date-only board range inclusivity, leap day, month/year rollover,
  zero-duration intervals, and a running entry ending at the injected `now`.
- [ ] Record and assert the timezone used to translate API dates into query
  boundaries; include an offset/DST transition case if supported by contract.
- [ ] Cover empty and high-volume search, reports, calendar, board cursor pages,
  label history, and exports using deterministic fixture sizes.
- [ ] Assert stable ordering, no duplicate or missing records across page
  boundaries, valid continuation tokens, documented caps, and bounded response
  shape; do not gate on noisy wall-clock timing here.
- [ ] Ensure fixture cleanup is complete even when an assertion or migration
  fails, and include the failing database logs in ignored artifacts.
- [ ] Link CI or release-gate results and name every omitted database-sensitive
  area before marking the milestone complete.
