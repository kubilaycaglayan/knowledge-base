# E2E run: desktop Chromium line-history and empty-state resilience

- Date (UTC): 2026-10-08; exact start/end time not separately recorded.
- Commit: `55255ec` (`test: cover keyboard recovery from empty notes`).
- Exact command: `LINE_HISTORY_E2E_SCREENSHOTS=/home/ubuntu/dev/vibe/knowledge-base/harden-tests/local-artifacts/hard02-empty-note-desktop/screenshots BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-line-history-e2e.sh`
- Exit status: 0.
- Compose project: disposable `knowledge-base-lines-smoke-*`; runner removed its generated project and volumes.
- Images, PostgreSQL patch version, migration result, browser build, and host limits: not recorded; unknown.
- Browser/profile: desktop Chromium.
- Suite outcomes: 13 passed, 0 failed, 0 skipped.
- Empty-state journey: a newly registered account saw “Your notes will appear here.”; keyboard focus and Enter on “Create new note” opened the editor. The test deleted the temporary note and confirmed the account returned to the empty state.
- Note failure/retry journey: passed; draft survived a 503 and concurrent server update, then saved after conflict replay.
- Artifacts (local, git-ignored): [`screenshots`](../local-artifacts/hard02-empty-note-desktop/screenshots/). The runner does not capture traces or failure logs. Retain through 2026-10-15, then remove `harden-tests/local-artifacts/`.
