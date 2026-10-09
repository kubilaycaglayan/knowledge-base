# E2E run: mobile-size Chromium search resilience

- Date (UTC): 2026-10-08; exact start/end time not separately recorded.
- Commit: `5e0cc54` (`test: verify keyboard retry in global search`).
- Exact command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone ./scripts/run-search-e2e.sh`
- Exit status: 0.
- Compose project: disposable search smoke project; runner removed its generated project and volumes.
- Images, PostgreSQL patch version, migration result, browser build, and host limits: not captured by this runner; unknown.
- Browser/profile: Chromium responsive phone emulation (`iphone` runner profile), not a physical Chrome device or WebKit.
- Suite outcomes: 1 passed, 0 failed, 0 skipped.
- Search recovery: passed. The query remained in the input after an injected 503, the error was exposed as an alert, keyboard focus and Enter on “Try again” issued exactly one successful request, and the explicit empty result state appeared.
- Failure groups: none; `Unclassified` 0.
- Artifacts: no screenshots or traces retained; the runner currently emits the test transcript to stdout only.
