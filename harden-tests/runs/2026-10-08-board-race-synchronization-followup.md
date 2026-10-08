# Board race synchronization follow-up

- Date (UTC): 2026-10-08; exact start/end time not separately recorded.
- Source revision under test: `b6ea7fe` with the synchronization follow-up in the working tree.
- Engine/profile: desktop Chromium, real-stack board runner.
- First attempt: the delayed-response case waited for `/cards/page`, but board view caching meant no request was sent. The unbounded wait was interrupted; it did not complete a profile run.
- Second attempt: a bounded wait failed after 5 seconds for the same cache behavior when intercepting `/statuses` without clearing the page store.
- Corrective change: reload after creating the second board to clear the view cache; intercept the cold board's `/statuses` response; signal when held; release in `finally`; fail after 5 seconds if no request arrives.
- Final command: `BOARD_E2E_PROXY_PORT=26181 PROXY_HTTPS_PORT=26444 BOARD_E2E_ARTIFACT_DIR=... BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-board-e2e.sh`.
- Final outcome: delayed board response case passed. Board suite: 28 passed, 1 failed, 0 skipped. The remaining failure is the previously reproduced archive footer covered by `.dashboard-shell`.
- Diagnostics (local, git-ignored): `harden-tests/local-artifacts/hard02-board-race-final3/`; retain through 2026-10-15.
- Classification: the two failed synchronization attempts were test-authoring/cache-fixture issues. The final run does not count as a complete passing board profile because of the archive-footer product finding.
