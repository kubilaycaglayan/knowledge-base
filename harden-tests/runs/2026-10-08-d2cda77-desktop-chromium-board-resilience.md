# E2E run: desktop Chromium board resilience with failure capture

- Date (UTC): 2026-10-08; exact start/end times not recorded separately.
- Commit: `d2cda77`
- Exact command: `BOARD_E2E_ARTIFACT_DIR=/tmp/knowledge-base-hard02-desktop-artifacts BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-board-e2e.sh`
- Exit status: 1 (one board assertion failed)
- Compose project: `knowledge-base-board-smoke-2739853-1791493611710254539`; runner removed its disposable project and volumes.
- Images: `knowledge-base-api:test-only` and `knowledge-base-web:test-only`; immutable IDs were not captured during this run and cannot be established from a later inspection.
- Database: PostgreSQL 16 Alpine; disposable database started healthy and API readiness passed. Flyway migration result was not recorded separately.
- Browser: Playwright 1.63.0, Chromium 153.0.8010.12; 1440×900, scale factor 1, touch disabled. User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36`.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, kernel `7.0.0-38-generic`; Node 22.23.3, npm 10.9.9, Docker 29.8.2, Compose 5.6.0; 32 logical CPUs, 30 GiB Docker memory, overlayfs.
- Suite outcomes: 27 passed, 1 failed, 0 skipped (28 total).
- Failed case: archive footer hit-test returned `null covered by shell dashboard-shell`.
- Retry journey: passed with same-cursor retry, no duplicate cards, and keyboard activation.
- Artifacts (local, git-ignored): [`trace`](../local-artifacts/hard02-d2cda77-desktop/01-keeps-the-archive-footer-clear-of-the-fixed-bottom-tracker.zip), [`screenshot`](../local-artifacts/hard02-d2cda77-desktop/01-keeps-the-archive-footer-clear-of-the-fixed-bottom-tracker.png), [`failure summary`](../local-artifacts/hard02-d2cda77-desktop/01-keeps-the-archive-footer-clear-of-the-fixed-bottom-tracker.json). Retain through 2026-10-15, then remove the `harden-tests/local-artifacts/` directory. The trace contains the generated disposable test session; review and scrub it before any sharing.
- Stack cleanup: runner's project-scoped cleanup ran.
- Fixed-data performance: not measured.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Fixed dashboard shell covers archive footer | 1 | 1 | Archive footer hit-test | Screenshot and Playwright trace retained locally. Hit-test confirms the shell covers the footer target; no product fix was made in this test-only milestone. |
| Unclassified | 0 | 0 | None | No other failure observed. |
