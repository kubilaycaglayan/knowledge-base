# E2E run: desktop Chromium board resilience

- Date (UTC): 2026-10-08; exact start/end time not separately recorded.
- Commit: `6ebc5d9a35b48afe111f9c296a2128ba059ea4ee`.
- Exact command: `BOARD_E2E_ARTIFACT_DIR=harden-tests/local-artifacts/hard02-6ebc5d9-desktop BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-board-e2e.sh`
- Exit status: 1.
- Compose project: disposable board smoke project; runner removed its generated project and volumes.
- Images: API `sha256:e481255874a51a65c0e5edf70777758ab6ad1cef4308dff9c8a84fbf887488ba`; web `sha256:7c8c4432f153420c53db12f683abb1270f0146fe91890a4f9a74bde74fa508b4`.
- Database: PostgreSQL 16.15; disposable database and migrations completed.
- Browser/environment: desktop Chromium; other exact browser and host metadata are in the local run metadata if recorded, otherwise unknown.
- Suite outcomes: 28 passed, 1 failed, 0 skipped (29 total).
- Failed case: `keeps the archive footer clear of the fixed bottom tracker`; hit test found `null covered by shell dashboard-shell`.
- Retry journey: passed, including draft preservation through 503 and 409 and successful replay.
- Artifacts (local, git-ignored): [`run directory`](../local-artifacts/hard02-6ebc5d9-desktop/) contains screenshots, traces, failure summaries, command transcript, run metadata, and scoped stack logs. Retain through 2026-10-15, then remove `harden-tests/local-artifacts/`.
- Failure group: fixed dashboard shell covers archive footer controls; 1 case in 1 suite. Product cause remains unconfirmed.
