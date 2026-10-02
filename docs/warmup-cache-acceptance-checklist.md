# Navigation warm-up cache acceptance checklist

When a signed-in user opens any page, the web app later warms up the other
navigable pages in the background, so moving between pages afterwards is
instant. Warm-up reuses the Pinia caches the pages already read, so a warmed
page makes no extra request for warmed data. Warm-up must never flood the
API: accidental repeated reloads, many open tabs, dev-server full reloads and
automated test browsers must not multiply its requests.

## Behaviour

- [x] **WU-01** The code chunk of every lazily loaded route is preloaded once
  the warm-up starts (static assets only, no API requests).
  Tests: `warmup.test.ts` "preloads every lazy route component once".
- [x] **WU-02** Data warm-up fills the caches the pages read: paths, the label
  catalog (Notes, Calendar, Time entry and Log scopes), the first Sessions
  page, the first Notes page, the current Calendar month grid, the default
  Reports week and the Logs list. Opening Sessions, Paths, Labels, Notes,
  Calendar or Reports afterwards sends no request for that data.
  Tests: `warmup.test.ts` "fills every page cache…",
  `warmup-pages.test.ts` "warmed pages open without refetching".
- [x] **WU-03** The Logs page shows warmed logs at once and refreshes them in
  the background (the same single request it sends today).
  Tests: `LogsView.test.ts` "shows warmed logs before the refresh returns",
  `warmup-pages.test.ts` "Logs shows warmed logs and refreshes them once…".
- [x] **WU-04** Data the open page already loaded is skipped, so warm-up never
  repeats the landing page's requests.
  A warmed response that arrives after a change cleared that cache is dropped.
  Tests: `warmup.test.ts` "skips caches that are already loaded",
  "drops a warmed page when the cache was cleared meanwhile".
- [x] **WU-05** ~~The Boards list and board views are not warmed~~ (replaced
  by WU-12).
- [x] **WU-12** The Board page is warmed too: the board list, the board the
  Board page will open (the saved board, else All boards) and its Gantt window
  (the saved range when the saved view is Gantt, else today plus 13 days) are
  fetched into the boards store's caches without selecting a board. Opening
  the Board page afterwards, in Kanban or Gantt view, sends no board request,
  and it still restores the saved board; a saved board that left the tabs
  still falls back to All boards.
  Tests: `boards.test.ts` "prefetches the board list without selecting a
  board…", "prefetches a board view…", "prefetches the All boards view…",
  "prefetches a Gantt window…", `warmup.test.ts` "warms the board the Board
  page will open…", `warmup-board.test.ts` "opens the warmed board…",
  `nav-shell.acceptance.test.mjs` "warms the other pages once…".
- [x] **WU-13** Board warm-up fetches column pages one at a time, skips a view
  or Gantt window that is already cached or open, and drops a warmed view or
  window that arrives after the boards changed (invalidate, All boards
  forgotten, reset) or after the Board page loaded a board meanwhile.
  Tests: `boards.test.ts` "fetches prefetched column pages one at a time",
  "drops a prefetched view when the boards change meanwhile".

## Request budget

- [x] **WU-06** Warm-up starts only after a quiet delay (3 s, then browser
  idle) while the tab is visible; a hidden tab waits until it is shown.
  Reloading or leaving before then cancels it with no request sent.
  Tests: `warmup.test.ts` "waits for the delay…", "waits for a hidden tab…",
  "cancelling before the delay sends nothing…".
- [x] **WU-07** A successful or failed warm-up claims a 10 minute cooldown in
  `localStorage` before its first request; reloads and other tabs inside the
  cooldown skip data warm-up.
  Tests: `warmup.test.ts` "skips data warm-up inside the cooldown…".
- [x] **WU-08** Requests run one at a time with a short gap between them
  (about ten requests, plus one per column of the warmed board).
  Tests: `warmup.test.ts` "runs one request at a time with a gap…".
- [x] **WU-09** The first failure stops the warm-up without retries.
  Tests: `warmup.test.ts` "stops at the first failure without retrying".
- [x] **WU-10** Warm-up is off in automated browsers (`navigator.webdriver`),
  with Save-Data, when built with `VITE_WARMUP=off`, or when
  `localStorage.know_warmup` is `off`; `force` turns it on for browser tests.
  Tests: `warmup.test.ts` "is disabled for…", `nav-shell.acceptance.test.mjs`
  "warms the other pages once…".
- [x] **WU-11** Signing out cancels a running warm-up and clears the cooldown,
  so the next account gets its own warm-up.
  Tests: `warmup.test.ts` "cancel stops the remaining tasks",
  `App.warmup.test.ts` "starts the warm-up for a signed-in user and cancels it on sign-out".

## Verification

Real dev stack, disposable account, warm-up forced (2026-10-02): landing on
Sessions sent its own 7 requests plus 5 warm-up requests (labels, notes,
calendar, reports, logs; paths and the first sessions page were skipped as
already loaded). Five rapid reloads afterwards and a second tab sent no warm-up
requests. Opening Reports, Calendar, Notes, Labels, and Paths after warm-up sent
none; Logs sent only its usual background refresh.

Board warm-up on the real dev stack (2026-10-02, a board with four columns and
six cards, saved in Gantt view): opening the Board page from Logs after warm-up
sent no board or label request and showed the Gantt cards in 148 ms; without
warm-up it sent 9 requests and took 456 ms on localhost.
