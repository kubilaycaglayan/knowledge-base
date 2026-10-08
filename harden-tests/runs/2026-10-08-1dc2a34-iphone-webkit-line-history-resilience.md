# E2E run: emulated iPhone WebKit line-history resilience

- Date (UTC): 2026-10-08; exact start/end time not separately recorded.
- Commit: `1dc2a34` (`docs: close retry preservation checklist items`).
- Exact command: `LINE_HISTORY_E2E_SCREENSHOTS=/home/ubuntu/dev/vibe/knowledge-base/harden-tests/local-artifacts/hard02-1dc2a34-webkit/screenshots BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone ./scripts/run-line-history-e2e.sh`
- Exit status: 1.
- Compose project: `knowledge-base-lines-smoke-2790990-1791495088891396454`; runner removed its generated project and volumes.
- Images, PostgreSQL patch version, migration result, WebKit build, user agent, and host limits: not captured by this runner; unknown.
- Browser/profile: Playwright WebKit with the runner's `iphone` responsive viewport and touch settings; this is emulated iPhone WebKit, not a physical device.
- Suite outcomes: 11 passed, 2 failed, 0 skipped (13 tests across four suites; the outer test hook also failed).
- Failed case: `types where a quick click lands, with the gutter on and off`; with the gutter on, typed text entered the timestamp gutter (`21:31 10/08Plan`, `UnsavedBuildX`) instead of the expected editor lines.
- Failed hook: page console error reported WebKit access-control failures for `/api/v1/timers/draft` and `/api/v1/timers/current` on `localhost:26380` during cleanup.
- Disposition: both historical WebKit signatures reproduced. The caret issue is a product-facing behavior requiring a focused trace/reproduction. The CORS signature is observed, but its cause remains unconfirmed because request/response and proxy logs were not retained.
- Artifacts (local, git-ignored): [`screenshots`](../local-artifacts/hard02-1dc2a34-webkit/screenshots/); no failure trace, console log, request details, or scoped server logs were retained by this runner. Retain through 2026-10-15, then remove the local artifacts.
