# E2E run: desktop Chromium board suite

- Date (UTC): 2026-10-08
- Commit: `fb8f96a` (test changes were uncommitted in the working tree)
- Compose project: `knowledge-base-board-smoke-2466268-1791485964393305844` (unique; removed by runner)
- Images (tag and immutable ID): `knowledge-base-api:test-only` — `sha256:e2e7f1ae73ae0f873a85695ec4761581fa66fb2c63a578c9b88024d91c1e0e22`; `knowledge-base-web:test-only` — `sha256:e0e0fdf9d2dbfcadb1b09d7e942de7a3980d5c31006224e6ea9c0dd1cb478838`
- Browser/profile: Playwright Chromium 1.63.0, desktop 1440×900, headless; phone-specific case explicitly switches to 390×844
- Environment: Linux development host, Node, Docker Compose disposable stack
- Suite outcomes: board real-stack 26 passed, 1 failed, across 27 tests
- Failed cases: `keeps the archive footer clear of the fixed bottom tracker`
- Artifacts/logs: `/tmp/knowledge-base-board-e2e-verified.log` (local, not committed)
- Fixed-data performance: not measured; no baseline established.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Archive footer overlaps the fixed dashboard shell at the scrolled page bottom | 1 | 1 | Board case 21 | Hit testing found `null covered by shell dashboard-shell`. Reproduced in two focused runs; likely a real layout issue or an overly strict hit-test. Inspect the footer's last row geometry before changing the assertion. |
| Unclassified | 0 | 0 | None | No other failures in this pass |

## Root-cause corrections

- The earlier 23 board setup failures are corrected by seeding fresh fixture boards through the authenticated API and waiting for route selection by board ID. The suite now passed the overflow, board edits, and pagination cases.

## Profile and scope notes

This is the full board real-stack suite on desktop Chromium. It covers board and card edits, stale concurrent card writes, pagination, and board state restoration. A separate WebKit run is still needed for this entire suite. This does not represent Chrome on physical iPhone hardware.
