# HARD-03 PostgreSQL run evidence

- Date (UTC): 2026-10-08
- Start/end time (UTC): 22:43–22:45 (full PostgreSQL run); migrated startup followed immediately
- Commit under test: `75e8b2a` (card-lock fix; report/checklist edits followed the run)
- Exact invocation: documented two-run disposable PostgreSQL procedure in [`docs/testing.md`](../../docs/testing.md#backend-tests); all integration suites ran with `KB_TEST_POSTGRES_URL`, `KB_TEST_POSTGRES_USER`, `KB_TEST_POSTGRES_PASSWORD`, `KB_TEST_POSTGRES_DISPOSABLE=true`, and empty mode. Then `gradle test --no-daemon --tests '*SearchPostgresIntegrationTest'` ran with `KB_TEST_POSTGRES_MODE=migrated`.
- Exit status: full PostgreSQL suite PASS; migrated startup/search PASS; H2 suite PASS
- PostgreSQL target: `kb_test_hard03_20261008224346_2958932`, unique loopback database in disposable container
- Container image: `postgres:16-alpine` (reported server version PostgreSQL 16.15, Alpine x86_64)
- Migrations: Flyway validated and applied 63 migrations from the repository baseline through v67; Hibernate used `ddl-auto=validate`.
- Full backend outcomes: PostgreSQL 394 tests, 0 failures, 0 errors, 0 skipped. H2 394 tests, 0 failures, 0 errors, 39 skipped (environment-specific skips).
- Guard checks: empty disposable target passed. A separate empty-mode run against an already-migrated database failed before tests as expected. Code inspection confirms the guard also rejects a missing disposable marker and non-loopback targets.
- Cleanup: local command trap stopped only the uniquely named `kb-test-hard03-*` container; no volume was mounted or removed. CI uses the per-job PostgreSQL service, which GitHub removes with the job.
- PostgreSQL evidence: the Gradle XML reports contained the database name/version, empty-database check, and Flyway migration result. Migrated-mode XML recorded `Flyway version v67`.
- Artifacts: backend Gradle XML/HTML reports are generated under ignored `backend/build/test-results/test` and `backend/build/reports/tests/test`; no credentials or personal data are retained.

The first card concurrency run reproduced two successful updates for one
`expectedUpdatedAt`. The committed regression now proves one update succeeds
and one returns HTTP 409; the separate production fix locks the owned card row
before checking the timestamp. Focused PostgreSQL and API tests and the full
PostgreSQL suite passed after the fix.

## Remaining HARD-03 evidence gaps

- Time-sensitive services still call the wall clock directly. Exact report
  range instants, UTC day/week/month windows, leap day, and year rollover are
  covered, but injected-clock running-entry cutoffs and a deterministic DST
  transition case are not.
- PostgreSQL tests do not yet race board moves/order or duplicate label and
  assignment writes.
- Import rollback is covered for a later invalid record after an earlier path
  insert; equivalent failure-after-write coverage for each other multi-step
  transfer/association flow is not complete.
- High-volume calendar, report, board cursor, and export shapes are covered;
  high-volume label-history paging and explicit empty-result cases across each
  endpoint family remain open.
- Direct database checks and referential actions have representative coverage
  for time constraints and path deletion. Other constraint families and
  restore-specific database behavior need additional direct-write cases.

See the [HARD-03 acceptance checklist](../milestones/03-acceptance-checklist.md)
for itemized completion status. This report does not mark the milestone
complete.
