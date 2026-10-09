# E2E run: mobile-size Chromium search and deep links

- Date (UTC): 2026-10-08
- Start/end time (UTC): 20:38:05–20:38:50
- Commit: `e6008dd`
- Exact command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone ./scripts/run-search-e2e.sh`
- Exit status: 0
- Compose project: `knowledge-base-search-smoke-2671799-1791491885599203185`
- Stack retained? No. The runner removed this project's containers and disposable volumes on exit.
- Images: API `knowledge-base-api:test-only` (`sha256:94e8bed9f81679fa12bc1a10d35cd46a76f878afed3ab656e2e5ca6d662ffd7a`); web `knowledge-base-web:test-only` (`sha256:3087683c063175b971b8a08f11158fd2332261233a9acc3a80e61d38ff5fb071`); PostgreSQL `postgres:16-alpine` (`sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`).
- Database and migration: PostgreSQL 16; API readiness and fixture operations succeeded after stack startup. Flyway startup logs were not retained.
- Browser: Chromium 153.0.8010.12, 390×844, touch enabled, device scale factor 3, headless. User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36`. This is mobile-size Chromium emulation, not Android Chrome.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, 32 CPUs, 30 GiB Docker memory; Node 22.23.3, npm 10.9.9, Playwright 1.63.0, Docker 29.8.2. No CPU, memory, or disk limit was configured for the run; the workspace filesystem had 474 GiB free at report capture.
- Suite outcomes: 12 passed, 0 failed, 0 skipped.
- Failed cases: None.
- Logs: [runner transcript](../artifacts/knowledge-base-search-smoke-2671799-1791491885599203185-command.log), retained in this workspace's ignored artifact directory.
- Performance: Not measured; this is acceptance coverage, not a performance baseline.
- Performance environment and raw data: Not applicable; no performance samples or timing traces were collected.
- Cleanup: `docker ps --filter name=knowledge-base-search-smoke` returned no containers after the run.

The run covers the complete HARD-01 suite, including phone-width overflow and
dialog/card-editor bounds, reachable controls, keyboard activation, browser
history, route reloads, archived and ownership cases, and failure recovery.
Emulation does not establish physical Android behavior. Artifacts are local,
ignored by Git, and have no automatic expiry.
