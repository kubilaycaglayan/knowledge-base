# E2E run: Chromium real-stack and fixture suites

- Date (UTC): 2026-10-08
- Commit: `fb8f96a` (workspace HEAD at run start)
- Compose project: `knowledge-base-full-smoke-2379590` (unique; removed at end)
- Images (tag and immutable ID): `knowledge-base-api:test-only` — `sha256:e5b89838f77180fed85979ad0aea72927ac2e9909db0db21776857de41dbd944`; `knowledge-base-web:test-only` — `sha256:f82e2f895e181abc0b6713662e84fabef15d890a5b29733b0917a2dc8e471079`
- Browser/profile: Playwright Chromium 1.63.0, headless. Board suite context: 390×844, touch not enabled; timer suite: 1280×800; line-history suites include phone and desktop viewport cases.
- Environment: Linux development host, Node from local environment, Docker Compose disposable stack
- Suite outcomes: backend  pass; frontend unit/build pass (740 tests); extension pass; contracts pass; full-stack smoke pass; session-tracker fixture acceptance 1/10; board real-stack acceptance 3/27; timer real-stack acceptance 2/2; line-history real-stack acceptance 11/11; cleanup pass.
- Failed cases: 24 board cases (one detached card locator, 23 failures during per-test board setup); 9 session-tracker fixture cases (locator focus/fill timeouts).
- Artifacts/logs: terminal output from `./scripts/test-run-all.sh`; session-tracker screenshot directory `/tmp/knowledge-base-tracker-acceptance-UuErLg` (local, not committed). No retained stack logs.
- Fixed-data performance: not measured; no baseline established.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Board setup assumes the newly selected board remains a visible tab after tab-bar overflow | 23 | 1 | Board cases 5–27 | All reported setup timeouts waited for `.board-tab.selected` after `createBoard`; the suite creates a board before each test and uses the More menu once the tab bar fills. Strong suspected shared cause; not yet fixed or independently rerun. |
| Detached board card locator during Gantt assertion | 1 | 1 | Board case 4 | `scrollIntoViewIfNeeded` reported that the element was detached at line 301. No retained DOM snapshot, so cause remains unconfirmed. |
| Session-tracker fixture controls unavailable during keyboard/fill interactions | 9 | 1 | Session tracker cases 2–10 | Failures include `locator.focus` and `locator.fill` timeouts against selected-label and new-label controls. Exact shared trigger is unclassified; inspect the full output and screenshots before changing assertions. |
| Unclassified | 0 | 0 | None | No additional failed cases observed. |

## Root-cause corrections

- Confirmed the 23 repeated setup failures were caused by fixture creation waiting on a visible selected tab after the responsive tab bar overflowed. Fixture boards are now seeded through the authenticated API, selected by route ID, and awaited by that route state. The focused desktop board rerun passed 26/27; see [the rerun report](2026-10-08-fb8f96a-desktop-chromium-board.md).
- The detached card locator was not reproduced on the focused rerun; it passed there. Keep it as a historical one-off until it repeats.

## Profile and scope notes

This was a Chromium run, not the requested stable desktop profile: the board suite used a 390×844 viewport, and no touch emulation was configured. No emulated iPhone WebKit pass was run. It does not establish physical iPhone Chrome coverage. The listed browser suites passed or failed on this run's single test stack; no separate long-lived stack was retained.
