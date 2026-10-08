# Long-content browser resilience

- Date (UTC): 2026-10-08; exact run times not separately recorded.
- Engine/profile: desktop Chromium and phone-size Chromium, each against a disposable real-stack stack.
- Search suite: after two authoring attempts using a title longer than the search API's 120-character clipped result title, the fixture was reduced to a still-long 119-character title. The result exposes the full title in the accessible name, renders a matching snippet from a long note body, and keeps document scroll width within the viewport. Desktop and phone-size search suites both passed 2/2.
- Initial line-history desktop and phone-size commands each reported 12 passed, 1 failed. The overlap helper measured the entire inline block, including the timestamp; its output concatenated the date stamp with list/code text.
- Visual follow-up screenshot: `harden-tests/local-artifacts/hard02-long-content-phone/screenshots/note-phone-long-content-before-layout-assertion.png`. The timestamp and content columns are visually separated. The helper was corrected to measure text nodes outside timestamp elements.
- The long card title/body remained readable in the editor with no page-width overflow. The expanded phone note body was present through its ending marker.
- Final line-history desktop rerun: `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop LINE_HISTORY_E2E_PROXY_PORT=26496 ./scripts/run-line-history-e2e.sh` — exit 0, 13 passed.
- Final line-history phone-size rerun: `BROWSER_ENGINE=chromium BROWSER_PROFILE=mobile LINE_HISTORY_E2E_PROXY_PORT=26497 ./scripts/run-line-history-e2e.sh` — exit 0, 13 passed.
- The initial overlap failures are classified as a test-authoring measurement false positive, not an application defect; the text-node-only helper passed in both full reruns.
- No personal data or credentials were recorded in the report; the screenshot remains in an ignored local artifact directory.
- Two earlier search title fixture attempts failed because the API clips very long result titles; those test-authoring occurrences are included in the cumulative count.
