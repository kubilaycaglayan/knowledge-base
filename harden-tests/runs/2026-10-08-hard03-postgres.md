# HARD-03 PostgreSQL run evidence

- Date (UTC): 2026-10-08 to 2026-10-09
- Start/end time (UTC): Full PostgreSQL 00:05–00:06 on 2026-10-09; H2 00:06–00:07 on 2026-10-09; migrated startup/search ran at 23:50–23:52 on 2026-10-08
- Commit under test: `57ac97a` (PostgreSQL note update rollback; includes the current concurrency, constraint, and rollback cases)
- Exact invocation: documented disposable PostgreSQL procedure in [`docs/testing.md`](../../docs/testing.md#backend-tests); all integration suites ran with `KB_TEST_POSTGRES_URL`, `KB_TEST_POSTGRES_USER`, `KB_TEST_POSTGRES_PASSWORD`, `KB_TEST_POSTGRES_DISPOSABLE=true`, and empty mode. Then `gradle test --no-daemon --tests '*SearchPostgresIntegrationTest'` ran with `KB_TEST_POSTGRES_MODE=migrated` against an already migrated disposable database. The H2 suite ran with `docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon`.
- Exit status: full PostgreSQL suite PASS; migrated startup/search PASS; H2 suite PASS
- PostgreSQL target: `kb_test_hard03_final_20261009000503_3120791`, unique loopback database in a disposable container. Migrated startup/search target: `kb_test_hard03_final_20261008235034_3087995`.
- Container image: `postgres:16-alpine` (reported server version PostgreSQL 16.15, Alpine x86_64)
- Migrations: Flyway validated and applied 63 migrations from the repository baseline through v67; Hibernate used `ddl-auto=validate`.
- Full backend outcomes: PostgreSQL 421 tests, 0 failures, 0 errors, 0 skipped. H2 421 tests, 0 failures, 0 errors, 66 skipped (environment-specific PostgreSQL-only cases).
- Guard checks: empty disposable target passed. A separate empty-mode run against an already-migrated database failed before tests as expected. Code inspection confirms the guard also rejects a missing disposable marker and non-loopback targets.
- Cleanup: local command trap stopped only the uniquely named `kb-test-hard03-*` container; no volume was mounted or removed. CI uses the per-job PostgreSQL service, which GitHub removes with the job.
- PostgreSQL evidence: the Gradle XML reports contained the database name/version, empty-database check, and Flyway migration result. Migrated-mode XML recorded `Flyway version v67`.
- Artifacts: backend Gradle XML/HTML reports are generated under ignored `backend/build/test-results/test` and `backend/build/reports/tests/test`. Final PostgreSQL logs are retained at `backend/build/kb-test-hard03-final-20261009000503_3120791-postgres.log` and `backend/build/kb-test-hard03-final-20261008235034_3087995-postgres.log`. No credentials or personal data are retained.

The card concurrency regression reproduced two successful updates for one
`expectedUpdatedAt`. Its fix locks the owned card row before checking the
timestamp. The repeated log-label assignment regression reproduced HTTP 500;
its fix locks the owned log row while replacing assignments. A second
regression found HTTP 500 when two time-entry edits replaced the same labels;
the fix locks the owned time-entry row. New calendar day and range races
reproduced duplicate-record HTTP 500s; their fixes lock absent-date creation
and existing records. Concurrent identical label/scope creation also
reproduced HTTP 500 and is now serialized by owner. Note, board-card,
tracker-draft, calendar, time-entry, and log assignment joins now assert one
persisted assignment under PostgreSQL. Card moves, status reorders, and
board-tab reorders still pass. The suite also checks requested-zone history
across the New York spring-forward transition.

## Remaining HARD-03 evidence gaps

- PostgreSQL tests pin an injected UTC clock for report and timer endpoints and
  a running-entry cutoff. The Gantt contract is that `from`/`to` select the
  inclusive client viewport; the API returns all active cards, while the
  client clips date-only card ranges. Backend and client tests cover this
  behavior. A DST/zone conversion case is not part of the UTC report contract.
- Rollback failures now cover later-invalid Clockify and Knowledge Base imports,
  both import undo flows, path merge after session moves, calendar range after
  an earlier day, path creation after board seeding, note create/update, card
  and time-entry creation, label creation and cleanup, timer start/pause, and
  status archival after an earlier card move. Remaining multi-write
  transactions still need a source-by-source audit and equivalent failure
  probes.
- High-volume search, calendar, report, board cursor, label-history, and export
  shapes and representative empty-result cases are covered. Newly added
  endpoint families need corresponding cases added to the inventory.
- Direct database checks now cover time constraints, path status, note target,
  calendar portion, board-card dates/priority, log body, and path deletion.
  Other constraint families and restore-specific database behavior need
  additional direct-write cases.

See the [HARD-03 acceptance checklist](../milestones/03-acceptance-checklist.md)
for itemized completion status. This report does not mark the milestone
complete.
