# E2E run: board suite attempt with incomplete run metadata

- Date (UTC): 2026-10-08; local transcript last modified at 18:58:57 UTC. Exact start/end time was not recorded.
- Commit: Not recorded in the transcript; cannot be established from the retained output.
- Compose project: `knowledge-base-board-smoke-2461793-1791485901249965426` (unique project name observed in Docker output).
- Images (tag and immutable ID): `knowledge-base-api:test-only` and `knowledge-base-web:test-only` were built; immutable IDs were not captured.
- Browser engine/version and profile (viewport, user agent, touch, scale factor): Not recorded. The failure names include a phone-specific assertion, but that does not establish the run profile.
- Environment (OS, Node, Playwright): Not recorded in this transcript.
- Observed invocation: `npm run test:board:e2e`; the outer wrapper and its inherited environment were not recorded.
- Suite outcomes: board real-stack 24 passed, 3 failed, 0 skipped (27 total).
- Failed cases:
  - `keeps the Kanban/Gantt switch in the board menu on phones`: assertion reported `No view switch row on phones`.
  - `keeps the archive footer clear of the fixed bottom tracker`: hit testing reported `null covered by shell dashboard-shell`.
  - `restores the board state in a new session`: timed out waiting for `.board-tab.selected`.
- Artifacts/logs: local transcript `/tmp/knowledge-base-board-e2e-final.log`; this path is machine-local and the raw log is not committed or retained in shared CI storage.
- Fixed-data performance: not measured.

## Failure disposition

| Failure signature | Case count | Suite count | Disposition and evidence |
| --- | ---: | ---: | --- |
| Archive footer hit target covered by the dashboard shell | 1 | 1 | Repeats the same assertion and hit-test result in the later [desktop board report](2026-10-08-fb8f96a-desktop-chromium-board.md) and [mobile WebKit board report](2026-10-08-fb8f96a-iphone-webkit-board.md). Root cause remains unconfirmed. |
| Phone board view-switch row absent | 1 | 1 | Unclassified. The report does not identify the browser engine, viewport, or inherited profile, and no trace/DOM snapshot is retained. |
| Board state restore waits for selected tab | 1 | 1 | Not reproduced in the later [focused desktop Chromium report](2026-10-08-fb8f96a-desktop-chromium-board.md), whose only failure was the archive-footer hit test. No trace or environment metadata establishes the original cause. |

## Evidence limits

This transcript is sufficient to preserve the three observed failures and the
Compose project name, but it is not a complete reproducible run report. Its
missing commit, browser/profile, machine, image IDs, and durable artifacts mean
it cannot establish profile-specific pass/fail coverage. Keep those fields
unknown; do not infer them from the test names or from later runs.
