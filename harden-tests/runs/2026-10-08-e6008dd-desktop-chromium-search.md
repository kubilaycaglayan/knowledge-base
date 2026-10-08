# E2E run: desktop Chromium search and deep links

- Date (UTC): 2026-10-08
- Start/end time (UTC): 20:37:15–20:38:02
- Commit: `e6008dd`
- Exact command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-search-e2e.sh`
- Exit status: 0
- Compose project: `knowledge-base-search-smoke-2668987-1791491835014522512`
- Stack retained? No. The runner removed this project's containers and disposable volumes on exit.
- Images: API `knowledge-base-api:test-only` (`sha256:94e8bed9f81679fa12bc1a10d35cd46a76f878afed3ab656e2e5ca6d662ffd7a`); web `knowledge-base-web:test-only` (`sha256:3087683c063175b971b8a08f11158fd2332261233a9acc3a80e61d38ff5fb071`); PostgreSQL `postgres:16-alpine` (`sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`).
- Database and migration: PostgreSQL 16; API readiness and fixture operations succeeded after stack startup. Flyway startup logs were not retained.
- Browser: Chromium 153.0.8010.12, 1440×900, touch disabled, device scale factor 1, headless. User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36`.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, 32 CPUs, 30 GiB Docker memory; Node 22.23.3, npm 10.9.9, Playwright 1.63.0, Docker 29.8.2. No CPU, memory, or disk limit was configured for the run; the workspace filesystem had 474 GiB free at report capture.
- Suite outcomes: 12 passed, 0 failed, 0 skipped.
- Failed cases: None.
- Logs: [runner transcript](../artifacts/knowledge-base-search-smoke-2668987-1791491835014522512-command.log), retained in this workspace's ignored artifact directory.
- Performance: Not measured; this is acceptance coverage, not a performance baseline.
- Performance environment and raw data: Not applicable; no performance samples or timing traces were collected.
- Cleanup: `docker ps --filter name=knowledge-base-search-smoke` returned no containers after the run.

## Coverage

The suite verifies all current page shortcuts by click and keyboard, aliases by
Enter, search-result identity and history, direct loads and reloads of active
and archived routes in fresh authenticated contexts, missing/foreign record
recovery, URL filters and Gantt date boundaries, empty/error retry behavior,
and viewport geometry. Browser history is checked after result activation.

## Corrected failures observed during HARD-01

The malformed-date regression failed because `/calendar?date=2026-02-30`
kept the impossible value in the URL. A screenshot, trace, and browser JSON
from one reproduction and a project server log from another are retained at:

- [First failure screenshot](../../frontend/harden-tests/artifacts/2026-10-08T20-11-25.383Z-2578175-canonicalizes-an-impossible-calendar-date-to-the-fallback-selection.png)
- [First failure trace](../../frontend/harden-tests/artifacts/2026-10-08T20-11-25.383Z-2578175-canonicalizes-an-impossible-calendar-date-to-the-fallback-selection.zip)
- [First failure browser details](../../frontend/harden-tests/artifacts/2026-10-08T20-11-25.383Z-2578175-canonicalizes-an-impossible-calendar-date-to-the-fallback-selection.json)
- [Project server log](../artifacts/knowledge-base-search-smoke-2580388-1791490342174840764-server.log)

The fix removes invalid date query values on initial load while preserving
other query keys. A subsequent shortcut-test failure was traced to assumptions
about keyboard selection order and `page.goto` history behavior; another was
missing an app-ready wait. The assertions now navigate to the target shortcut
through keyboard input and check Back/Forward through the click journey. These
test-only failures and their transcripts remain in ignored local artifacts.

- [Shortcut-test browser details](../../frontend/harden-tests/artifacts/2026-10-08T20-19-16.643Z-2606792-opens-every-page-shortcut-by-click-and-aliases-by-enter-without-record-search.json)
- [Shortcut-test trace](../../frontend/harden-tests/artifacts/2026-10-08T20-19-16.643Z-2606792-opens-every-page-shortcut-by-click-and-aliases-by-enter-without-record-search.zip)
- [Shortcut-test command transcript](../artifacts/knowledge-base-search-smoke-2605653-1791490741802154841-command.log)

All artifacts are local and ignored by Git; they contain disposable generated
test data only and have no automatic expiry.
