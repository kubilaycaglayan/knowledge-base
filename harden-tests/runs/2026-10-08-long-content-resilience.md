# Long-content browser resilience

- Date (UTC): 2026-10-08; exact run times not separately recorded.
- Engine/profile: desktop Chromium and phone-size Chromium, each against a disposable real-stack stack.
- Search suite: after two authoring attempts using a title longer than the search API's 120-character clipped result title, the fixture was reduced to a still-long 119-character title. The result exposes the full title in the accessible name, renders a matching snippet from a long note body, and keeps document scroll width within the viewport. Desktop and phone-size search suites both passed 2/2.
- Line-history desktop command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop LINE_HISTORY_E2E_PROXY_PORT=26493 ./scripts/run-line-history-e2e.sh` — 12 passed, 1 failed.
- Line-history phone-size command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=mobile LINE_HISTORY_E2E_PROXY_PORT=26494 ./scripts/run-line-history-e2e.sh` — 12 passed, 1 failed.
- In each line-history profile, the long card title/body remained readable in the editor and produced no page-width overflow. The expanded phone note body was also present through its ending marker.
- Both line-history runs reproduced timestamp gutter overlap against list items and code-block lines in the phone dark-theme note check. The overlap assertion fails with examples containing “Item”, “Done”, and code lines `a = 1` / `b = 2`. This is an application layout finding, tracked as `KB-HARD02-05` in the [follow-up register](../follow-up-defects.md).
- The line-history runner retained no trace, screenshot, request log, or image ID for these runs. Suite output is the only retained evidence. No personal data or credentials were recorded in the report.
- Two earlier search title fixture attempts failed because the API clips very long result titles; those test-authoring occurrences are included in the cumulative count.
