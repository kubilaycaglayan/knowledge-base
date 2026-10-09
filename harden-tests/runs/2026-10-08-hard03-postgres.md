# HARD-03 PostgreSQL run evidence

- Date (UTC): 2026-10-09
- Start/end time (UTC): PostgreSQL full suite 00:32:46–00:33:31; migrated startup/search immediately afterward; H2 full suite approximately 00:33:50–00:34:25.
- Commit under test: `7d54f40` (final PostgreSQL board ordering rollback coverage).
- Exact invocation: used the guarded disposable PostgreSQL procedure in [`docs/testing.md`](../../docs/testing.md#backend-tests), with `KB_TEST_POSTGRES_URL`, `KB_TEST_POSTGRES_USER`, `KB_TEST_POSTGRES_PASSWORD`, `KB_TEST_POSTGRES_DISPOSABLE=true`, and empty mode for the full suite. The migrated startup/search invocation was `gradle test --no-daemon --tests '*SearchPostgresIntegrationTest'` with `KB_TEST_POSTGRES_MODE=migrated`. The full H2 suite used `gradle test --no-daemon`. Due to repeated Maven Central HTTP 429 responses, Gradle ran from a temporary isolated copy of `backend/` with a copied cache and a temporary Google Maven Central mirror override; repository sources were unchanged.
- Exit status: full PostgreSQL suite PASS; migrated startup/search PASS; full H2 suite PASS.
- PostgreSQL target: `kb_test_hard03_final_20261009003246_3173922`, in a unique loopback database/container. The migrated startup/search check reused this already-migrated disposable target.
- Container: `postgres:16-alpine` (PostgreSQL 16.15, Alpine x86_64).
- Migrations: Flyway applied the repository migration history through v67; Hibernate used `ddl-auto=validate`.
- Full backend outcomes: PostgreSQL 443 tests, 0 failures, 0 errors, 0 skipped. H2 443 tests, 0 failures, 0 errors, 88 skipped (PostgreSQL-only cases).
- Guard checks: the empty disposable target passed. A separate empty-mode invocation against an already-migrated database failed before tests as expected. Code inspection confirms the guard rejects a missing disposable marker and non-loopback targets.
- Cleanup: the command trap stopped only the uniquely named `kb-test-hard03-*` container; no volume was mounted or removed. CI uses the per-job PostgreSQL service, which GitHub removes with the job.
- Evidence: PostgreSQL Gradle XML/HTML reports are produced under ignored `backend/build/test-results/test` and `backend/build/reports/tests/test`; the disposable server output recorded its version and Flyway migration result. No credentials or personal data are retained in the report.

The final 22 PostgreSQL-only tests expanded rollback coverage after the earlier
421-test run. Failure injection now exercises import and undo, path merge,
create/rename/restore/order, calendar day/range/label changes, note
create/update and audit events, board creation/movement/status/order, label
assignment and update paths, timer lifecycle/configuration/cancel, and
time-entry edits. Each case asserts that earlier writes and related child,
association, or audit rows are rolled back. A source-by-source audit found
remaining transactional paths are read-only or single-row writes; future
multi-write changes should receive matching rollback probes.

Earlier PostgreSQL race tests exposed duplicate successful updates for stale
card timestamps, HTTP 500s during repeated log/time-entry label replacement,
duplicate calendar records, and HTTP 500s for concurrent identical
label/scope creation. The fixes lock the owned row or owner at the write
boundary. PostgreSQL now verifies persisted outcomes for timer starts, note
versions, card moves, board/status/tab ordering, calendar day/range creation,
same-name label/scope creation, and active note, board-card, tracker-draft,
calendar, time-entry, and log assignment joins. Requested-zone label history
also covers the New York spring-forward transition.

HARD-03 is complete. Its source-backed inventory and acceptance status are in
the [HARD-03 acceptance checklist](../milestones/03-acceptance-checklist.md).
