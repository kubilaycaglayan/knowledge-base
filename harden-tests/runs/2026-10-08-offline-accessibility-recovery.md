# Search offline recovery and keyboard feedback

- Date (UTC): 2026-10-08; exact run times not separately recorded.
- Commit at run: working tree after `26b80d8`, before this evidence commit.
- Browser profiles: desktop Chromium and phone-size Chromium emulation; each ran against a disposable real-stack Compose project.
- Test: `search.real-stack.acceptance.test.mjs` now holds the request after the input announces “Searching…”, switches the browser context offline, aborts the request with `internetdisconnected`, asserts the query and accessible error remain, restores connectivity, focuses “Try again” with the keyboard, presses Enter, then asserts the no-results message and polite status announcement.
- Desktop command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop SEARCH_E2E_PROXY_PORT=26483 ./scripts/run-search-e2e.sh` — exit 0, 1 passed.
- Mobile-size command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=mobile SEARCH_E2E_PROXY_PORT=26484 ./scripts/run-search-e2e.sh` — exit 0, 1 passed.
- The first two authoring attempts timed out looking for the loading announcement as a visible status. The live region is screen-reader-only and outside the dialog; the final test reads its DOM announcement text without asserting visual visibility.
- No trace, screenshot, request log, or image identity was retained by this runner. Both accounts were disposable synthetic accounts. Do not treat these runs as evidence for other routes or browser engines.
- After failure-capture hooks were added, desktop and phone-size search runs each passed 2/2 including the long-title/snippet case; see the [capture verification report](2026-10-08-browser-failure-artifacts.md).

# Timer draft recovery by keyboard

- The timer retry test now edits with keyboard input and tabs away to fire the textarea's documented `change` handler. It asserts the accessible alert after the injected 503 and verifies the successful retry in the server draft.
- Desktop Chromium command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop TIMER_E2E_PROXY_PORT=26486 ./scripts/run-timer-websocket-e2e.sh` — exit 0, 3 passed.
- Phone-size Chromium command: `BROWSER_ENGINE=chromium BROWSER_PROFILE=mobile TIMER_E2E_PROXY_PORT=26487 ./scripts/run-timer-websocket-e2e.sh` — exit 0, 3 passed.
- An earlier fill-only authoring attempt did not fire the field's change handler and timed out; adding Tab after the edit made both profile runs pass. The runner did not retain a trace or screenshot for these passing runs.
- After failure-capture hooks were added, desktop and phone-size timer runs each passed 3/3; see the [capture verification report](2026-10-08-browser-failure-artifacts.md).
