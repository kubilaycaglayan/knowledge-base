# OTOTEST-03 product acceptance checklist: web routes and controls

**Milestone:** [OTOTEST-03 — Web routes and interactive controls](03-web-routes-and-controls.md)

**Product map:** [#ototest product test tree](product-test-tree.md)

**Status:** In progress; checked criteria have linked evidence. Unchecked
criteria remain open. Mobile emulation evidence is identified as supplemental.

This checklist translates OTOTEST-03 into independently reviewable product
flows. Each flow has one user-visible responsibility. It covers the current
Knowledge Base web application in desktop Chrome and mobile Chrome. It does
not cover native iOS, the Chrome extension, or test implementation/execution;
the extension has its own scope in OTOTEST-04.

## Acceptance setup

- [ ] Use a local or otherwise approved non-production application and
  disposable account data only.
- [ ] Record the application revision, Chrome version, operating system,
  viewport, theme, and account state for each acceptance pass.
- [ ] Check desktop Chrome at a representative laptop width and a wide desktop
  width.
- [ ] Check mobile Chrome on a real Android device or an explicitly identified
  mobile Chrome profile at a phone-sized viewport. Record which was used.
- [ ] Keep mobile Chrome findings separate from desktop Chrome findings.
- [ ] Do not treat a desktop viewport emulation or user-agent override as proof
  of behavior on a real mobile Chrome installation.
- [ ] Use keyboard-only input for flows with keyboard alternatives.
- [ ] Use touch-only input for the mobile Chrome flows.
- [ ] Use records with clearly identifiable names when a flow needs saved data;
  do not alter personal or production data.
- [ ] Check at least one light-theme and one dark-theme pass for theme-sensitive
  controls and dialogs.
- [ ] Check narrow viewport and browser zoom/reflow without hiding actions or
  causing unintended horizontal page overflow.

## Shared shell and route behavior

### Flow: Open the authenticated home workspace

- [x] Opening `/` while signed in displays the Sessions workspace, document
  title, empty state and inline tracker in desktop Chromium. Evidence: `cd
  frontend && node --test --test-name-pattern='opens the Sessions workspace
  directly' scripts/nav-shell.acceptance.test.mjs` (mocked API).
- [x] The document title identifies Knowledge Base and the current page.
  Evidence: the primary navigation browser test verifies the title for each
  destination; `opens the Sessions workspace directly` checks the home title.
- [x] The skip-to-content link moves focus to the main content region.
  Evidence: `cd frontend && node --test --test-name-pattern='moves focus from
  the skip link' scripts/nav-shell.acceptance.test.mjs` activates the link and
  checks focus on `#main-content`.
- [x] The brand link navigates home without a full page reload. Evidence:
  `cd frontend && node --test --test-name-pattern='navigates home from the
  logo without a page reload' scripts/nav-shell.acceptance.test.mjs` checks
  client-side navigation and cached home data.
- [x] The authenticated navigation exposes only supported product
  destinations. Evidence: `cd frontend && node --test
  --test-name-pattern='keeps every supported primary destination reachable'
  scripts/nav-shell.acceptance.test.mjs` asserts the exact supported route
  links and excludes tooling routes.
- [x] The responsive navigation keeps every supported destination reachable
  at phone width. Evidence: the same 390px browser test checks each link is
  visible, stays within the viewport, and has a target at least 44px high.
- [x] The shell navigation and Settings action stay visible without
  horizontal overflow across narrow, laptop, wide, and 50%-zoom-equivalent
  CSS viewport widths. Evidence: `cd frontend && node --test
  --test-name-pattern='50%-zoom-equivalent widths'
  scripts/nav-shell.acceptance.test.mjs` checks 320, 390, 1280, 1920, and
  2880 CSS pixels. The 2880px case tests the resulting layout width; native
  browser zoom remains part of the open global responsive acceptance check.
- [x] The page has one visible level-one heading that identifies its content.
  Evidence: `cd frontend && node --test --test-name-pattern='opens the
  Sessions workspace directly' scripts/nav-shell.acceptance.test.mjs` checks
  one visible `h1` with the text Sessions.

### Flow: Navigate with the primary navigation

- [x] Each primary navigation link opens its corresponding route. Evidence:
  `cd frontend && node --test --test-name-pattern='opens each primary
  navigation route' scripts/nav-shell.acceptance.test.mjs` activates all seven
  primary links and checks their destination routes (mocked API browser test).
- [x] The active page is identifiable without relying on color alone.
  Evidence: the same test checks `aria-current="page"` on each active link.
- [x] Navigation links support keyboard activation and open-in-new-tab
  behavior. Evidence: `cd frontend && node --test
  --test-name-pattern='supports keyboard navigation and opening a primary
  link' scripts/nav-shell.acceptance.test.mjs` activates Reports with Enter
  and opens Calendar in a new tab (browser test).
- [x] Browser Back returns to the prior route. Evidence: the primary
  navigation route test navigates Board → Logs and checks Back returns to
  Board.
- [x] Browser Forward returns to the next route. Evidence: the same test
  checks Forward returns to Logs.
- [x] The document title updates after each route change. Evidence: the
  primary navigation route test checks all seven route titles and their Back /
  Forward transitions.
- [x] The floating tracker is available on eligible routes. Evidence: `cd
  frontend && node --test --test-name-pattern='shows the floating tracker on
  eligible routes' scripts/nav-shell.acceptance.test.mjs` checks visibility
  on Board, Logs, Notes, Calendar, Reports, Paths, and Labels (390px browser).
- [x] The floating tracker is hidden on Sessions routes. Evidence: the same
  test verifies no floating tracker on Sessions home or session detail while
  the inline home tracker remains available.
- [x] The floating tracker does not cover the focused mobile text input.
  Evidence: the same 390px test focuses the Log text field and verifies the
  fixed tracker is removed while the field retains focus within the viewport.

### Flow: Open a supported route directly

- [x] Directly loading each supported route renders its matching page.
  Evidence: `cd frontend && node --test --test-name-pattern='renders every
  supported top-level route' scripts/nav-shell.acceptance.test.mjs` hard-loads
  each top-level workspace route and the `/sessions` redirect; the dedicated
  browser cases in the same file directly load `/sessions/:id`, `/paths/:id`,
  `/logs/:id`, `/labels/:id`, `/notes/:id`, and `/board/archive` (mocked API).
- [x] Refreshing a supported route preserves the route and its valid query
  state. Evidence: `cd frontend && node --test --test-name-pattern='loads
  report filters from a direct query URL|loads a Calendar date deep link|keeps
  the Labels search query' scripts/nav-shell.acceptance.test.mjs` reloads
  Reports date/aggregation/path/label filters, the Calendar selected date, and
  the Labels search query, then verifies the route and rendered state (mocked
  API).
- [x] Opening `/sessions` from another supported route resolves to `/`; Back
  restores the prior route and Forward returns to Sessions. Evidence:
  `cd frontend && npm run test:nav` — `redirects /sessions to the Sessions
  home and restores history with Back and Forward` (mocked API browser test).
- [x] Direct loading `/sessions/:id` opens the selected session detail in
  desktop Chromium. Evidence: `cd frontend && node --test
  --test-name-pattern='session detail when the browser loads its deep link
  directly' scripts/nav-shell.acceptance.test.mjs` (mocked API).
- [x] Direct loading `/paths/:id` opens the selected path history context.
  Evidence: `cd frontend && node --test --test-name-pattern='opens path
  history when the browser loads its deep link directly'
  scripts/nav-shell.acceptance.test.mjs` directly loads a seeded Path URL and
  verifies its history dialog and empty state (mocked API browser test).
- [x] Direct loading `/logs/:id` opens the selected log detail. Evidence: `cd
  frontend && node --test --test-name-pattern='opens a log detail when the
  browser loads its deep link directly' scripts/nav-shell.acceptance.test.mjs`
  verifies the record body, route, and detail request (mocked API browser
  test).
- [x] Direct loading `/labels/:id` opens the selected label history. Evidence:
  `cd frontend && node --test --test-name-pattern='opens label history when
  the browser loads its deep link directly' scripts/nav-shell.acceptance.test.mjs`
  verifies the selected label, history response, and route (mocked API browser
  test).
- [x] Direct loading `/notes/:id` opens the selected note editor. Evidence:
  `cd frontend && node --test --test-name-pattern='loads a note editor when
  the browser opens its deep link directly' scripts/nav-shell.acceptance.test.mjs`
  verifies the editor, selected title, and route (mocked API browser test).
- [x] Direct loading `/board/archive` opens the board archive. Evidence: `cd
  frontend && node --test --test-name-pattern='opens the board archive when the
  browser loads its route directly' scripts/nav-shell.acceptance.test.mjs`
  verifies the archive page and its empty board state on a direct route load
  (mocked API browser test).
- [ ] A missing or inaccessible record ID produces a clear not-found or
  unavailable state without exposing another user's record.
- [x] `/development` remains outside supported product navigation and has no
  authenticated navbar link. Evidence: `cd frontend && node --test
  --test-name-pattern='keeps every supported primary destination reachable'
  scripts/nav-shell.acceptance.test.mjs` asserts the exact authenticated
  navigation href set, which contains no `/development` destination.

### Flow: Recover from an unauthenticated deep link

- [x] Opening a protected route while signed out displays the sign-in view.
  Evidence: `cd frontend && node --test --test-name-pattern='protected
  deep-link content' scripts/nav-shell.acceptance.test.mjs` directly opens a
  filtered Reports URL with no token and checks the sign-in view.
- [x] The requested internal route is restored after successful sign-in.
  Evidence: the same browser test submits the mocked sign-in form and checks
  the Reports path and date/aggregation query are restored.
- [x] An external or protocol-relative redirect value does not navigate away
  from Knowledge Base. Evidence: `cd frontend && node --test
  --test-name-pattern='external and protocol-relative post-login redirects'
  scripts/nav-shell.acceptance.test.mjs` verifies both values leave the
  browser on the local origin (mocked API).
- [x] Protected page content is not visible before authentication completes.
  Evidence: the protected deep-link test confirms Reports content and
  authenticated navigation are absent before sign-in succeeds.

### Flow: Sign out

- [x] Activating Sign out clears the authenticated view and returns to the
  signed-out experience. Evidence: `cd frontend && node --test
  --test-name-pattern='clears authentication on sign-out'
  scripts/nav-shell.acceptance.test.mjs` checks the sign-in view and cleared
  token (mocked API browser test).
- [x] Protected routes are not available through browser Back after sign-out.
  Evidence: the same test signs out from Reports, navigates Back, and checks
  that protected Reports content is absent.
- [x] Reopening a protected route after sign-out requires authentication.
  Evidence: the same test directly reloads `/reports` after logout and checks
  for the sign-in view instead of Reports content.

### Flow: Recover from a rejected saved session

- [x] When the current saved session is rejected by the application, the user
  is returned to the signed-out experience. Evidence: `cd frontend && node
  --test --test-name-pattern='saved session is rejected'
  scripts/nav-shell.acceptance.test.mjs` rejects the mocked Reports request
  with a 401 and verifies sign-in replaces protected content.
- [x] A stale response for a replaced token does not sign out the current
  authenticated session. Evidence: `cd frontend && npx vitest run
  src/lib/api.test.ts -t 'does not erase a newer sign-in'` verifies the new
  token remains stored and no reload occurs.
- [x] The user can authenticate again after the rejected-session state.
  Evidence: the browser test signs in after the mocked 401 and verifies the
  Reports page returns with the new token.

### Flow: Change the appearance preference

- [x] Switching between light and dark appearance updates the current page.
  Evidence: `applies light and dark appearance changes across routes and
  reloads` in `frontend/scripts/nav-shell.acceptance.test.mjs` checks the root
  theme, color scheme, and workspace background after each selection.
- [x] The selected appearance remains in effect after navigating to another
  route. Evidence: the same browser test changes the preference in Settings,
  then checks it on Reports; the API fixture stores preference updates.
- [x] The selected appearance remains in effect after reloading the app.
  Evidence: the same browser test reloads Reports in both themes and verifies
  the stored preference is applied from the mocked preferences API.
- [x] Dialogs, menus, native selects, and charts remain legible in both themes.
  Evidence: `keeps dialogs, menus, native selects, date picker, and report
  chart readable in both themes` in `frontend/scripts/nav-shell.acceptance.test.mjs`
  checks computed text/background contrast at 4.5:1 or better for the Board
  manager dialog and Gantt board menu, Settings native theme select, Reports
  date picker, and visible Reports SVG chart labels in light and dark themes.

### Flow: Search for a product page

- [x] Opening global search from the header exposes the search input.
- [x] The documented keyboard shortcut opens global search from a supported
  page.
- [x] Searching a page name lists the matching page in the Pages group above
  record results.
  Evidence for these actions: `opens global search from the header or shortcut
  and lists matching pages before records` in
  `frontend/scripts/nav-shell.acceptance.test.mjs` opens from the header,
  verifies input focus, opens with Control+K, and checks the Reports page result
  precedes the mocked Notes record result.

### Flow: Search for an owned record

- [x] Searching a record name groups matching results by record type.
- [x] A result shows its matching text and relevant path, label, or archive
  context where available.
- [x] Arrow keys move the active result and Enter opens that result.
  Evidence for these actions: `groups matching record types, shows note context,
  and opens the active result with Enter` in
  `frontend/scripts/nav-shell.acceptance.test.mjs` asserts separate Notes and
  Logs groups, matching note text and Label context, then opens the selected
  note with ArrowDown and Enter.
- [x] The open-in-new-tab shortcut opens the active result in a new browser
  tab. Evidence: `opens the active global search result in a new tab with
  Control+Enter and native link behavior` in
  `frontend/scripts/nav-shell.acceptance.test.mjs` verifies the selected Note
  opens in a separate browser tab while the original search remains open.
- [x] Every result supports standard link behavior, including opening a new
  tab from the browser context menu. Evidence: the global search new-tab browser
  test verifies a result is an anchor, opens on Control-click, and leaves the
  `contextmenu` event unprevented; `GlobalSearch.test.ts` also verifies modified
  clicks are left to the browser.
- [x] Show more reveals additional results only for the selected result type.
  Evidence: `loads more global search results only for the selected record
  type` in `frontend/scripts/nav-shell.acceptance.test.mjs` expands Notes while
  Logs remain unchanged, then expands Logs without replacing the Notes results.
- [x] A literal match is preferred over a fuzzy near-match. Evidence:
  `SearchIntegrationTest.literalMatchesAnywhereKeepNearMissesOut` confirms a
  literal match excludes the misspelled candidate and does not switch into
  fuzzy mode.
- [x] A near-match suggestion is available when there is no literal result and
  suggestions are supported. Evidence: `SearchIntegrationTest.nearMissSpellingsMatchLongerTermsWhenNothingMatchesLiterally`
  verifies the fallback, and `GlobalSearch.test.ts` / `explains near-miss and
  incomplete results` verifies the user-facing near-match notice.
- [x] A no-result query displays a clear empty state. Evidence:
  `GlobalSearch.test.ts` / `says when nothing matches` checks the message and
  the empty combobox selection state.
- [x] Closing search returns focus to the control that opened it. Evidence:
  `GlobalSearch.test.ts` / `closes with Escape and returns focus to where it was`
  verifies focus moves into the dialog and returns to its trigger on close.
- [ ] Global search remains usable with touch and the mobile keyboard at phone
  width.

### Flow: Open and dismiss a dialog

- [x] Opening a dialog places focus within the dialog. Evidence:
  `opens a new-board dialog from the Boards dialog and returns there on Escape`
  in `frontend/scripts/board.acceptance.test.mjs` asserts focus enters the
  New board dialog.
- [x] Closing a dialog returns focus to the control that opened it. Evidence:
  the same browser test verifies Escape returns focus to Add board in the
  Boards dialog.
- [x] Escape closes dialogs where Escape is an advertised dismissal action.
  Evidence: the same browser test sends Escape and verifies New board closes
  and the Boards dialog is restored.
- [x] Clicking a dialog backdrop closes only dialogs that support backdrop
  dismissal. Evidence: `closes backdrop-dismissible dialogs but keeps
  destructive confirmations open` in `frontend/scripts/board.acceptance.test.mjs`
  closes the Boards manager on a backdrop click, keeps Archive card open on a
  backdrop click, then cancels without archiving the card.

### Flow: Receive operation feedback

- [x] Success and error notices are announced politely to assistive technology.
  Evidence: `AppSnackbar.test.ts` / `shows a notice politely and dismisses it`
  checks both the default error notice and the success/info notice in the
  snackbar status region.
- [x] Destructive actions require confirmation or provide a visible recovery
  action. Evidence: `confirms board archival before sending the destructive
  request` in `frontend/scripts/board.acceptance.test.mjs` verifies that the
  alert dialog appears before the archive request, Cancel sends no request, and
  confirmation archives the board.

## Sessions and timer

### Flow: Load the Sessions list

- [x] The Sessions page distinguishes initial loading, no-session, loaded, and
  request-error states. Evidence: `SessionsView.test.ts` / `shows a loading
  state instead of the empty state until session history resolves`, `lists
  sessions by latest completion time with path and label context`, and `shows
  an error when the initial session load fails`; the browser test
  `opens the Sessions workspace directly with its empty state and inline
  tracker` covers the no-session state.
- [x] The no-session state offers a clear next action. Evidence: `opens the
  Sessions workspace directly with its empty state and inline tracker` in
  `frontend/scripts/nav-shell.acceptance.test.mjs` verifies the Start timer
  button is available alongside the empty-state message.
- [x] Session rows show their date/time, path, description, and available
  labels. Evidence: `SessionsView.test.ts` / `lists sessions by latest
  completion time with path and label context` checks the rendered timestamp,
  description, Path, and label; the fixture contains an available session
  label.
- [x] Session history pagination exposes the current page and available
  previous/next actions. Evidence: `SessionsView.test.ts` / `loads the selected
  pagination page` verifies page 1 is marked current, page 2 is available, and
  the current-page marker follows the selected page after loading it.
- [x] Loading another page preserves stable chronological order without
  repeating rows. Evidence: `SessionsView.test.ts` / `loads the selected
  pagination page` checks ordered descriptions across both pages and verifies
  the combined page results contain no repeated row.

### Flow: Start a session from the tracker

- [x] Selecting a path and description then starting creates a running
  session for those values. Evidence: `FloatingTimeTracker.test.ts` / `starts a
  running session with the selected Path and description` asserts the start
  request includes the selected Path and description and transitions to Stop.
- [x] The running timer visibly advances while active. Evidence:
  `FloatingTimeTracker.test.ts` / `visibly advances the running timer once per
  second` verifies the visible timer value increments after two seconds.
- [x] The timer remains running after route navigation and page refresh.
  Evidence: `keeps a running timer active after route navigation and browser
  reload` in `frontend/scripts/nav-shell.acceptance.test.mjs` starts a timer on
  Sessions, navigates to Board, reloads, and verifies the Stop action remains.
- [x] Starting a second timer resolves to the account's already-running timer.
  Evidence: `FloatingTimeTracker.test.ts` / `resolves a start conflict to the
  account's already-running timer` verifies the start conflict fetches the
  authoritative current timer and activates its Path and description.
- [x] Stopping a timer under the accidental-start threshold does not leave a
  completed session. Evidence: `KnowIntegrationTest.stoppingAnAccidentalTimerDoesNotSaveACompletedSession`
  stops a zero-duration timer and verifies history and current timer are empty.

### Flow: Pause a running session

- [x] Pausing a running session stops the elapsed clock and identifies the
  session as paused. Evidence: `FloatingTimeTracker.test.ts` / `shows pause
  while running and resume while paused` advances fake time five seconds after
  pausing and verifies the displayed elapsed value remains frozen.

### Flow: Resume a paused session

- [x] Resuming a paused session continues from its accumulated time and keeps
  its description, path, and labels. Evidence: `FloatingTimeTracker.test.ts` /
  `resumes a paused session with Cmd+Enter` verifies carried seconds and the
  resumed session's description, Path, and labels.
- [ ] Paused state remains understandable after navigating away and returning.

### Flow: Finish a running session

- [ ] Finishing a running session records a completed interval and removes the
  running state.

### Flow: Cancel a running session

- [ ] Cancelling/discarding a running session follows the confirmation and
  recovery behavior shown by the application.
- [ ] A failed stop or cancel keeps the user informed and reconciles the
  displayed state with the next authoritative server update.
- [x] A failed Stop request reports the error and keeps the active Stop action
  available; retrying successfully clears the timer. Evidence: `cd frontend &&
  npx vitest run src/components/FloatingTimeTracker.test.ts -t 'failed stop and
  clears it after retry succeeds'` (component API mock).

### Flow: Open one session

- [ ] Opening a session row displays its record-specific URL and editor.

### Flow: Edit one session

- [ ] Editing the description changes only the selected session.
- [ ] Editing the path changes only the selected session's path.
- [ ] Editing the start time and end time updates the selected session's
  displayed interval and duration.
- [ ] Submitting an incomplete or reversed interval identifies the invalid
  field and preserves the prior saved values.
- [ ] Assigning or removing a TIME_ENTRY label updates the selected session's
  label chips after save.
- [ ] Closing the session detail returns to the list and clears its selected
  record URL state.

### Flow: Start a new session from a completed session

- [ ] Starting again from a completed session creates a new running session
  with the supported copied context.

### Flow: Delete one completed session

- [ ] Deleting a completed session requires confirmation.
- [ ] Cancelling deletion leaves the session unchanged.
- [ ] Confirming deletion removes only the selected session from history.

### Flow: Reconcile live timer updates

- [ ] A timer change made in another open app view becomes visible in the
  current view.
- [ ] Temporary live-channel loss falls back to the supported refresh/polling
  behavior without creating a duplicate timer.
- [ ] Reconnection refreshes the displayed timer state from the server.

## Paths

### Flow: Load the Paths list

- [x] The Paths page distinguishes loading, empty, loaded, and failed states.
  Evidence: `frontend/src/views/PathsView.test.ts`, `announces path loading
  and then shows the valid empty state` checks `aria-busy`, a polite loading
  status, and transition to empty; `shows an empty paths state with a path
  creation action` verifies valid empty data; `shows tracked time and recent
  activity for a path` verifies loaded data; `reports initial load, path
  creation, and history failures` verifies a distinct load error (mocked API).
- [x] The empty state offers a clear path-creation action. Evidence: `cd
  frontend && npx vitest run src/views/PathsView.test.ts -t 'shows an empty
  paths state with a path creation action'` checks the empty-list message and
  that Add path opens the creation dialog (mocked API).

### Flow: Create one path

- [x] Creating a path with a valid name adds it to the active list and remains
  visible after component remount and desktop browser reload from the API
  fixture. Evidence: `cd frontend && npx vitest run src/views/PathsView.test.ts
  -t 'creates a path, shows it in the list'`; `cd frontend && node --test
  --test-name-pattern='creates a Path in the browser' scripts/nav-
  shell.acceptance.test.mjs` (mocked API; no real database persistence claim).
- [x] Submitting an empty or whitespace-only name identifies the validation
  issue without creating a path. Evidence: `frontend/src/views/PathsView.test.ts`,
  `rejects a whitespace-only path name without creating a path` checks inline
  feedback and asserts no POST request.
- [x] A failed create preserves entered values and offers a retry. Evidence:
  `frontend/src/views/PathsView.test.ts`, `preserves a failed path create and
  lets the user retry` checks the retained draft, visible error, and successful
  second create request.

### Flow: Edit one path

- [x] Editing a path name and description updates only that path. Evidence:
  `frontend/src/views/PathsView.test.ts`, `edits path name description and
  color inline` checks the exact Path PUT URL/body; `preserves a failed path
  edit and lets the user retry` verifies that the edit remains recoverable.
- [x] Editing a path color exposes an accessible color name and visible
  selection state. Evidence: `frontend/src/components/ColorPalette.test.ts`,
  `announces the currently selected color through pressed state` verifies the
  named option and selected `aria-pressed` state; `frontend/src/views/PathsView.test.ts`,
  `submits a selected path color from the shared palette` verifies path color
  selection and persistence request; `scripts/nav-shell.acceptance.test.mjs`,
  `changes and persists an existing Path color using only the keyboard`
  verifies keyboard activation and the resulting color after reload.
- [x] Pinning or unpinning a path updates its visible pinned state. Evidence:
  `cd frontend && npx vitest run src/views/PathsView.test.ts -t 'visible pin
  state'` checks both state transitions, the accessible action name, and
  `aria-pressed` (mocked API).
- [x] Reordering paths updates the visible order after reload. Evidence: `cd
  frontend && npx vitest run src/views/PathsView.test.ts -t 'reordered path
  list'` simulates drag and drop, asserts the ordered Path IDs sent to the API,
  and verifies the order after a fresh component load (mocked API).
- [x] Hiding a path's board asks for confirmation before removing its board
  tab. Evidence: `cd frontend && npx vitest run src/views/PathsView.test.ts -t
  'board switch off|hide confirmation button|hide confirmation keeps'` checks
  confirmation copy, explicit Hide board action, cancellation, and that no
  visibility request occurs before confirmation (mocked API).
- [x] Showing a hidden path board restores its tab. Evidence: `cd frontend &&
  node --test --test-name-pattern='restores a hidden Path board tab'
  scripts/nav-shell.acceptance.test.mjs` switches a seeded hidden board on in
  Paths, navigates to Boards, and verifies the Writing tab is present (mocked
  API browser test).

### Flow: Open a path history

- [x] Opening History shows activity belonging to the selected path. Evidence:
  `cd frontend && npx vitest run src/views/PathsView.test.ts -t 'selected path
  sessions grouped'` opens Writing history and asserts that its sessions are
  shown while Algorithms activity is absent (mocked API).
- [x] Path history groups activity chronologically with date headings.
  Evidence: the same test verifies the August 2020 then July 2020 headings.
- [x] Session rows show their timestamps and labels. Evidence: the same test
  verifies each session's `time[datetime]` and the Draft label chip.
- [ ] Opening an activity record navigates to that record's supported detail.
- [x] An empty path history has an explicit empty state. Evidence: `cd
  frontend && npx vitest run src/views/PathsView.test.ts -t 'empty state for a
  path history'` checks the empty message and absence of activity rows (mocked
  API).
- [ ] A failed history load presents a recoverable error.

### Flow: Merge one path into another

- [ ] The merge target picker only offers eligible owned destination paths.
- [ ] Selecting the source itself is unavailable as a merge target.
- [ ] Confirming the merge removes the source from the active path list.
- [ ] The source path's sessions remain accessible under the destination.
- [ ] Path-board cards retain their data and move to matching destination
  statuses where supported.
- [ ] Cancelling the merge leaves both paths unchanged.
- [ ] A failed merge leaves the visible source and destination recoverable.

### Flow: Remove one path

- [x] Removing a path requires confirmation and explains the visible impact.
  Evidence: `frontend/src/views/PathsView.test.ts`, `confirms removal and
  offers a timed undo` asserts the confirmation copy and DELETE request;
  `does not remove a path when the confirmation is cancelled` verifies cancel.

### Flow: Restore one path

- [x] The removed path can be restored using the offered recovery action.
  Evidence: `frontend/src/views/PathsView.test.ts`, `restores a removed path
  to the active list after undo` checks the visible Path returns after restore.
- [ ] Restoring the path makes its history and associated board available
  again.

## Timeline and Logs

### Flow: Filter the activity timeline

- [ ] Choosing an activity type limits results to that type.
- [ ] Choosing a path limits results to activity associated with that path.
- [ ] Choosing a valid date interval limits results to its intended inclusive
  dates.
- [ ] Submitting a reversed date interval shows validation and does not display
  a misleading result set.
- [ ] Clearing timeline filters returns the default timeline state.
- [ ] A filter with no matches displays an explicit empty state.
- [ ] A stale response from an earlier filter does not replace newer results.

### Flow: Save a timeline activity note

- [ ] Saving a note on one activity updates only that activity.
- [ ] Cancelling an activity note edit discards the unsaved draft.
- [ ] A failed note save preserves the draft and provides a retry action.

### Flow: Create a log

- [x] Submitting log text with a valid timestamp creates one log. Evidence:
  `cd frontend && npx vitest run src/views/LogsView.test.ts -t 'saves the
  browser timestamp and adds a new log'` (component test; mocked API).
- [x] The new log appears in the chronological group for its timestamp and
  remains after remount when fetched from the API fixture (same test).
- [x] Submitting blank or whitespace log text shows validation and creates no
  log. Evidence: `cd frontend && npx vitest run src/views/LogsView.test.ts -t
  'shows validation and does not create a log'` (component test; mocked API).
- [x] A failed create preserves the entered text and timestamp for retry.
  Evidence: `cd frontend && npx vitest run src/views/LogsView.test.ts -t
  'preserves log text and timestamp after a failed create'` (component test;
  mocked API).
- [ ] The timestamp reset action uses the current browser time as labeled.

### Flow: Edit one log

- [ ] Editing a log's text updates only that log.
- [ ] Editing a log's timestamp moves it to the matching chronological group.
- [ ] Assigning or removing a LOG label updates the saved label chips.
- [ ] A failed update preserves the user's draft and indicates recovery.

### Flow: Search the log list

- [ ] Opening Log search exposes its input and documented keyboard shortcut.
- [ ] A matching query filters the visible log records.
- [ ] Clearing the query restores the unfiltered records.
- [ ] A no-match query displays a clear empty result.
- [ ] Query state is restored through URL or browser history where supported.

### Flow: Page through log history

- [ ] Loading another page adds older/newer logs in stable chronological order.
- [ ] A failed page request offers retry without duplicating current rows.
- [ ] Date-group headings remain attached to the correct log rows at page
  boundaries.

### Flow: Open one log

- [ ] Opening a log detail URL selects the intended log over the list.
- [ ] Closing a log detail returns to the previous list context.

### Flow: Delete one log

- [ ] Deleting a log requires confirmation or offers a visible undo action.
- [x] Cancelling deletion leaves the log unchanged and sends no DELETE request.
  Evidence: `cd frontend && npx vitest run src/views/LogsView.test.ts -t
  'leaves a log unchanged when deletion is cancelled'` (component test;
  mocked API).
- [ ] Confirming deletion removes only the selected log.
- [x] A failed delete keeps the log visible and permits a successful retry.
  Evidence: `cd frontend && npx vitest run src/views/LogsView.test.ts -t
  'keeps a log after delete fails'` (component test; mocked API).

## Reports

### Flow: Open the default report range

- [x] Opening `/reports` directly displays the documented default date range.
  Evidence: `frontend/src/views/ReportsView.test.ts`, `shows the report
  dashboard with project breakdown and charts` verifies the default week in
  the first report request at `/reports`.

### Flow: Choose a report range

- [x] Choosing a custom date range includes both selected endpoints. Evidence:
  `frontend/src/views/ReportsView.test.ts`, `keeps the selected aggregation
  when the date interval changes` asserts both ISO endpoints in the report
  request.
- [x] Moving to the previous/next range moves the complete selected interval
  and preserves aggregation. Evidence: `frontend/src/views/ReportsView.test.ts`,
  `shifts the selected interval in both directions without changing
  aggregation` asserts both endpoints in both directions.
- [x] Changing aggregation preserves the selected date interval. Evidence:
  `frontend/src/views/ReportsView.test.ts`, `keeps the selected aggregation
  when the date interval changes` checks both dates with `MONTH` selected.
- [x] Report range and supported filters are represented by the URL. Evidence:
  `frontend/src/views/ReportsView.test.ts` covers path/label filters, trendline,
  Sankey visibility, range changes, and aggregation in query parameters;
  supplemental browser test `scripts/nav-shell.acceptance.test.mjs`,
  `switches report aggregation by keyboard and preserves Path and Label filters`
  checks keyboard activation and filter query retention.
- [x] Browser Back and Forward restore the report interval and aggregation
  after navigating to another route. Evidence: `cd frontend && node --test
  --test-name-pattern='restores report filters after navigation'
  scripts/nav-shell.acceptance.test.mjs` (desktop Chromium; mocked API); this
  browser check also verifies Path and Label filter query values.
- [x] Reloading a report URL restores its date range and aggregation.
  Evidence: `cd frontend && node --test --test-name-pattern='loads report
  filters from a direct query URL' scripts/nav-shell.acceptance.test.mjs`
  (desktop Chromium; mocked API); the same browser check verifies Path and
  Label filter query values.
- [x] Malformed report dates and unsupported aggregation values fall back to
  the current week and Daily aggregation. Evidence:
  `frontend/src/views/ReportsView.test.ts`, `falls back to the default range
  when the URL contains malformed report filters`; `scripts/nav-shell.acceptance.test.mjs`,
  `normalizes malformed report query values on direct browser load` checks the
  normalized URL and selected aggregation in desktop Chromium.

### Flow: Filter report totals by path

- [x] Selecting a path limits totals, breakdowns, and daily values to that
  path's tracked time. Evidence: `frontend/src/views/ReportsView.test.ts`,
  `filters the report by path and restores all path totals when cleared`
  verifies the selected path query and the path-specific report response.
- [x] Clearing the path filter restores all path totals for the same interval.
  Evidence: the same component test verifies the path query is removed, the
  interval is unchanged, and the unfiltered cached report returns.

### Flow: Filter report totals by label

- [x] Selecting a TIME_ENTRY label limits totals and breakdowns to sessions
  carrying that label. Evidence: `frontend/src/views/ReportsView.test.ts`,
  `filters report totals by time-entry label and restores them when cleared`
  verifies the label query and filtered aggregate response.
- [x] Clearing the label filter restores the unfiltered report values.
  Evidence: the same component test verifies the label query is removed and
  the unfiltered categories and totals return.

### Flow: Read report summaries and charts

- [x] The summary total agrees with the visible category totals. Evidence:
  `frontend/src/views/ReportsView.test.ts`, `keeps summary totals equal to
  the active breakdown when switching categories` compares seconds and the
  displayed summary duration.
- [x] Switching between Path and Labels breakdown changes the displayed
  categories without changing the selected interval. Evidence: the same test
  checks category props and the URL interval before and after switching.
- [x] Changing trendline mode updates or removes the trendline as selected.
  Evidence: `frontend/src/views/ReportsView.test.ts`, `cycles the trendline
  mode and persists it in the report URL` checks chart props and URL state.
- [x] Empty report data produces zero totals and a clear empty state.
  Evidence: `frontend/src/views/ReportsView.test.ts`, `shows zero totals and
  an explicit empty state for a valid empty report` checks `00:00:00`, the
  no-tracked-time message, and absence of an error alert.
- [x] Loading and request-error states remain distinct from a valid empty
  report. Evidence: the same test checks the valid empty state;
  `shows loading feedback while a report request is pending` and
  `shows an error when the report request fails` assert separate status and
  alert states.
- [x] Chart values are available in an accessible textual or tabular form.
  Evidence: `frontend/src/views/ReportsView.test.ts`, `aggregates chart values
  at the selected semantic interval` checks the chart's accessible label and
  its displayed period values.
- [ ] Clicking a linked report record opens its corresponding record route.

### Flow: Use report controls in mobile Chrome

- [ ] The custom range selector opens and remains operable with touch input.
- [ ] Report dates and totals are readable without clipping at phone width.
- [ ] Chart and filter controls remain reachable without unintended page
  horizontal overflow.
  Supplemental evidence only: `scripts/nav-shell.acceptance.test.mjs`,
  `keeps report date and total controls reachable on a phone viewport` checks
  Today/Yesterday presets and the exact previous-day range by touch at 390px in
  desktop Chromium. It does not satisfy the real mobile Chrome acceptance
  setup above.

## Calendar

### Flow: Navigate calendar months

- [x] Previous and next month actions show the adjacent month. Evidence:
  `frontend/src/views/CalendarView.test.ts`, `supports month navigation and
  cancelling a range selection` verifies both month and year values before
  and after the adjacent-month round trip.
- [x] Month and year selectors open and select the requested month/year.
  Evidence: `frontend/src/views/CalendarView.test.ts`, `changes the calendar
  month and year from their selectors` checks the selected month, year, and
  first-day selection.
- [x] The Today action returns to the current date while retaining the expected
  visible grid. Evidence: `CalendarView.test.ts`, `returns to today and selects
  today's calendar date` and `announces when the Calendar Today action selects
  the current date`; `nav-shell.acceptance.test.mjs`, `returns the Calendar to
  today with a touch-sized navigation control` verifies the phone-width date,
  URL, 44px target, single-row navigation, and visible calendar days.
- [x] Weekday headings and dates remain aligned when the month starts or ends
  midweek. Evidence: `frontend/src/views/DeepLinks.test.ts`, `aligns dates
  with Monday-first weekdays when the month starts and ends midweek` checks
  the calendar's leading and trailing week rows.
- [x] Leap day and month/year boundaries display on the correct calendar day.
  Evidence: `frontend/src/views/DeepLinks.test.ts`, `follows a new date while
  open, and ignores impossible dates` checks February 29; `moves from December
  into January across the year boundary` checks January 1, 2026.

### Flow: Open a calendar date from its URL

- [x] A valid `?date=YYYY-MM-DD` URL selects and displays that date. Evidence:
  `frontend/src/views/DeepLinks.test.ts`, `opens the month of the linked day
  with its saved note and label selected`; `scripts/nav-shell.acceptance.test.mjs`,
  `loads a Calendar date deep link and retains it after browser reload` checks
  selected month/day and the page title before and after reload.
- [x] An invalid date query does not select an impossible calendar date.
  Evidence: `frontend/src/views/DeepLinks.test.ts`, `follows a new date while
  open, and ignores impossible dates` checks leap day and rejects February 30;
  `scripts/nav-shell.acceptance.test.mjs`, `clears an impossible Calendar date
  query and falls back to today` checks query cleanup and today's selected day.

### Flow: Edit one calendar day

- [x] Selecting a day loads its saved note and label assignments. Evidence:
  `frontend/src/views/DeepLinks.test.ts`, `opens the month of the linked day
  with its saved note and label selected` checks note, label, and portion.
- [x] Saving a note updates only the selected day. Evidence:
  `frontend/src/views/CalendarView.test.ts`, `loads labels and a month range,
  then saves a selected day with a full-day label` checks the exact date URL
  and note payload; `scripts/nav-shell.acceptance.test.mjs`, `reloads a saved
  Calendar note from its selected day record` verifies mocked-API save/reload
  persistence in desktop Chromium.
- [x] Saving label assignments updates only the selected day. Evidence: the
  same test checks the exact date URL and label portion in the save payload.
  `scripts/nav-shell.acceptance.test.mjs`, `reloads a saved Calendar label
  assignment on its selected day` additionally verifies mocked-API readback
  after reload; `CalendarView.test.ts`, `saves the selected Sick leave portion
  exactly` covers each offered value from 0 through 1.
- [x] An existing label hidden from the Calendar list can still be found in
  the assignment picker. Evidence: `frontend/src/views/CalendarView.test.ts`,
  `CP-05: picks labels hidden from Calendar as chips without changing them`.
- [x] Creating a label from the picker creates and assigns the intended label.
  Evidence: `frontend/src/views/CalendarView.test.ts`, `CP-06: keeps Calendar
  labels in the list and the dropdown in sync`; supplemental browser test
  `scripts/nav-shell.acceptance.test.mjs`, `creates a Calendar label with
  default scopes and reloads its assignment` checks the default color/scopes
  and assignment after reload with mocked API data.
- [x] Removing an assignment does not delete the label itself. Evidence:
  `frontend/src/views/CalendarView.test.ts`, `CP-07: removes a picked label
  from its chip` verifies the saved day has no labels and no DELETE is sent.
- [x] “No marker” removes the assigned label's report marker contribution
  while leaving the assignment visible. Evidence:
  `frontend/src/views/CalendarView.test.ts`, `defaults to Marker and saves No
  marker with a zero portion` verifies portion `0` and the checked assignment.
- [x] A failed save keeps the draft and identifies the save failure. Evidence:
  `frontend/src/views/CalendarView.test.ts`, `shows actionable errors when
  calendar mutations fail` checks the error and retained note text.

### Flow: Apply a calendar range edit

- [x] Selecting a range displays its inclusive start and end dates. Evidence:
  `frontend/src/views/CalendarView.test.ts`, `drag-selects two calendar days
  and applies a label across the inclusive range` checks the exact range title
  and submitted endpoints.
- [x] Applying a range edit updates each day from the start through the end.
  Evidence: `CalendarServiceTest.applyRangeVisitsBothEndpointsAndEveryDayBetweenThem`
  verifies all dates are visited, including both endpoints; the view test
  verifies the selected endpoints reach the range API.
- [x] Cancelling or restarting range selection does not apply a partial range.
  Evidence: `frontend/src/views/CalendarView.test.ts`, `supports month
  navigation and cancelling a range selection` verifies no range write after
  cancellation or starting another incomplete selection.
- [x] A failed range save leaves the user able to review and retry the range.
  Evidence: `frontend/src/views/CalendarView.test.ts`, `keeps a failed range
  available for review and a successful retry`.

### Flow: Use the calendar in mobile Chrome

- [ ] Each date cell can be selected by touch with a clear selected-day state.
- [x] Range selection has a tap or keyboard alternative to pointer dragging.
  Evidence: `scripts/nav-shell.acceptance.test.mjs`, `selects a calendar
  range with touch taps and keyboard input` checks a full keyboard path in
  desktop Chromium and a phone-sized touch-emulated path.
- [ ] The selected-day editor, label picker, and Save day action remain
  reachable with the on-screen keyboard open.
- [ ] The calendar grid and editor do not cause unintended page overflow.
  Supplemental evidence only: the same browser test checks selected-day state
  after touch taps at 390px in desktop Chromium; `selects a calendar day with
  touch and updates its details panel` additionally checks single-day selection
  and a 44px date cell. Desktop Chromium's `selects a calendar day with the
  keyboard and retains focus` checks keyboard activation and focus retention.
  Real mobile Chrome remains unverified.

## Imports and Settings

### Flow: Import Knowledge Base data

- [ ] The Knowledge Base import view accepts the supported input method.
- [ ] Invalid or unsupported import data produces a readable validation
  result without partial visible records.
- [ ] A valid import reports created, skipped, and failed record counts.
- [ ] Re-importing the same external identities does not visibly duplicate
  records.
- [ ] Import history identifies completed batches and their outcomes.
- [ ] Import history pagination preserves stable batch ordering.
- [ ] Undoing one import batch affects only records from that batch.
- [ ] A failed import or undo reports failure and leaves a recoverable view.

### Flow: Import Clockify data

- [ ] The Clockify import view accepts its supported file or pasted data.
- [ ] Invalid Clockify data identifies the problem without creating records.
- [ ] A valid import shows its outcome and created session records.
- [ ] Importing the same Clockify identities again does not visibly duplicate
  sessions.

### Flow: Export Knowledge Base data

- [ ] The export action downloads the selected supported format.
- [ ] The export includes the signed-in user's supported records and
  relationships.
- [ ] Text containing commas, quotes, Unicode, and line breaks remains
  readable in the exported file.
- [ ] An export failure is reported without presenting a partial file as
  complete.

### Flow: Navigate Settings sections

- [ ] Each Settings tab opens the matching settings section.

### Flow: Save appearance preferences

- [ ] Changing a supported preference and saving updates its visible state.
- [ ] A saved preference remains selected after route change and reload.

### Flow: Update account credentials

- [ ] Invalid current/new password combinations show an actionable field or
  form error.
- [ ] A successful credentials update provides visible confirmation.
- [ ] A failed credentials update preserves the entered values and allows
  recovery.

## Labels and label history

### Flow: Search labels

- [ ] Opening Labels search focuses the query input using the documented
  shortcut.
- [ ] Searching filters labels by name.
- [ ] The `q` query state survives reload and browser history where supported.
- [ ] Clearing the search restores the full applicable label list.
- [ ] A no-match query displays a clear empty result.

### Flow: Clear label search

- [ ] Clearing the search restores the full applicable label list.

### Flow: Create a label

- [ ] Creating a label with a valid name adds one label to the list.
- [ ] Blank or whitespace-only names are rejected with visible feedback.
- [ ] Duplicate names are handled with a clear validation or existing-label
  result.
- [ ] Selecting label color exposes an accessible name and selected state.
- [ ] Selecting label scopes updates the visible scope summary.

### Flow: Edit one label

- [ ] Editing a label name updates the selected label wherever it is shown.
- [ ] Editing scopes updates where the label is offered for new assignments.

### Flow: Remove one label

- [ ] Removing a label requires confirmation or provides a visible undo path.
- [ ] Cancelling removal leaves the label and its visible relationships intact.
- [ ] A failed label save/removal preserves a recoverable state.

### Flow: Open label history

- [ ] Opening a label's history shows usage summary and supported related
  records.
- [ ] History can navigate to a related label and return to the prior label.
- [ ] Related session, calendar, note, and log records open their own routes.
- [ ] Empty history is identified clearly.
- [ ] A failed history request offers retry.
- [ ] A removed or inaccessible related record does not break the history
  dialog.
- [ ] Loading another history page appends unique related records in stable
  order.
- [ ] A failed history page request can be retried without duplicating rows.

## Boards, cards, and archive

### Flow: Select one board

- [ ] Selecting a board tab displays that board's columns and cards.
- [ ] Selecting All boards displays the available boards together and identifies
  each card's owning board.

### Flow: Open the board manager

- [ ] Opening Manage boards lists the available boards.

### Flow: Pin one board

- [ ] Pinning a board updates its visible pinned state after reload.

### Flow: Reorder boards

- [ ] Reordering boards updates their visible tab order after reload.

### Flow: Create one board

- [ ] Creating a board adds a selectable board tab with its chosen title.

### Flow: Rename one board

- [ ] Renaming a board updates the selected board tab and title.

### Flow: Archive one board

- [ ] Archiving a board requires confirmation and removes it from active tabs.
- [ ] A missing selected board falls back to a valid board and explains the
  unavailable selection where appropriate.

### Flow: Manage one board's statuses

- [ ] Creating a status adds one column to the selected board.
- [ ] Renaming a status updates its column heading.
- [ ] Reordering statuses updates their displayed order after reload.
- [ ] Archiving a status handles its cards and disallowed last-active-status
  case with visible feedback.
- [ ] Restoring an archived status returns it to the board.
- [ ] A failed status update leaves the board in a recoverable state.

### Flow: Create one board card

- [ ] Creating a card in a selected column places it in that column.

### Flow: Open one board card

- [ ] Opening a card displays the card-specific URL and editor.

### Flow: Edit one board card

- [ ] Saving title and body updates the selected card.
- [ ] Saving path, priority, status, and date fields updates the selected
  card's displayed metadata.
- [ ] Adding/removing BOARD labels updates the selected card's label chips.
- [ ] Closing the editor clears its selected card from the URL.
- [ ] A failed card save preserves the draft and identifies the recovery
  action.
- [ ] A stale card edit reports a conflict without silently replacing the
  current saved version.

### Flow: Move one card between statuses

- [ ] Moving a card to another status places it once in the destination.

### Flow: Reorder cards in an unsorted column

- [ ] Reordering cards in an unsorted column persists the final order after
  reload.

### Flow: Sort cards by priority

- [ ] Priority sorting shows cards in the selected priority order.
- [ ] Sorted columns do not expose a misleading manual order result.
- [ ] A failed reorder restores the prior order or offers a clear retry.
- [ ] Keyboard/tap controls provide an alternative for supported drag actions.

### Flow: Page through board cards

- [ ] Loading more cards appends the next page without repeating prior cards.
- [ ] Page order remains stable when card priorities are tied.
- [ ] A page request failure exposes a retry action.
- [ ] Retrying a failed page does not duplicate cards.

### Flow: Use the Gantt view

- [ ] Switching to Gantt shows the selected board's active cards.
- [ ] Changing the visible date range updates the timeline window.
- [ ] Undated cards remain discoverable in the card name gutter.
- [ ] Cards outside the visible interval remain discoverable in the gutter.
- [ ] A card's inclusive start/end dates occupy the intended timeline days.
- [ ] Dragging a card bar changes its dates by whole days and shows save
  feedback.
- [ ] Resizing either edge changes the matching endpoint date.
- [ ] Cancelling a drag leaves the saved date range unchanged.
- [ ] Offscreen date arrows move the visible window to include that card.
- [ ] Hiding and restoring the card list preserves the user's selected view.
- [ ] Gantt controls remain visible and operable at phone width where Gantt is
  offered.

### Flow: Start a timer from a card

- [ ] A card with an eligible path exposes its start-timer action when no timer
  is running.
- [ ] Starting from the card creates a timer for that path with the card title
  as its description.
- [ ] A running timer hides or disables duplicate card start actions without
  shifting card layout unexpectedly.

### Flow: Archive one card

- [ ] Archiving a card removes it from the active board and places it in the
  archive.
- [ ] The archive deep link selects the requested board/card context.

### Flow: Restore one card

- [ ] Restoring a card returns it to an active board and valid status.
- [ ] A card whose former status is archived is restored to a valid active
  status with visible feedback.
- [ ] Returning from archive restores the relevant board context.

### Flow: Use Kanban on mobile Chrome

- [ ] Board tabs and board-management actions are reachable at phone width.
- [ ] Cards can be opened and edited using touch.
- [ ] Card controls remain tappable without overlapping or clipping.
- [ ] Touch drag actions have a tap or keyboard alternative where supported.
- [ ] The selected column/card remains visible during editor interaction.

## Notes

### Flow: Search notes

- [ ] Searching notes by text shows matching notes.
- [ ] The `q` query state is restored after reload and browser Back/Forward.
- [ ] A no-match result is distinct from a failed notes request.

### Flow: Filter archived notes

- [ ] Enabling the archived filter shows archived notes only.
- [ ] Clearing filters restores the active note list.
- [ ] Changing page size updates the number of visible note rows.
- [ ] Moving between note pages preserves stable order without duplicates.

### Flow: Create one note

- [x] Creating a note opens its editor, sets its record-specific URL, and
  adds it to the list after remount from the API fixture. Evidence: `cd
  frontend && npx vitest run src/views/NotesView.test.ts -t 'creates a note
  from the icon action'` (component test; mocked API).

### Flow: Open one note

- [ ] Opening a note row sets the note-specific URL.
- [x] Directly loading a valid `/notes/:id` URL opens that note in the
  component route test and a desktop Chromium browser test. Evidence:
  `cd frontend && npx vitest run src/views/DeepLinks.test.ts` — `loads the
  selected note when its editor URL is opened directly`; `cd frontend && node
  --test --test-name-pattern='loads a note editor when the browser opens its
  deep link directly' scripts/nav-shell.acceptance.test.mjs` (mocked API).
- [ ] Closing a note returns to its list context and clears its selected URL.
- [x] Opening a missing or inaccessible note shows a recoverable unavailable
  state in component and desktop Chromium tests. Evidence: `cd frontend && npx
  vitest run src/views/DeepLinks.test.ts` — `shows a recoverable error when a
  directly linked note is unavailable`; `cd frontend && node --test
  --test-name-pattern='missing note opened by browser deep link' scripts/nav-
  shell.acceptance.test.mjs` (mocked API).

### Flow: Edit note content

- [ ] Editing the note title saves to the selected note.
- [ ] Editing paragraphs and plain text saves without losing line breaks.
- [ ] Rich-text toolbar actions apply the selected formatting at the caret.
- [ ] Checklist/list/quote/code formatting remains intact after save and
  reopen.
- [ ] Pasting formatted content does not create unsafe or visibly corrupted
  content.
- [ ] Long content remains readable and editable without breaking the page
  layout.

### Flow: Inspect note line history

- [ ] Enabling Line history shows the last-edit time beside each saved body
  line.
- [ ] Lines added since the last completed save are identified as Unsaved.
- [ ] Moving the caret to another line updates the announced line number and
  edit time.
- [ ] Turning Line history off hides its gutter without changing note content.

### Flow: Assign labels to a note

- [ ] Searching and selecting a NOTE label assigns it to the current note.
- [ ] Removing an assigned label removes only that association.
- [ ] Creating a label from the picker assigns the intended new label.
- [ ] Saved assignments remain visible after closing and reopening the note.

### Flow: Archive one note

- [ ] Archiving a note removes it from the active list and exposes it in the
  archived list.

### Flow: Restore one note

- [ ] Restoring a note returns it to the active list with content intact.

### Flow: Delete one note

- [ ] Deleting a note requires confirmation or offers an explicit undo action.
- [ ] Cancelling deletion leaves the note unchanged.
- [ ] Confirming deletion removes only the selected note.

### Flow: Pin one note

- [ ] Pinning a note changes its visible pinned state.

### Flow: Reorder notes

- [ ] Reordering notes changes their visible order after reload.
- [ ] Keyboard/touch alternatives are available where drag reordering is
  supported.
- [ ] A failed reorder restores the saved order or provides a clear retry.

### Flow: Recover unsaved note changes

- [ ] Navigating away with unsaved edits warns before discarding them.
- [ ] Choosing to stay returns the user to the unsaved editor.
- [ ] Choosing to discard leaves the last saved version intact.
- [ ] A failed save preserves the draft and offers recovery.
- [ ] A conflicting newer version presents a recovery choice and does not
  silently overwrite the winning content.

Coverage note: component route tests now flush a pending autosave before
navigation and cancel navigation while showing the draft if that save fails.
The explicit warning/discard interaction above remains uncovered.

### Flow: Use the Notes editor in mobile Chrome

- [ ] The note list and editor can be reached with touch at phone width.
- [ ] Editing controls remain visible or reachable while the mobile keyboard
  is open.
- [ ] The editor scrolls as intended without trapping the page or hiding Save.
- [ ] Rich-text controls have touch targets suitable for repeated editing.
- [ ] Closing the keyboard preserves the caret and entered content.

## Cross-cutting behavior

### Flow: Recover from a failed page read

- [ ] A failed page load displays an error distinct from a valid empty state.
- [ ] A failed list-page request keeps previously loaded records available.

### Flow: Recover from a failed mutation

- [ ] A failed mutation preserves user-entered values where retry is possible.
- [ ] Retrying a failed mutation does not create duplicate records.
- [ ] A loading action communicates progress and prevents accidental duplicate
  submission.

### Flow: Protect user-owned records

- [ ] A user sees only their own records in every supported list and search.
- [ ] A direct link to another user's record does not reveal record contents.
- [ ] A selector does not offer another user's Path, label, board, or status.
- [ ] A failed cross-owner reference displays a safe error and leaves existing
  data unchanged.

### Flow: Operate the application with a keyboard

- [ ] Every navigation action is a semantic link and supports standard browser
  link behavior.
- [ ] Every state change can be triggered from a semantic button or form
  control.
- [ ] Focus remains visible and is not covered by fixed or sticky UI.
- [ ] Dialogs, menus, pickers, and forms have predictable focus entry and
  return behavior.
- [ ] Drag, date-range, and reorder actions have a keyboard alternative where
  those actions are not inherently pointer-only.

### Flow: Operate the application with mobile Chrome touch

- [ ] Primary touch targets are comfortably tappable at phone width.
- [ ] Mobile text controls use an input size that avoids unintended browser
  zoom where applicable.
- [ ] The page remains zoomable using browser controls.
- [ ] The on-screen keyboard does not permanently obscure the active control
  or its save/recovery action.
- [ ] Modals and drawers keep their content scroll contained and provide a
  reachable close action.
- [ ] Gestures have a tap or keyboard alternative unless the gesture is
  essential to the task.

### Flow: Display long and empty user content

- [ ] Very long titles, descriptions, note bodies, and log text do not overlap
  adjacent controls or create page-wide overflow.
- [ ] Empty strings and empty collections render intentional empty states.

### Flow: Honor reduced-motion preferences

- [ ] Reduced-motion preferences suppress or simplify nonessential movement.
- [ ] Status and selection are communicated with text, shape, or accessible
  labels as well as color.

## OTOTEST-03 inventory acceptance

- [ ] Every supported route in the [product test tree](product-test-tree.md)
  has an inventory row for direct load, page identity, and applicable query
  state.
- [ ] Every meaningful visible control on each supported route has its own
  action row; a page render does not count as coverage for its controls.
- [ ] Each action row names the control, starting state, input method, visible
  result, URL or persistence outcome when applicable, and relevant failure or
  recovery state.
- [ ] Keyboard and touch behavior are recorded separately where input method
  changes the interaction.
- [ ] Desktop Chrome and mobile Chrome have distinct evidence rows where
  viewport, pointer, browser history, text entry, or scrolling changes the
  behavior.
- [ ] Each row links exact evidence identifiers only when the assertion
  establishes that behavior; otherwise mark the row as a gap, manual check,
  unsupported behavior, or decision needed.
- [ ] Fixture/mock, API/service, real-browser, and manual evidence remain
  clearly distinguished.
- [ ] Dialog and menu action rows cover the applicable open, submit, cancel,
  validation, confirmation, focus, failed-request, and retry outcomes as
  separate responsibilities.
- [ ] `/development` is explicitly excluded from supported route completeness
  and absent from authenticated product navigation.
- [ ] Native iOS and Chrome extension flows are excluded from this milestone;
  extension coverage is tracked by OTOTEST-04.
- [ ] The checklist is reviewed against the current router, page templates,
  shared components, and product test tree before OTOTEST-03 is marked
  complete.

## Traceability record for milestone review

For each flow marked accepted, the OTOTEST-03 inventory should link the
relevant route/component, visible control name, supported input method,
expected visible result, URL or persistence outcome where applicable, negative
or recovery case, evidence layer, and exact evidence identifier. This
checklist records the product expectations only; it does not claim that
coverage has been implemented or executed.

