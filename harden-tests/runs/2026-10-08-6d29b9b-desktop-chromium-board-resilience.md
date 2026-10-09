# E2E run: desktop Chromium board resilience

- Date (UTC): 2026-10-08; exact start/end times not recorded separately.
- Commit: `6d29b9b8cd147654788beb71549042e051684ad6`
- Exact command: `BOARD_E2E_ARTIFACT_DIR=harden-tests/local-artifacts/hard02-6d29b9b-desktop BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-board-e2e.sh`
- Exit status: 1 (one board assertion failed)
- Compose project: `knowledge-base-board-smoke-2753166-1791494067842592483`; runner removed its disposable project and volumes.
- Images: `knowledge-base-api:test-only` — `sha256:db77f7769f7cd42013d21c9338bed77555b8020d2077465d27755ffec10a2ea9`; `knowledge-base-web:test-only` — `sha256:6ae1ae917d3b8e884ebc246afc1c6d8a113372678aee83cc7172e17205f53dfe`
- Database: PostgreSQL 16.15; disposable database started healthy and Flyway migrations completed as part of API readiness.
- Browser: Playwright 1.63.0, Chromium 153.0.8010.12; 1440×900, scale factor 1, touch disabled. User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36`.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, kernel `7.0.0-38-generic`; Node 22.23.3, npm 10.9.9, Docker 29.8.2, Compose 5.6.0; 32 logical CPUs, 30 GiB Docker memory, overlayfs.
- Suite outcomes: 27 passed, 1 failed, 0 skipped (28 total).
- Failed case: archive footer hit-test returned `null covered by shell dashboard-shell`.
- Retry journey: passed with same-cursor retry, no duplicate cards, and keyboard activation.
- Artifacts (local, git-ignored): [`run directory`](../local-artifacts/hard02-6d29b9b-desktop/) contains screenshot, Playwright trace, failure summary, command transcript, exact run metadata, and scoped Compose logs. Retain through 2026-10-15, then remove `harden-tests/local-artifacts/`. Traces/logs contain the disposable test session; scrub before sharing.
- Stack cleanup: runner's project-scoped cleanup ran.
- Fixed-data performance: not measured.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Fixed dashboard shell covers archive footer | 1 | 1 | Archive footer hit-test | Reproduced; screenshot, trace, command output, and stack logs retained locally. Product layout cause remains outside this test-only milestone. |
| Unclassified | 0 | 0 | None | No other failure observed. |
