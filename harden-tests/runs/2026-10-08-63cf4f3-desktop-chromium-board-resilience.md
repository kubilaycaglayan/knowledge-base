# E2E run: desktop Chromium board resilience

- Date (UTC): 2026-10-08; exact start/end times not recorded separately.
- Commit: `63cf4f3`
- Exact command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-board-e2e.sh`
- Exit status: 1 (one board assertion failed)
- Compose project: `knowledge-base-board-smoke-2734612-1791493436492050090`; runner removed its disposable project and volumes.
- Images (tag and immutable ID): `knowledge-base-api:test-only` — `sha256:7db97fa53aa04397d64075cdf6536553ff915aaadde0b2f6960cd64874e0106a`; `knowledge-base-web:test-only` — `sha256:641364db11cbf53d55c19af4054c9951dad7e790be7c165c35b6fd37a835bd8b`
- Database: PostgreSQL 16 Alpine; disposable database started healthy and Flyway migrations completed as part of API readiness.
- Browser: Playwright 1.63.0, Chromium 153.0.8010.12; 1440×900, device scale factor 1, touch disabled, headless. User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36`.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, kernel `7.0.0-38-generic`; Node 22.23.3, npm 10.9.9, Docker 29.8.2, Compose 5.6.0; 32 logical CPUs, 30 GiB Docker memory, overlayfs.
- Suite outcomes: 27 passed, 1 failed, 0 skipped (28 total).
- Failed case: `keeps the archive footer clear of the fixed bottom tracker`; hit test returned `null covered by shell dashboard-shell`.
- Retry journey: passed. One injected 503 was followed by one successful request with the same cursor; the expected second-page card rendered exactly once, first-page cards remained unique, and the retry action was keyboard operable.
- Artifacts/logs: No trace, screenshot, browser console/request log, server log, or retained TAP transcript. Failure signature was observed in live runner output only; no durable artifact is available.
- Stack cleanup: Runner's project-scoped cleanup ran; no persistent development or protected volume was targeted.
- Fixed-data performance: not measured.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Fixed dashboard shell covers archive footer | 1 | 1 | Archive footer hit-test | Reproduced in desktop Chromium; exact assertion outcome above. Root cause remains suspected without retained DOM/trace evidence. |
| Unclassified | 0 | 0 | None | No other failure observed. |
