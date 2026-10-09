# E2E run: desktop Chromium search and deep links

- Date (UTC): 2026-10-08
- Start/end time (UTC): 19:58:43–19:59:03
- Commit: `bad2c8c`
- Exact command and relevant environment overrides: `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-search-e2e.sh`
- Exit status: 0
- Compose project: `knowledge-base-search-smoke-2552150-1791489523825456406`
- Stack retained? No; runner removed this project's containers and volumes on exit.
- Images (tag and immutable ID): `knowledge-base-api:test-only` — `sha256:c18890c1e048c69a8fe26abc95f9ef2978459d1398838a41aef1bc337cf7792e`; `knowledge-base-web:test-only` — `sha256:21894663a28fe29ac954c5a4266c29c07e26ff9fa9857ba477987d94ea5bbb1e`.
- Database engine/version and migration result: PostgreSQL 16 (`postgres:16-alpine`; patch version not recorded); fixture API operations and browser tests passed after stack startup.
- Browser engine/version and profile: Chromium 153.0.8010.12, desktop 1440×900, touch disabled, device scale factor 1, headless.
- Environment: Ubuntu 26.04.1 LTS, Linux x86_64, Node 22.23.3, Playwright 1.63.0, Docker 29.8.2; 32 CPUs and 30 GiB Docker memory. Host had 22 GiB available in the 19:57 UTC preflight.
- Suite outcomes: 3 passed, 0 failed, 0 skipped.
- Failed cases: None.
- Artifacts/logs: [local ignored transcript](../artifacts/2026-10-08-bad2c8c-desktop-chromium-search.log); retained in this workspace only, with no automatic expiry.
- Fixed-data performance: Not measured.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| None | 0 | 0 | None | All three selected journey cases passed. |

## Scope notes

The run covers search activation and Back/Forward for active note, log, path,
label, and session results; calendar, active board/card results; and direct
loads for those destinations. It does not establish archived routes, missing
or foreign IDs, page shortcuts, or the other URL-driven states in HARD-01.
This is desktop Chromium emulation, not physical-device evidence.
