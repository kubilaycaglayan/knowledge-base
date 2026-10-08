# HARD-03 PostgreSQL run evidence

- Date (UTC): 2026-10-08
- Start/end time (UTC): 23:13–23:15 (final full PostgreSQL run); migrated startup followed immediately
- Commit under test: `2f9a3db` (time-entry label concurrency fix; board-tab ordering and label race tests were in `c86bb51`)
- Exact invocation: documented two-run disposable PostgreSQL procedure in [`docs/testing.md`](../../docs/testing.md#backend-tests); all integration suites ran with `KB_TEST_POSTGRES_URL`, `KB_TEST_POSTGRES_USER`, `KB_TEST_POSTGRES_PASSWORD`, `KB_TEST_POSTGRES_DISPOSABLE=true`, and empty mode. Then `gradle test --no-daemon --tests '*SearchPostgresIntegrationTest'` ran with `KB_TEST_POSTGRES_MODE=migrated`.
- Exit status: full PostgreSQL suite PASS; migrated startup/search PASS; H2 suite PASS
- PostgreSQL target: `kb_test_hard03_final_20261008231340_3017425`, unique loopback database in a disposable container
- Container image: `postgres:16-alpine` (reported server version PostgreSQL 16.15, Alpine x86_64)
- Migrations: Flyway validated and applied 63 migrations from the repository baseline through v67; Hibernate used `ddl-auto=validate`.
- Full backend outcomes: PostgreSQL 403 tests, 0 failures, 0 errors, 0 skipped. H2 403 tests, 0 failures, 0 errors, 48 skipped (environment-specific PostgreSQL-only cases).
- Guard checks: empty disposable target passed. A separate empty-mode run against an already-migrated database failed before tests as expected. Code inspection confirms the guard also rejects a missing disposable marker and non-loopback targets.
- Cleanup: local command trap stopped only the uniquely named `kb-test-hard03-*` container; no volume was mounted or removed. CI uses the per-job PostgreSQL service, which GitHub removes with the job.
- PostgreSQL evidence: the Gradle XML reports contained the database name/version, empty-database check, and Flyway migration result. Migrated-mode XML recorded `Flyway version v67`.
- Artifacts: backend Gradle XML/HTML reports are generated under ignored `backend/build/test-results/test` and `backend/build/reports/tests/test`. PostgreSQL direct-constraint error logs were retained at `backend/build/kb-test-hard03-final-20261008231340_3017425-postgres.log`; no credentials or personal data are retained.

The card concurrency regression reproduced two successful updates for one
`expectedUpdatedAt`. Its fix locks the owned card row before checking the
timestamp. The repeated log-label assignment regression reproduced HTTP 500;
its fix locks the owned log row while replacing assignments. A second
regression found HTTP 500 when two time-entry edits replaced the same labels;
the fix locks the owned time-entry row. Both assignment races pass, along with
concurrent card moves, status reorders, and board-tab reorders. The suite also
checks requested-zone history across the New York spring-forward transition.

## Remaining HARD-03 evidence gaps

- PostgreSQL tests pin an injected UTC clock for report and timer endpoints and a running
  entry cutoff. The Gantt API accepts date range parameters but currently
  returns all active dated cards; the product contract must clarify filtering
  before range inclusivity can be asserted. A DST/zone conversion case is not
  part of the current UTC report contract.
- PostgreSQL tests race card moves, status reorders, board-tab reorders, and
  repeated log/time-entry label assignments. Other assignment join rows still
  need races.
- Import rollback is covered for a later invalid record after an earlier path
  insert; equivalent failure-after-write coverage for each other multi-step
  transfer/association flow is not complete.
- High-volume search, calendar, report, board cursor, label-history, and export
  shapes and representative empty-result cases are covered. Newly added
  endpoint families need corresponding cases added to the inventory.
- Direct database checks and referential actions have representative coverage
  for time constraints and path deletion. Other constraint families and
  restore-specific database behavior need additional direct-write cases.

See the [HARD-03 acceptance checklist](../milestones/03-acceptance-checklist.md)
for itemized completion status. This report does not mark the milestone
complete.
