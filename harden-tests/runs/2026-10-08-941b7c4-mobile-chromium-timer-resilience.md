# E2E run: mobile-size Chromium timer resilience

- Date (UTC): 2026-10-08; exact start/end time not separately recorded.
- Commit: `941b7c4` (`test: dispatch timer retry events atomically`).
- Exact command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone ./scripts/run-timer-websocket-e2e.sh`
- Exit status: 0.
- Compose project: disposable timer WebSocket project; runner removed its generated project and volume.
- Images, PostgreSQL patch version, migration result, browser build, and host limits: not captured by this runner; unknown.
- Browser/profile: Chromium responsive phone emulation (`iphone` runner profile), not physical Android Chrome, iPhone Chrome, or WebKit.
- Suite outcomes: 3 passed, 0 failed, 0 skipped.
- Timer draft recovery: passed. A mocked 503 on the first draft PUT exposed the accessible error while retaining the draft; one user initiated retry returned 200, and the final draft was verified through the API.
- Failure groups: none; `Unclassified` 0.
- Artifacts: no screenshots or traces retained; the runner currently emits the test transcript to stdout only.
- Fixed-data performance: not measured.
