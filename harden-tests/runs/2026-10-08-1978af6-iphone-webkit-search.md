# E2E run: emulated iPhone WebKit search and deep links

- Date (UTC): 2026-10-08
- Start/end time (UTC): 20:56:15–20:57:23
- Commit: `1978af6`
- Exact command: `BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone ./scripts/run-search-e2e.sh`
- Exit status: 0
- Compose project: `knowledge-base-search-smoke-2714185-1791492975289935336`
- Stack retained? No. The runner removed this project's containers and disposable volumes on exit.
- Images: API `knowledge-base-api:test-only` (`sha256:64c5b8311780a37363ca36e283e9b46c8f52548b9c2d59c690c3773131a0b502`); web `knowledge-base-web:test-only` (`sha256:c1c734e4b6979db27ce643daf9be1c3389d9d4db3814d0e278cd67a38327bac8`); PostgreSQL `postgres:16-alpine` (`sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`).
- Database and migration: PostgreSQL 16; API readiness and fixture operations succeeded after stack startup. Flyway startup logs were not retained.
- Browser: WebKit 26.6, 390×844, touch enabled, configured device scale factor 3, headless. Runtime `devicePixelRatio` was 1.1938774585723877. User agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15`. This is an emulated touchscreen WebKit context, not a physical iPhone browser.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, 32 CPUs, 30 GiB Docker memory; Node 22.23.3, npm 10.9.9, Playwright 1.63.0, Docker 29.8.2. No CPU, memory, or disk limit was configured; prior captured workspace free space was 474 GiB.
- Suite outcomes: 12 passed, 0 failed, 0 skipped.
- Failed cases: None.
- Logs: [runner transcript](../artifacts/knowledge-base-search-smoke-2714185-1791492975289935336-command.log), retained in this workspace's ignored artifact directory.
- Performance: Not measured; this is acceptance coverage, not a performance baseline.
- Performance environment and raw data: Not applicable; no performance samples or timing traces were collected.
- Cleanup: Runner exited successfully and removed this project's containers and disposable volumes.

The suite passed with the same fixture definition and assertions used by the
Chromium profiles. Emulation does not establish physical iPhone behavior.
Artifacts are local and ignored by Git, with no automatic expiry.
