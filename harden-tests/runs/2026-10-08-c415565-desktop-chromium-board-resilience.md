# E2E run: desktop Chromium board resilience

- Date (UTC): 2026-10-08; exact start/end times not recorded separately.
- Commit: `c415565`
- Exact command: `BOARD_E2E_ARTIFACT_DIR=harden-tests/local-artifacts/hard02-c415565-desktop BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-board-e2e.sh`
- Exit status: 1 (one board assertion failed)
- Compose project: `knowledge-base-board-smoke-2750424-1791493953672516793`; runner removed its disposable project and volumes.
- Images: `knowledge-base-api:test-only` and `knowledge-base-web:test-only`; immutable IDs were not captured during this run and cannot be established from a later inspection.
- Database: PostgreSQL 16 Alpine; disposable database started healthy and API readiness passed. Flyway migration result was not recorded separately.
- Browser: Playwright 1.63.0, Chromium 153.0.8010.12; 1440×900, scale factor 1, touch disabled. User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36`.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, kernel `7.0.0-38-generic`; Node 22.23.3, npm 10.9.9, Docker 29.8.2, Compose 5.6.0; 32 logical CPUs, 30 GiB Docker memory, overlayfs.
- Suite outcomes: 27 passed, 1 failed, 0 skipped (28 total).
- Failed case: archive footer hit-test returned `null covered by shell dashboard-shell`.
- Retry journey: passed with same-cursor retry, no duplicate cards, and keyboard activation.
- Artifacts (local, git-ignored): [`failure artifacts, command output, and stack logs`](../local-artifacts/hard02-c415565-desktop/). Includes screenshot, trace, JSON summary, TAP transcript, and scoped Compose logs. Review through 2026-10-15, then remove `harden-tests/local-artifacts/`. Traces/logs contain the disposable test session; scrub before sharing.
- Stack cleanup: runner's project-scoped cleanup ran.
- Fixed-data performance: not measured.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Fixed dashboard shell covers archive footer | 1 | 1 | Archive footer hit-test | Reproduced; local screenshot/trace and API/proxy/container logs retained. Product layout cause remains outside this test-only milestone. |
| Unclassified | 0 | 0 | None | No other failure observed. |
