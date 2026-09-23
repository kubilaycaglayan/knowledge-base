# User preferences acceptance checklist

Everything a signed-in user adjusts is stored by the server, so it follows them
across browsers and devices. Boards, statuses, cards, orders, sorts, pins,
visibility, archives, and labels already live in PostgreSQL. This checklist
covers the settings that used to live only in browser storage. The browser
keeps only the sign-in token, plus a cache of the theme and Kanban width so the
first paint does not flash; the server's values win once they load. Each item
names the tests that cover it. Tick an item only once those tests pass.

## API

- [ ] **UP-01** `GET /api/v1/preferences` returns the signed-in user's `theme` (`auto`, `light`, or `dark`; default `auto`) and `kanbanWide` (default `false`). Migration `V48__user_preferences.sql` stores them per user.
  _Tests:_ `UserPreferencesIntegrationTest.preferencesDefaultForANewUser`, smoke `run-smoke-tests.sh` (Flyway on PostgreSQL)
- [ ] **UP-02** `PUT /api/v1/preferences` updates only the fields it sends and returns the full preferences. An unknown theme returns `400`, and one user's preferences never change another's.
  _Tests:_ `UserPreferencesIntegrationTest.preferencesArePartialUpdatesPerUser`, `UserPreferencesIntegrationTest.unknownThemeIsRejected`
- [ ] **UP-03** The response also carries `recentPathIds`: up to five distinct active paths from the user's most recent time entries, newest first. It is derived from time entries, not stored separately.
  _Tests:_ `UserPreferencesIntegrationTest.recentPathsComeFromRecentTimeEntries`

## Web

- [ ] **UP-04** After sign-in the app loads the preferences and applies the theme; changing the theme saves it to the server. Signed out, the theme still works from the browser cache.
  _Tests:_ `preferences.test.ts`, `theme.test.ts`
- [ ] **UP-05** The Kanban full-width toggle reads and saves `kanbanWide` on the server.
  _Tests:_ `BoardView.test.ts` "toggles the Kanban between page width and full width and remembers it", `board.real-stack.acceptance.test.mjs` "remembers the Kanban width on the server"
- [ ] **UP-06** The time tracker's recent paths come from the server's `recentPathIds`, and `know_recent_timer_paths` is no longer written to browser storage.
  _Tests:_ `timer.test.ts` "takes recent paths from the server's preferences"
- [ ] **UP-07** `docs/api.md` documents the preferences endpoints.
