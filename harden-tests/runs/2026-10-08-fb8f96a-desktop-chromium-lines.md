# E2E run: desktop Chromium line-history suite

- Date (UTC): 2026-10-08
- Commit: `fb8f96a` (implementation changes were uncommitted in the working tree)
- Compose project: `knowledge-base-lines-smoke-2428210-1791485466382761937` (unique; removed by runner)
- Images (tag and immutable ID): `knowledge-base-api:test-only` — `sha256:8bbff532ed77152960435ae6bc0691e3cf6d2960b57ae23d6789d3056beee9df`; `knowledge-base-web:test-only` — `sha256:b42bb4b9d98d978651ba99912fbbed123de2a9a7257ec14bb9a043a9bcf1ca84`
- Browser/profile: Playwright Chromium 1.63.0, desktop 1280×900 default viewport; phone viewport cases run within the suite; touch emulation off
- Environment: Linux development host, Node, Docker Compose disposable stack
- Suite outcomes: line-history real-stack 11/11 passed across four suites (notes, cross-client, assistive technology, board card)
- Failed cases: None
- Artifacts/logs: terminal output from `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/run-line-history-e2e.sh`; no logs or screenshots retained
- Fixed-data performance: not measured; no baseline established.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Unclassified | 0 | 0 | None | All 11 cases passed |

## Root-cause corrections

- None needed for this run.

## Profile and scope notes

This records the line-history slice only. It does not count as the full desktop Chromium board, search, auth/session, and timer acceptance set. The browser selector and suite passed through the isolated real API, PostgreSQL, proxy, and web stack.
