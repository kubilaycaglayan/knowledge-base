# E2E run: mobile-size Chromium board resilience

- Date (UTC): 2026-10-08; exact start/end times not recorded separately.
- Commit: `6d29b9b8cd147654788beb71549042e051684ad6`
- Exact command: `BOARD_E2E_ARTIFACT_DIR=harden-tests/local-artifacts/hard02-6d29b9b-mobile BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone ./scripts/run-board-e2e.sh`
- Exit status: 1 (four board assertions failed)
- Compose project: `knowledge-base-board-smoke-2755145-1791494103023624081`; runner removed its disposable project and volumes.
- Images: `knowledge-base-api:test-only` — `sha256:8a985f793e0366bce693e7e32902431a55306061db9a990ee4df899a9d01c455`; `knowledge-base-web:test-only` — `sha256:94601cec9d1843534cf52c79cf165e4d9be2e19b797ec00f271e788bc30090bb`
- Database: PostgreSQL 16.15; disposable database started healthy and Flyway migrations completed as part of API readiness.
- Browser: Playwright 1.63.0, Chromium 153.0.8010.12; 390×844, scale factor 3, touch enabled, mobile context. User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36`. This is mobile-size Chromium emulation, not physical Android Chrome.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, kernel `7.0.0-38-generic`; Node 22.23.3, npm 10.9.9, Docker 29.8.2, Compose 5.6.0; 32 logical CPUs, 30 GiB Docker memory, overlayfs.
- Suite outcomes: 24 passed, 4 failed, 0 skipped (28 total).
- Failed cases: (1) Gantt card locator detached during scroll; (2) More boards control unavailable during board/view switching; (3) floating timer intercepted Archived items link; (4) floating timer covered archive footer hit target.
- Retry journey: passed with same-cursor retry, no duplicate cards, and keyboard activation.
- Artifacts (local, git-ignored): [`run directory`](../local-artifacts/hard02-6d29b9b-mobile/) contains screenshots, Playwright traces, failure summaries, command transcript, exact run metadata, and scoped Compose logs. Retain through 2026-10-15, then remove `harden-tests/local-artifacts/`. Traces/logs contain the disposable test session; scrub before sharing.
- Stack cleanup: runner's project-scoped cleanup ran.
- Fixed-data performance: not measured.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Fixed timer overlaps archive controls | 2 | 1 | Archive link click and footer hit-test | Reproduced; screenshots, traces, and stack logs retained locally. Product layout cause remains suspected. |
| Detached board card locator | 1 | 1 | Gantt card scroll | Reproduced as detached DOM element; trace retained. Timing versus application rerender remains suspected. |
| Board menu unavailable during phone view switching | 1 | 1 | Board/view switch | Reproduced; trace and screenshot retained. Responsive state cause remains suspected. |
| Unclassified | 0 | 0 | None | No other failure observed. |
