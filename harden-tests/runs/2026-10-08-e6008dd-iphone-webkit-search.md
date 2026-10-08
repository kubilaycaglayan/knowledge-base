# E2E run: emulated iPhone WebKit search and deep links

- Date (UTC): 2026-10-08
- Start/end time (UTC): 20:38:53–20:39:51
- Commit: `e6008dd`
- Exact command: `BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone ./scripts/run-search-e2e.sh`
- Exit status: 0
- Compose project: `knowledge-base-search-smoke-2674371-1791491933873042324`
- Stack retained? No. The runner removed this project's containers and disposable volumes on exit.
- Images: API `knowledge-base-api:test-only` (`sha256:94e8bed9f81679fa12bc1a10d35cd46a76f878afed3ab656e2e5ca6d662ffd7a`); web `knowledge-base-web:test-only` (`sha256:3087683c063175b971b8a08f11158fd2332261233a9acc3a80e61d38ff5fb071`); PostgreSQL `postgres:16-alpine` (`sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`).
- Database and migration: PostgreSQL 16; API readiness and fixture operations succeeded after stack startup. Flyway startup logs were not retained.
- Browser: WebKit 26.6, 390×844, touch enabled, configured device scale factor 3, headless. Runtime `devicePixelRatio` was 1.1938774585723877. User agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15`. This is an emulated touchscreen WebKit context, not a physical iPhone browser.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, 32 CPUs, 30 GiB Docker memory; Node 22.23.3, npm 10.9.9, Playwright 1.63.0, Docker 29.8.2. No CPU, memory, or disk limit was configured for the run; the workspace filesystem had 474 GiB free at report capture.
- Suite outcomes: 12 passed, 0 failed, 0 skipped.
- Failed cases: None.
- Logs: [runner transcript](../artifacts/knowledge-base-search-smoke-2674371-1791491933873042324-command.log), retained in this workspace's ignored artifact directory.
- Performance: Not measured; this is acceptance coverage, not a performance baseline.
- Performance environment and raw data: Not applicable; no performance samples or timing traces were collected.
- Cleanup: `docker ps --filter name=knowledge-base-search-smoke` returned no containers after the run.

The run covers the complete HARD-01 suite with the same fixture definitions
and assertions as the desktop Chromium and mobile-size Chromium profiles.
Emulation does not establish physical iPhone behavior. Artifacts are local,
ignored by Git, and have no automatic expiry.
