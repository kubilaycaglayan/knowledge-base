# Navigation warm-up cache acceptance checklist

When a signed-in user opens any page, the web app later warms up the other
navigable pages in the background, so moving between pages afterwards is
instant. Warm-up reuses the Pinia caches the pages already read, so a warmed
page makes no extra request for warmed data. Warm-up must never flood the
API: accidental repeated reloads, many open tabs, dev-server full reloads and
automated test browsers must not multiply its requests.

## Behaviour

- [ ] **WU-01** The code chunk of every lazily loaded route is preloaded once
  the warm-up starts (static assets only, no API requests).
  Tests: `warmup.test.ts` "preloads every lazy route component once".
- [ ] **WU-02** Data warm-up fills the caches the pages read: paths, the label
  catalog (Notes, Calendar, Time entry and Log scopes), the first Sessions
  page, the first Notes page, the current Calendar month grid, the default
  Reports week and the Logs list. Opening Sessions, Paths, Labels, Notes,
  Calendar or Reports afterwards sends no request for that data.
  Tests: `warmup.test.ts` "fills every page cache…",
  `warmup-pages.test.ts` "warmed pages open without refetching".
- [ ] **WU-03** The Logs page shows warmed logs at once and refreshes them in
  the background (the same single request it sends today).
  Tests: `LogsView.test.ts` "shows warmed logs before the refresh returns".
- [ ] **WU-04** Data the open page already loaded is skipped, so warm-up never
  repeats the landing page's requests.
  Tests: `warmup.test.ts` "skips caches that are already loaded".
- [ ] **WU-05** The Boards list and board views are not warmed, so the Board
  page still restores the saved board instead of All boards.
  Tests: `warmup.test.ts` "never loads boards".

## Request budget

- [ ] **WU-06** Warm-up starts only after a quiet delay (3 s, then browser
  idle) while the tab is visible; a hidden tab waits until it is shown.
  Reloading or leaving before then cancels it with no request sent.
  Tests: `warmup.test.ts` "waits for the delay…", "waits for a hidden tab…",
  "cancelling before the delay sends nothing".
- [ ] **WU-07** A successful or failed warm-up claims a 10 minute cooldown in
  `localStorage` before its first request; reloads and other tabs inside the
  cooldown skip data warm-up.
  Tests: `warmup.test.ts` "skips data warm-up inside the cooldown…".
- [ ] **WU-08** Requests run one at a time with a short gap between them
  (about ten requests in total).
  Tests: `warmup.test.ts` "runs one request at a time…".
- [ ] **WU-09** The first failure stops the warm-up without retries.
  Tests: `warmup.test.ts` "stops at the first failure".
- [ ] **WU-10** Warm-up is off in automated browsers (`navigator.webdriver`),
  with Save-Data, when built with `VITE_WARMUP=off`, or when
  `localStorage.know_warmup` is `off`; `force` turns it on for browser tests.
  Tests: `warmup.test.ts` "is disabled for…", `nav-shell.acceptance.test.mjs`
  "warms the other pages once…".
- [ ] **WU-11** Signing out cancels a running warm-up and clears the cooldown,
  so the next account gets its own warm-up.
  Tests: `warmup.test.ts` "cancel stops the remaining tasks",
  `App.test.ts` "starts the warm-up for a signed-in user and cancels it on sign-out".
