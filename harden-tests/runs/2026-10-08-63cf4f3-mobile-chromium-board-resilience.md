# E2E run: mobile-size Chromium board resilience

- Date (UTC): 2026-10-08; exact start/end times not recorded separately.
- Commit: `63cf4f3`
- Exact command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone ./scripts/run-board-e2e.sh`
- Exit status: 1 (four board assertions failed)
- Compose project: `knowledge-base-board-smoke-2736472-1791493473933939318`; runner removed its disposable project and volumes.
- Images: `knowledge-base-api:test-only` and `knowledge-base-web:test-only`; immutable IDs were not captured during this run and cannot be inferred from later tag values.
- Database: PostgreSQL 16 Alpine; disposable database started healthy and API readiness passed. Flyway migration result was not recorded separately.
- Browser: Playwright 1.63.0, Chromium 153.0.8010.12; 390×844, device scale factor 3, mobile context and touch enabled, headless. User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36`. This is mobile-size Chromium emulation, not physical Android Chrome.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, kernel `7.0.0-38-generic`; Node 22.23.3, npm 10.9.9, Docker 29.8.2, Compose 5.6.0; 32 logical CPUs, 30 GiB Docker memory, overlayfs.
- Suite outcomes: 24 passed, 4 failed, 0 skipped (28 total).
- Failed cases: (1) Gantt card locator detached during scroll; (2) `button.board-tab-more` unavailable during board/view switching; (3) floating timer intercepted the Archived items link; (4) archive footer hit-test found the floating timer covering the target.
- Retry journey: passed. One injected 503 was followed by one successful request with the same cursor; the expected second-page card rendered exactly once, first-page cards remained unique, and the retry action was keyboard operable.
- Artifacts/logs: No trace, screenshot, browser console/request log, server log, or retained TAP transcript. The failure signatures were observed in live runner output only; no durable artifacts are available.
- Stack cleanup: Runner's project-scoped cleanup ran; no persistent development or protected volume was targeted.
- Fixed-data performance: not measured.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Fixed timer overlaps archive controls | 2 | 1 | Archive link click and footer hit-test | Reproduced; Playwright identified the floating timer button intercepting the link and covering the footer target. Product layout cause remains suspected. |
| Detached board card locator | 1 | 1 | Gantt card scroll | Reproduced as `Element is not attached to the DOM`; timing versus application rerender remains suspected without a trace. |
| Board menu unavailable during phone view switching | 1 | 1 | Board/view switch | Reproduced as timeout waiting for `button.board-tab-more`; responsive state cause remains suspected without DOM evidence. |
| Unclassified | 0 | 0 | None | No other failure observed. |
