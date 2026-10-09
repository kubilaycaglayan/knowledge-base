# E2E run: mobile-size Chromium board resilience

- Date (UTC): 2026-10-08; exact start/end time not separately recorded.
- Commit: `6ebc5d9a35b48afe111f9c296a2128ba059ea4ee`.
- Exact command: `BOARD_E2E_ARTIFACT_DIR=harden-tests/local-artifacts/hard02-6ebc5d9-mobile BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone ./scripts/run-board-e2e.sh`
- Exit status: 1.
- Compose project: disposable board smoke project; runner removed its generated project and volumes.
- Images: API `sha256:b9a2b8181f044a51b6ec10f10d9bd660ebb588d01efa833576e5908e28158621`; web `sha256:f54bcd7b3b507d220a7b60224c85fb4eafb9499bf5a9b83baaf1ca0d10e2b217`.
- Database: PostgreSQL 16.15; disposable database and migrations completed.
- Browser/environment: mobile-size Chromium responsive emulation per the `iphone` runner profile, not physical iPhone Chrome or WebKit. Other exact browser/host metadata are in local run metadata if recorded, otherwise unknown.
- Suite outcomes: 25 passed, 4 failed, 0 skipped (29 total).
- Failed cases: Gantt card locator detached during scrolling; `button.board-tab-more` unavailable while switching boards/views; archive link click intercepted by the floating timer; archive footer hit target covered by the shell.
- Retry journey: passed, including draft preservation through 503 and 409 and successful replay.
- Artifacts (local, git-ignored): [`run directory`](../local-artifacts/hard02-6ebc5d9-mobile/) contains screenshots, traces, failure summaries, command transcript, run metadata, and scoped stack logs. Retain through 2026-10-15, then remove `harden-tests/local-artifacts/`.
- Failure groups: archive overlap, 2 cases in 1 suite; detached Gantt locator, 1 case in 1 suite; unavailable More boards control, 1 case in 1 suite. Causes remain suspected where DOM/network evidence does not establish them.
