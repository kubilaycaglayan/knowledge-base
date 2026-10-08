# E2E run: emulated iPhone WebKit board suite

- Date (UTC): 2026-10-08
- Commit: `fb8f96a` (test changes were uncommitted in the working tree)
- Compose project: `knowledge-base-board-smoke-2470498-1791486018177929740` (unique; removed by runner)
- Images (tag and immutable ID): `knowledge-base-api:test-only` — `sha256:5a62c2fc5359095bbb1916ac77d990b72aec4a7a06cc8bcbb3707c198a2c7521`; `knowledge-base-web:test-only` — `sha256:dcbd74ca145288fd402c84c8072283a974e9223eb6ea42b349934749bf903c73`
- Browser/profile: Playwright WebKit 26.6, emulated iPhone, 390×844, touch enabled, device scale factor 3, headless
- Environment: Linux development host, Node, Docker Compose disposable stack
- Suite outcomes: board real-stack 23 passed, 4 failed, across 27 tests
- Failed cases: Gantt blank-card locator detached; More boards menu unavailable in card view switching; timer button intercepted archive link click; archive footer hit-test covered by timer button
- Artifacts/logs: `/tmp/knowledge-base-board-webkit.log` (local, not committed)
- Fixed-data performance: not measured; no baseline established.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| WebKit re-renders the Gantt card before locator scroll | 1 | 1 | Board case 4 | `scrollIntoViewIfNeeded` saw a detached element; same failure signature appeared in the initial Chromium pass. Capture a trace to distinguish timing from application state. |
| Board menu control is absent during phone card/view switching | 1 | 1 | Board case 17 | Timeout waiting for `button.board-tab-more`; other phone menu/Axe cases passed. Inspect responsive board state around the view switch. |
| Fixed timer/shell overlaps archive footer controls | 2 | 2 | Board cases 19 and 21 | Clicking the archive link was intercepted by the floating timer action; footer center-point hit-test also found a covering timer button. Desktop rerun independently found the shell covering an archive footer control. |
| Unclassified | 0 | 0 | None | No additional failures observed |

## Root-cause corrections

- Fixture board setup uses API-created data and route-ID selection; all 27 setup hooks completed and board editing/pagination cases ran. The prior tab-overflow setup failure did not recur.
- No corrections yet for remaining failures.

## Profile and scope notes

This is the full board suite on emulated iPhone WebKit with touch enabled. It includes board/card edits, pagination, stale concurrent writes, and responsive menu behavior. It does not represent Chrome on physical iPhone hardware.
