# E2E run: mobile-size Chromium board resilience

- Date (UTC): 2026-10-08; exact start/end times not recorded separately.
- Commit: `c415565`
- Exact command: `BOARD_E2E_ARTIFACT_DIR=harden-tests/local-artifacts/hard02-c415565-mobile BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone ./scripts/run-board-e2e.sh`
- Exit status: 1 (four board assertions failed)
- Compose project: `knowledge-base-board-smoke-2747900-1791493886254597427`; runner removed its disposable project and volumes.
- Images: `knowledge-base-api:test-only` and `knowledge-base-web:test-only`; immutable IDs were not captured during this run and cannot be established from a later inspection.
- Database: PostgreSQL 16 Alpine; disposable database started healthy and API readiness passed. Flyway migration result was not recorded separately.
- Browser: Playwright 1.63.0, Chromium 153.0.8010.12; 390×844, scale factor 3, touch enabled, mobile context. User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36`. This is mobile-size Chromium emulation, not physical Android Chrome.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, kernel `7.0.0-38-generic`; Node 22.23.3, npm 10.9.9, Docker 29.8.2, Compose 5.6.0; 32 logical CPUs, 30 GiB Docker memory, overlayfs.
- Suite outcomes: 24 passed, 4 failed, 0 skipped (28 total).
- Failed cases: (1) Gantt card locator detached during scroll; (2) More boards control unavailable during board/view switching; (3) floating timer intercepted Archived items link; (4) floating timer covered archive footer hit target.
- Retry journey: passed with same-cursor retry, no duplicate cards, and keyboard activation.
- Artifacts (local, git-ignored): [`failure artifacts, command output, and stack logs`](../local-artifacts/hard02-c415565-mobile/). Includes screenshots, traces, JSON summaries, TAP transcript, and scoped Compose logs. Review through 2026-10-15, then remove `harden-tests/local-artifacts/`. Traces/logs contain the disposable test session; scrub before sharing.
- Stack cleanup: runner's project-scoped cleanup ran.
- Fixed-data performance: not measured.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Fixed timer overlaps archive controls | 2 | 1 | Archive link click and footer hit-test | Reproduced; local screenshots/traces and stack logs retained. Product layout cause remains suspected. |
| Detached board card locator | 1 | 1 | Gantt card scroll | Reproduced as detached DOM element; trace retained. Timing versus application rerender remains suspected. |
| Board menu unavailable during phone view switching | 1 | 1 | Board/view switch | Reproduced; trace and screenshot retained. Responsive state cause remains suspected. |
| Unclassified | 0 | 0 | None | No other failure observed. |
