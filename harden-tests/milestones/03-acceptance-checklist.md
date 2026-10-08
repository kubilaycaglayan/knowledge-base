# HARD-03 acceptance checklist: PostgreSQL, time, and volume

Use this checklist with [HARD-03](03-postgres-and-boundaries.md). H2 results
may supplement PostgreSQL evidence but cannot satisfy PostgreSQL-specific
criteria.

## PostgreSQL safety and migrations

- [ ] Inventory native SQL, PostgreSQL operators/types, indexes/constraints,
  cascades, transaction boundaries, and locking assumptions by service and
  repository; link each item to its test.
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
