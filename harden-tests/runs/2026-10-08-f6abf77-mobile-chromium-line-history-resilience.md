# E2E run: mobile-size Chromium line-history resilience

- Date (UTC): 2026-10-08; exact start/end times not separately recorded.
- Commit: `f6abf77` (`test: cover note autosave recovery after network failure`).
- Exact command: `LINE_HISTORY_E2E_SCREENSHOTS=/home/ubuntu/dev/vibe/knowledge-base/harden-tests/local-artifacts/hard02-f6abf77-mobile/screenshots BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone ./scripts/run-line-history-e2e.sh`
- Exit status: 0.
- Compose project: disposable `knowledge-base-lines-smoke-*`; runner removed its generated project and volumes.
- Images / database engine and migration result: not recorded by this runner; unknown.
- Browser version, viewport, user agent, host limits: not recorded by this runner; unknown. This is the runner's `iphone` responsive profile using Chromium, not physical iPhone Chrome or WebKit.
- Suite outcomes: 12 passed, 0 failed, 0 skipped (four suites).
- Failure groups: none; `Unclassified` 0.
- Note recovery journey: passed. The test observed 503, then a conflict against a concurrent server edit, then a successful replay; the draft remained intact and the final saved value matched the user's draft.
- Artifacts (local, git-ignored): [`screenshots`](../local-artifacts/hard02-f6abf77-mobile/screenshots/). The line-history runner does not capture traces or failure logs. Retain through 2026-10-15, then remove `harden-tests/local-artifacts/`.
- Fixed-data performance: not measured.
