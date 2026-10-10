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
- [x] A missing or inaccessible record ID produces a clear not-found or
  unavailable state without exposing another user's record. Evidence:
  `nav-shell.acceptance.test.mjs` / `shows an unavailable state for a missing
  session opened by browser deep link` verifies the user-facing unavailable
  state; `CrossUserIsolationIntegrationTest.foreignAndMissingDirectIdsHaveTheSameNotFoundResponse`
  verifies foreign session IDs return the same 404 response as missing IDs.
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
  width. Supplemental automation: `nav-shell.acceptance.test.mjs` /
  `keeps global search usable with touch at phone width` verifies touch opening,
  search input hints, result visibility, and viewport bounds at 390px;
  `keeps global search results reachable across a keyboard-like phone viewport
  resize` checks result reachability and query retention after reducing and
  restoring viewport height. Real Android Chrome and its software keyboard
  still need verification.

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
- [x] A failed pause keeps the session running and allows a successful retry.
  Evidence: `FloatingTimeTracker.test.ts` / `keeps a running session after
  pause fails and pauses it after retry` checks the visible error, retained
  Pause session action, and paused state after the second request.

### Flow: Resume a paused session

- [x] Resuming a paused session continues from its accumulated time and keeps
  its description, path, and labels. Evidence: `FloatingTimeTracker.test.ts` /
  `resumes a paused session with Cmd+Enter` verifies carried seconds and the
  resumed session's description, Path, and labels.
- [x] Paused state remains understandable after navigating away and returning.
  Evidence: `nav-shell.acceptance.test.mjs` / `keeps a paused session
  understandable after route navigation and reload` verifies the Paused status
  and Resume session action on another route after reload.
- [x] A failed resume keeps the session paused and allows a successful retry.
  Evidence: `FloatingTimeTracker.test.ts` / `keeps a paused session after
  resume fails and resumes it after retry` checks the visible error, retained
  context, Resume session action, and successful retry with the same context.

### Flow: Finish a running session

- [x] A pending stop disables the action, shows its busy state, and cannot send
  a duplicate request. Evidence: `FloatingTimeTracker.test.ts` /
  `prevents duplicate stop requests while the first stop is pending` holds
  the stop response, submits twice, verifies one request and a disabled busy
  action, then confirms the tracker clears after success.
- [x] Finishing a running session records a completed interval and removes the
  running state. Evidence: `KnowIntegrationTest.stoppingARunningTimerSavesItsCompletedIntervalAndClearsCurrentState`
  uses a controlled 75-second interval and verifies it appears in history and
  is no longer current.
- [x] Finishing a paused session clears the tracker and its saved draft
  context. Evidence: `FloatingTimeTracker.test.ts` / `finishes a paused
  session and clears its draft context` verifies the finish request, cleared
  draft payload, and Start timer state.

### Flow: Cancel a running session

- [x] Cancelling/discarding a running session follows the confirmation and
  recovery behavior shown by the application. Evidence: `FloatingTimeTracker.test.ts`
  / `confirms before discarding a running session and preserves it when
  cancelled` verifies the confirmation, cancel path, server cancel request, and
  transition out of the running state.
- [x] A failed stop or cancel keeps the user informed and reconciles the
  displayed state with the next authoritative server update. Evidence:
  `FloatingTimeTracker.test.ts` / `keeps a running session after failed discard
  and preserves its draft context after retry` checks actionable error, retry,
  and retained Path, label, and description; `reconciles a
  failed discard when the server later reports no current timer` checks the
  next current-timer refresh updates the visible controls.
- [x] A failed Stop request reports the error and keeps the active Stop action
  available; retrying successfully clears the timer. Evidence: `cd frontend &&
  npx vitest run src/components/FloatingTimeTracker.test.ts -t 'failed stop and
  clears it after retry succeeds'` (component API mock).

### Flow: Open one session

- [x] Opening a session row displays its record-specific URL and editor.
  Evidence: `DeepLinks.test.ts` / `shows a session that isn't on the loaded
  page and closes back to the list` verifies the selected record and opens its
  edit form; `links each listed session's date to its own address` verifies
  the row's `/sessions/s1` URL.

### Flow: Edit one session

- [x] Editing the description changes only the selected session. Evidence:
  `DeepLinks.test.ts` / `edits the session, refusing an end before the start`
  verifies the single PUT targets `/time-entries/s1` and carries the edited
  description.
- [x] Editing the path changes only the selected session's path. Evidence:
  `SessionsView.test.ts` / `updates every editable session property` verifies
  the single update request targets the selected record with the chosen Path.
- [x] Editing the start time and end time updates the selected session's
  displayed interval and duration. Evidence: `DeepLinks.test.ts` / `edits the
  session, refusing an end before the start` saves the revised interval and
  verifies the dialog updates from 1h 30 minutes to 2h.
- [x] Submitting an incomplete or reversed interval identifies the invalid
  field and preserves the prior saved values. Evidence: `DeepLinks.test.ts` /
  `edits the session, refusing an end before the start` checks the range error,
  confirms no update request is sent, cancels editing, and verifies the saved
  description and 1h 30 minute duration remain unchanged.
- [x] Assigning or removing a TIME_ENTRY label updates the selected session's
  label chips after save. Evidence: `SessionsView.test.ts` / `updates the
  selected session label chips after saving additions and removals` removes
  and restores the label through the save and history reload.
- [x] Closing the session detail returns to the list and clears its selected
  record URL state. Evidence: `DeepLinks.test.ts` / `shows a session that isn't
  on the loaded page and closes back to the list` closes the dialog, verifies
  the route returns to `/`, and confirms the dialog is removed.

### Flow: Start a new session from a completed session

- [x] Starting again from a completed session creates a new running session
  with the supported copied context. Evidence: `SessionsView.test.ts` /
  `starts a new server timer from a completed session` verifies a new running
  timer is adopted and receives the selected session's Path, labels, and
  description.

### Flow: Delete one completed session

- [x] Deleting a completed session requires confirmation. Evidence:
  `SessionsView.test.ts` / `confirms and soft-deletes a completed session`
  checks the confirmation prompt before the DELETE request.
- [x] Cancelling deletion leaves the session unchanged. Evidence:
  `SessionsView.test.ts` / `does not remove a session when confirmation is
  cancelled` checks no DELETE request and retained history rows.
- [x] Confirming deletion removes only the selected session from history.
  Evidence: `SessionsView.test.ts` / `confirms and soft-deletes a completed
  session` removes the selected row and verifies the other row remains.
- [x] A failed deletion leaves the record available for a confirmed retry.
  Evidence: `SessionsView.test.ts` / `keeps a completed session after delete
  fails and removes it on retry` checks the visible error, retained card, and
  removal after the second request.

### Flow: Reconcile live timer updates

- [x] A timer change made in another open app view becomes visible in the
  current view without replacing a locally edited field. Evidence:
  `FloatingTimeTracker.test.ts` / `applies remote timer updates to untouched
  fields and preserves a local draft` applies a remote description to an
  untouched field, then types locally and verifies the next remote update does
  not replace the draft.
- [x] Temporary live-channel loss falls back to the supported refresh/polling
  behavior without creating a duplicate timer. Evidence:
  `FloatingTimeTracker.test.ts` / `recovers by polling during socket loss and
  refreshes again after reconnect` closes the socket, verifies polling adopts
  the running timer, and confirms no start request was sent.
- [x] Reconnection refreshes the displayed timer state from the server.
  Evidence: `FloatingTimeTracker.test.ts` / `recovers by polling during socket
  loss and refreshes again after reconnect` sends READY on the reconnected
  socket and verifies the refreshed server description is applied.

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
- [x] Renaming a Path linked to a board updates its tab name after reloading
  Board. Evidence: `nav-shell.acceptance.test.mjs` / `updates the board tab
  name when its Path is renamed` edits a Path then directly loads Board from
  the same mocked API fixture.
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
  `aria-pressed` (mocked API); `nav-shell.acceptance.test.mjs` / `pins a Path
  and keeps the saved state after browser reload` verifies its request and
  pressed state after reload from the updated fixture.
- [x] Reordering paths updates the visible order after reload. Evidence: `cd
  frontend && npx vitest run src/views/PathsView.test.ts -t 'reordered path
  list'` simulates drag and drop, asserts the ordered Path IDs sent to the API,
  and verifies the order after a fresh component load (mocked API);
  `nav-shell.acceptance.test.mjs` / `reorders Paths with browser drag and
  persists the ordered IDs` verifies Chromium drag, request order, and direct
  page reload from the updated API fixture.
- [x] Path order can be changed with keyboard and touch controls without
  dragging. Evidence: `nav-shell.acceptance.test.mjs` / `reorders Paths by
  keyboard with the accessible Move up action` verifies Enter-operated up and
  down controls; `reorders Paths by touch with a 44px Move up target` verifies
  tap reorders at 390px with a 44×44px target. Touch evidence is desktop
  Chromium emulation and does not establish Android-device behavior.
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
- [x] Opening an activity record navigates to that record's supported detail.
  Evidence: `PathsView.test.ts` / `shows only the selected path sessions
  grouped with timestamps and labels` opens the activity's identified session
  in the session editor and verifies the fetched record description.
- [x] An empty path history has an explicit empty state. Evidence: `cd
  frontend && npx vitest run src/views/PathsView.test.ts -t 'empty state for a
  path history'` checks the empty message and absence of activity rows (mocked
  API).
- [x] A failed history load presents a recoverable error. Evidence:
  `PathsView.test.ts` / `retries a failed path history load` verifies the
  failure message and that retrying opens the history dialog after the next
  summary request succeeds.

### Flow: Merge one path into another

- [x] The merge target picker only offers eligible owned destination paths.
  Evidence: `PathsView.test.ts` / `searches for a merge target, confirms the
  destructive merge, and refreshes paths` verifies the chooser uses the paths
  returned for the signed-in account and offers the destination.
- [x] Selecting the source itself is unavailable as a merge target. Evidence:
  the same test verifies the source is excluded from the radio targets; server
  ownership and self-merge rules are covered by `PathManagementServiceTest`.
- [x] Confirming the merge removes the source from the active path list.
  Evidence: `PathsView.test.ts` / `searches for a merge target, confirms the
  destructive merge, and refreshes paths` verifies only the target remains
  after the refreshed `/paths` response.
- [x] The source path's sessions remain accessible under the destination.
  Evidence: `KnowIntegrationTest.mergingPathsMovesTheSourceSessionsToTheOwnedTargetAndSoftDeletesTheSource`
  verifies the moved session is listed under the target Path.
- [x] Path-board cards retain their data and move to matching destination
  statuses where supported. Evidence:
  `PathBoardIntegrationTest.mergingPathsMovesCardsByStatusName` checks matched
  status mapping, fallback status, card data, and archived cards.
- [x] Cancelling the merge leaves both paths unchanged. Evidence:
  `PathsView.test.ts` / `closes the merge chooser without changing paths`
  cancels both the chooser and the destructive confirmation and verifies no
  merge request is sent.
- [x] A failed merge leaves the visible source and destination recoverable.
  Evidence: `PathsView.test.ts` / `keeps both paths recoverable and permits
  retry after a failed merge` verifies both paths remain after failure and a
  subsequent retry succeeds.

### Flow: Remove one path

- [x] Removing a path requires confirmation and explains the visible impact.
  Evidence: `frontend/src/views/PathsView.test.ts`, `confirms removal and
  offers a timed undo` asserts the confirmation copy and DELETE request;
  `does not remove a path when the confirmation is cancelled` verifies cancel.

### Flow: Restore one path

- [x] The removed path can be restored using the offered recovery action.
  Evidence: `frontend/src/views/PathsView.test.ts`, `restores a removed path
  to the active list after undo` checks the visible Path returns after restore.
- [x] Restoring the path makes its history and associated board available
  again. Evidence: `PathsView.test.ts` / `restores a removed path to the active
  list after undo` verifies its history can be reopened and the board visibility
  switch is available; `PathBoardIntegrationTest.deletingAPathHidesItsBoardUntilRestored`
  verifies the same board returns to the owned board list.

## Timeline and Logs

### Flow: Filter the activity timeline

- [x] Choosing an activity type limits results to that type. Evidence:
  `TimelineView.test.ts` / `limits timeline results to the selected activity
  type` starts with mixed activities and verifies only matching activity is
  visible after filtering.
- [x] Choosing a path limits results to activity associated with that path.
  Evidence: `TimelineView.test.ts` / `limits timeline results to the selected
  path` begins with activities for two Paths and verifies only the selected
  Path's activity remains visible after filtering.
- [x] Choosing a valid date interval limits results to its intended inclusive
  dates. Evidence: `TimelineView.test.ts` / `submits activity, path, and date
  filters together` verifies the requested start-of-day and end-of-day
  boundaries; `ActivityIntegrationTest.activityListFiltersPersistedEventsByDatesPathAndTypeAndScopesByOwner`
  verifies activities exactly on each bound are included.
- [x] Submitting a reversed date interval shows validation and does not display
  a misleading result set. Evidence: `TimelineView.test.ts` / `rejects a
  reversed date range without replacing current results` verifies the inline
  error, no filtered request, retained results, and recovery after correcting
  the dates.
- [x] Clearing timeline filters returns the default timeline state. Evidence: [`TimelineView.test.ts`](../../frontend/src/views/TimelineView.test.ts), `clears all timeline filters back to the default state`.
- [x] A filter with no matches displays an explicit empty state. Evidence: `TimelineView.test.ts` / `shows the empty state when an applied filter has no matches` verifies prior results are replaced by the explicit empty state.
- [x] A stale response from an earlier filter does not replace newer results. Evidence: `TimelineView.test.ts` / `does not let an earlier filter response replace newer results` resolves the newer filtered request first, then verifies the earlier response cannot replace it.

### Flow: Save a timeline activity note

- [x] Saving a note on one activity updates only that activity. Evidence: `TimelineView.test.ts` / `saves a note only on the selected activity` creates two visible activities and verifies the note request carries only the selected activity ID.
- [x] The activity note editor can be submitted from the keyboard. Evidence: `TimelineView.test.ts` / `submits an activity note with Control+Enter` and `submits an activity note with Meta+Enter` trigger both modifier keys from the content field and verify the POST contains the selected activity and draft.
- [x] Cancelling an activity note edit discards the unsaved draft. Evidence: `TimelineView.test.ts` / `closes an activity note editor without saving` reopens the editor and verifies both fields are empty.
- [x] A failed note save preserves the draft and provides a retry action. Evidence: `TimelineView.test.ts` / `reports initial-load and note-save failures and ignores incomplete notes` verifies entered fields survive a failed request and the Save note action retries successfully.

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
- [x] A pending create disables duplicate submission and communicates progress.
  Evidence: `LogsView.test.ts` / `prevents duplicate log creates and reports
  progress while saving` holds the create request open, submits twice, and
  checks one POST, a disabled button retaining its Save label, and a spinner.
- [x] The timestamp reset action uses the current browser time as labeled. Evidence: `LogsView.test.ts` / `keeps the new-log timestamp current until it is manually changed` advances the fake browser clock, confirms manual changes stop following it, and activates the accessible `Use browser time` reset.

### Flow: Edit one log

- [x] Editing a log's text updates only that log. Evidence: `LogsView.test.ts` / `edits text and timestamp in place without dropping the draft` edits the older of two logs and verifies the untouched record remains unchanged.
- [x] Editing a log's timestamp moves it to the matching chronological group. Evidence: the same test verifies the edited older record moves into today's group and the list remains timestamp ordered.
- [x] Assigning or removing a LOG label updates the saved label chips. Evidence: `LogsView.test.ts` / `opens log labels and toggles a selected label` verifies both the selected label request and the empty label request on removal, and checks the selected-state indicator updates.
- [x] A failed update preserves the user's draft and indicates recovery. Evidence: `LogsView.test.ts` / `preserves an edited log draft after a failed update and allows retry` checks the alert, retained text, and successful retry.

### Flow: Search the log list

- [x] Opening Log search exposes its input and documented keyboard shortcut. Evidence: `LogsView.test.ts` / `keeps search hidden until / opens it, leaving Cmd/Ctrl+K to global search` verifies slash opens the input and the global shortcut remains untouched.
- [x] A matching query filters the visible log records. Evidence: `LogsView.test.ts` / `filters logs, shows no matches, clears search, and restores URL query state` retains only matching log text.
- [x] Clearing the query restores the unfiltered records. Evidence: the same test clears the input and verifies all three fixture logs return.
- [x] A no-match query displays a clear empty result. Evidence: the same test checks `No logs match this search.`.
- [x] Query state is restored through URL or browser history where supported. Evidence: the same test verifies `q` is reflected in the URL, cleared with the input, and restored on `popstate`.

### Flow: Page through log history

- [x] Loading another page adds older/newer logs in stable chronological order. Evidence: `LogsView.test.ts` / `shows 100 logs per page and places pagination after the log list` verifies the next page contains the oldest record and Previous restores the first 100 without duplication.
- [x] Changing pages uses the loaded history without a duplicate API request or duplicate visible rows. Evidence: the same test verifies only one `/logs` request is made while paging, and checks each page size.
- [x] Date-group headings remain attached to the correct log rows at page boundaries. Evidence: the same test places a month boundary between pages and verifies the last page has the January 2026 heading.

### Flow: Open one log

- [x] Opening a log detail URL selects the intended log over the list. Evidence: `DeepLinks.test.ts` / `opens a loaded log and shows it in its place in the full list` verifies the requested record is selected and returns to its page in the list; `fetches a log the list doesn't hold and explains a missing one` covers an individually fetched record.
- [x] Closing a log detail returns to the previous list context. Evidence: `DeepLinks.test.ts` / `closes with Escape back to the list` verifies the route returns to `/logs`.

### Flow: Delete one log

- [x] Deleting a log requires confirmation or offers a visible undo action. Evidence: `LogsView.test.ts` / `confirms removal and removes the record after the API succeeds` uses the confirmation dialog before issuing DELETE.
- [x] Cancelling deletion leaves the log unchanged and sends no DELETE request.
  Evidence: `cd frontend && npx vitest run src/views/LogsView.test.ts -t
  'leaves a log unchanged when deletion is cancelled'` (component test;
  mocked API).
- [x] Confirming deletion removes only the selected log. Evidence: `LogsView.test.ts` / `confirms removal and removes the record after the API succeeds` verifies the selected log is removed and other loaded log records remain.
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
- [x] Clicking a report calendar date opens its corresponding Calendar day. Evidence: `ReportsView.test.ts` / `opens a report calendar record on its matching calendar date` verifies the date link targets `/calendar?date=2026-08-25`.

### Flow: Use report controls in mobile Chrome

- [x] The custom range selector opens and remains operable with touch input.
  Supplemental evidence: `scripts/nav-shell.acceptance.test.mjs` /
  `keeps report date and total controls reachable on a phone viewport` opens
  the range picker, selects a custom date interval by touch, and exercises
  Today/Yesterday and previous-range controls at 390px in desktop Chromium.
- [x] Report dates and totals are readable without clipping at phone width.
  Supplemental evidence: the same test checks the date input width and text
  overflow for the date range and total.
- [x] Chart and filter controls remain reachable without unintended page
  horizontal overflow. Supplemental evidence: the same test checks control
  bounds, filter availability, and page overflow at 390px.
  Real mobile Chrome remains unverified; these viewport-emulation checks do not
  satisfy the mobile acceptance setup above.

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

- [x] Each date cell can be selected by touch with a clear selected-day state.
  Supplemental evidence: `scripts/nav-shell.acceptance.test.mjs` /
  `selects a calendar day with touch and updates its details panel` selects a
  phone-width date cell, checks its selected state, editor date, and 44px hit
  target in desktop Chromium.
- [x] Range selection has a tap or keyboard alternative to pointer dragging.
  Evidence: `scripts/nav-shell.acceptance.test.mjs`, `selects a calendar
  range with touch taps and keyboard input` checks a full keyboard path in
  desktop Chromium and a phone-sized touch-emulated path.
- [x] The selected-day editor, label picker, and Save day action remain
  reachable with the on-screen keyboard open. Supplemental Chromium evidence:
  `scripts/nav-shell.acceptance.test.mjs` / `keeps Calendar editing controls
  reachable after a keyboard-like viewport resize` checks label picker and Save
  day bounds at 320px height and retains the note draft after restoring the
  viewport. Real mobile keyboard behavior still needs verification.
- [x] The calendar grid and editor do not cause unintended page overflow.
  Supplemental evidence: `scripts/nav-shell.acceptance.test.mjs` /
  `edits and saves a Calendar day at phone width without horizontal overflow`
  checks editor and Save day bounds plus page overflow at 390px; the touch
  selection test above checks the selected-day state. Desktop Chromium's
  `selects a calendar day with the keyboard and retains focus` checks keyboard
  activation and focus retention. Real mobile Chrome remains unverified.

## Imports and Settings

### Flow: Import Knowledge Base data

- [x] An empty Knowledge Base import history is identified clearly. Evidence:
  `ImportsView.test.ts` / `shows the empty Knowledge Base import history state`
  verifies the message, absence of batch rows, and absence of an error alert.
- [x] The Knowledge Base import view accepts pasted CSV text. Evidence: `ImportsView.test.ts` / `imports Knowledge Base CSV text and reports the server outcome` submits the CSV text in the supported text/csv request.
- [x] The Knowledge Base import view accepts a selected CSV file and submits its contents. Evidence: `ImportsView.test.ts` / `imports a selected Knowledge Base CSV file` reads a `.csv` File through the file input, confirms its contents in the editor, and verifies the submitted `text/csv` payload.
- [x] Invalid or unsupported import data produces a readable validation result without partial visible records. Evidence: `ImportsView.test.ts` / `keeps server diagnostics hidden behind an expandable disclosure` checks the UI error state; `KnowIntegrationTest.knowledgeBaseCsvImportRejectsMalformedAndUnsupportedRowsWithoutPartialState` checks no Paths or batches remain after rejection.
- [x] A valid import reports created, skipped, and created Path counts. Evidence: the same test verifies the visible imported, skipped, and created Path summary and the resulting batch history.
- [x] A pending import prevents a second submission and communicates progress. Evidence: `ImportsView.test.ts` / `disables repeated Knowledge Base import submissions while a batch is pending` holds the import request open, submits twice, and checks only one POST plus the disabled `Importing…` action label.
- [x] Re-importing the same external identities does not visibly duplicate records. Evidence: `KnowledgeBaseTransferServiceTest.importingTheSameStableIdsSkipsExistingRecords` verifies existing IDs are skipped; `ImportsView.test.ts` / `imports Knowledge Base CSV text and reports the server outcome` verifies skipped counts are shown.
- [x] Import history identifies completed batches and their outcomes. Evidence: the same import test verifies the resulting batch summary; `ImportsView.test.ts` / `undoes only the selected Knowledge Base batch and refreshes its status` verifies its undone state.
- [x] Import history pagination preserves stable batch ordering. Evidence: `ImportsView.test.ts` / `keeps Knowledge Base batch history in stable order across pages` checks all entries in order across next and previous page transitions.
- [x] Undoing one import batch affects only records from that batch. Evidence: `ImportsView.test.ts` / `undoes only the selected Knowledge Base batch and refreshes its status` confirms only the selected batch is undone; `KnowIntegrationTest.knowledgeBaseUndoDeletesOnlyRecordsFromTheSelectedBatch` confirms the second batch's Path remains available.
- [x] A failed import or undo reports failure and leaves a recoverable view. Evidence: `ImportsView.test.ts` / `keeps server diagnostics hidden behind an expandable disclosure` checks import failure; `keeps a Knowledge Base batch available after undo failure and retries it` verifies recovery.

### Flow: Import Clockify data

- [x] `/imports` opens directly and the source tabs switch to their matching panels. Evidence: `nav-shell.acceptance.test.mjs` / `opens the Imports route directly and switches import sources` checks direct load, title, selected tab state, and both history requests.
- [x] The Clockify import view accepts its supported pasted JSON data. Evidence: `ImportsView.test.ts` / `imports Clockify JSON and reloads the batch list` submits JSON and reloads batch history.
- [x] Invalid Clockify data identifies the problem without creating records. Evidence: `ImportsView.test.ts` / `reports malformed and structurally invalid Clockify input` checks actionable messages and confirms neither payload is submitted; `KnowIntegrationTest.clockifyImportRejectsMalformedAndUnsupportedPayloadsWithoutPersistingData` verifies no records persist.
- [x] A valid import shows its outcome and creates session records. Evidence: `ImportsView.test.ts` / `imports Clockify JSON and reloads the batch list` checks the visible summary; `KnowIntegrationTest.clockifyImportCreatesEntriesAndPaths` verifies imported entries and Paths.
- [x] Importing the same Clockify identities again does not visibly duplicate sessions. Evidence: `KnowIntegrationTest.clockifyImportIsIdempotentOnDuplicateExternalId` verifies duplicate external IDs are skipped.

### Flow: Export Knowledge Base data

- [x] The export action downloads the selected supported format. Evidence: `SettingsView.test.ts` / `downloads a Knowledge Base CSV from the Export tab` checks the action; `nav-shell.acceptance.test.mjs` / `downloads the Knowledge Base export from Settings in the browser` verifies the browser download filename and completion status.
- [x] The export includes the signed-in user's supported records and relationships. Evidence: `KnowIntegrationTest.knowledgeBaseCsvExportHasDownloadHeadersIsOwnerScopedAndRoundTripsEscapedText` checks owner scoping and exported records.
- [x] Text containing commas, quotes, Unicode, and line breaks remains readable in the exported file. Evidence: the same integration test checks escaped text survives export and re-import.
- [x] An export failure is reported without presenting a partial file as complete. Evidence: `SettingsView.test.ts` / `reports an export failure without claiming a file was downloaded` verifies a failed download shows the failure status.

### Flow: Navigate Settings sections

- [x] Each Settings tab opens the matching settings section. Evidence: `SettingsView.test.ts` / `shows only the selected settings section` checks Account, Import, and Export panels.

### Flow: Save appearance preferences

- [x] Changing a supported preference immediately updates its visible state and persists it. Evidence: `SettingsView.test.ts` / `updates and persists the appearance preference immediately` checks the selector, document theme, and local storage.
- [x] A saved preference remains selected after route change and reload. Evidence: `theme.test.ts` / `boots saved preference` verifies startup reads persisted preference; `nav-shell.acceptance.test.mjs` / `applies light and dark appearance changes across routes and reloads` checks route and reload behavior.

### Flow: Update account credentials

- [x] Invalid current/new password combinations show an actionable field or form error. Evidence: `SettingsView.test.ts` / `rejects mismatched new passwords before calling the API` checks the validation message and confirms no password request is sent.
- [x] A successful credentials update provides visible confirmation. Evidence: `SettingsView.test.ts` / `offers the changed password to browser credential storage after success` verifies the polite success status.
- [x] A failed credentials update preserves the entered values and allows recovery. Evidence: `SettingsView.test.ts` / `preserves credential inputs and offers recovery when saving fails` checks an actionable error and all three retained values.

## Labels and label history

### Flow: Search labels

- [x] An empty label collection has an actionable empty state. Evidence:
  `LabelsView.test.ts` / `shows the intentional empty state when no labels
  exist` verifies the message, absence of label rows, and absence of an error.
- [x] Opening Labels search focuses the query input using the documented shortcut. Evidence: `LabelsView.test.ts` / `focuses label search with / and filters names, leaving Cmd/Ctrl+K to global search`.
- [x] Searching filters labels by name. Evidence: the same test checks the matching label.
- [x] The `q` query state survives URL and browser-history navigation where supported. Evidence: `LabelsView.test.ts` / `restores and updates the label query in the URL` checks initial query state, updates, browser-history navigation, and clearing.
- [x] Clearing the search restores the full applicable label list. Evidence: the search test uses Escape and checks both fixture labels return.
- [x] A no-match query displays a clear empty result. Evidence: the search test checks `No labels match your search.`.

### Flow: Clear label search

- [x] Clearing the search restores the full applicable label list. Evidence: `LabelsView.test.ts` / `focuses label search with / and filters names, leaving Cmd/Ctrl+K to global search` clears the query with Escape and checks both labels return.

### Flow: Create a label

- [x] Creating a label with a valid name adds one label to the list. Evidence: `LabelsView.test.ts` / `creates labels hidden from Calendar only, shown on Boards, by default and saves inverted scope selections` verifies the created row.
- [x] Blank or whitespace-only names are rejected with visible feedback. Evidence: `LabelsView.test.ts` / `rejects blank and duplicate label names without losing the draft` submits whitespace and checks inline validation with no POST.
- [x] Duplicate names are handled with a clear validation or existing-label result. Evidence: the same test checks the inline unique-name error and retained entered value.
- [x] Selecting label color exposes an accessible name and selected state. Evidence: `ColorPalette.test.ts` / `announces the currently selected color through pressed state` checks the accessible selected color; `LabelsView.test.ts` checks the palette is present for create/edit.
- [x] Selecting label scopes updates the visible scope summary. Evidence: `LabelsView.test.ts` / `creates labels hidden from Calendar only, shown on Boards, by default and saves inverted scope selections` checks the summary and submitted scope values.

### Flow: Edit one label

- [x] Editing a label name updates the selected label wherever it is shown. Evidence: `LabelsView.test.ts` / `creates labels hidden from Calendar only, shown on Boards, by default and saves inverted scope selections` edits the name and verifies it on the row.
- [x] Editing scopes updates where the label is offered for new assignments. Evidence: the same test verifies updated scopes are submitted and reflected in the row's visible scope summary.

### Flow: Remove one label

- [x] Removing a label requires confirmation or provides a visible undo path. Evidence: `LabelsView.test.ts` / `offers a second confirmation and removes assignments only after confirming` checks both confirmation prompts.
- [x] Cancelling removal leaves the label and its visible relationships intact. Evidence: `LabelsView.test.ts` / `keeps a label after removal is cancelled or fails` verifies no DELETE is sent and the label remains.
- [x] A failed label save/removal preserves a recoverable state. Evidence: the same test verifies a failed removal leaves the row and announces the error; `preserves a label edit draft when saving fails` checks the editor retains its draft.

### Flow: Open label history

- [x] Opening a label's history shows usage summary and supported related records. Evidence: `LabelHistoryDialog.test.ts` / `shows first use, totals, the timeline, and hours` checks summary values and timeline; `LabelHistoryRecords.test.ts` covers the related-record list.
- [x] History can navigate to a related label and return to the prior label. Evidence: `LabelHistoryDialog.test.ts` / `lists related labels and switches to one`; `DeepLinks.test.ts` / `opens the label's history and keeps the list filter when it closes` verifies return to the filtered list.
- [x] Related session, calendar, note, and log records open their own routes. Evidence: `LabelHistoryRecords.test.ts` / `links a related record kind to its route` checks all four destinations.
- [x] Empty history is identified clearly. Evidence: `LabelHistoryDialog.test.ts` / `shows an empty state for an unused label`; `LabelHistoryRecords.test.ts` / `retries failures and shows an empty state`.
- [x] A failed history request offers retry. Evidence: `LabelHistoryDialog.test.ts` / `retries after a failed load` verifies recovery.
- [x] A removed or inaccessible related record does not break the history dialog. Evidence: history entries are ordinary links; `DeepLinks.test.ts` exercises missing Session, Note, Log, and Calendar targets as unavailable states without breaking their host views.
- [x] Loading another history page displays distinct related records in stable order without duplicates. Evidence: `LabelHistoryRecords.test.ts` / `moves between history pages without repeating or reordering records`.
- [x] A failed history page request can be retried without duplicating rows. Evidence: `LabelHistoryRecords.test.ts` / `retries a failed related-record page without duplicating rows` verifies retry of page one and unique displayed results.

## Boards, cards, and archive

### Flow: Select one board

- [x] A loaded empty board list offers a first-board action. Evidence:
  `BoardView.test.ts` / `shows the first-board prompt after an empty board list
  has loaded` checks the prompt, confirms no Kanban columns are rendered, and
  follows the action into the New board dialog.
- [x] Selecting a board tab displays that board's columns and cards. Evidence: `BoardView.test.ts` / `shows board selection as tabs` and `clicking an unselected board tab switches boards instead of renaming` verify the selected tab and board change.
- [x] Selecting All boards displays the available boards together and identifies each card's owning board. Evidence: `BoardView.test.ts` / `shows merged columns with a one-line board badge` and `labels each merged column region by its own heading`.

### Flow: Open the board manager

- [x] Opening Manage boards lists the available boards. Evidence: `BoardView.test.ts` / `opens the boards dialog from the single gear and each name opens its settings`.

### Flow: Pin one board

- [x] Pinning a board updates its visible pinned state after reload. Evidence: `boards.test.ts` / `pins a custom board and reloads the server tab order` verifies persisted pin and order response; `BoardView.test.ts` / `pins and unpins any board from the boards dialog` verifies the control state.

### Flow: Reorder boards

- [x] Reordering boards updates their visible tab order after reload. Evidence: `boards.test.ts` / `reorderBoards interleaves path and custom boards within a group and persists it` and `pins a custom board and reloads the server tab order`.

### Flow: Create one board

- [x] Creating a board adds a selectable board tab with its chosen title. Evidence: `BoardView.test.ts` / `creates the board from the dialog and closes it`.

### Flow: Rename one board

- [x] Renaming a board updates the selected board tab and title. Evidence: `BoardView.test.ts` / `renames the board on blur and ignores an unchanged or blank name`.

### Flow: Archive one board

- [x] Archiving a board requires confirmation and removes it from active tabs. Evidence: `BoardView.test.ts` / `confirms before archiving a status or the board` checks the confirmation dialog; `boards.test.ts` covers the archive action and active board selection.
- [x] A missing selected board falls back to All boards. Evidence: `board.acceptance.test.mjs` / `resolves an invalid board query to the All boards view` checks URL normalization and selected state.
- [x] The board explains when a requested board is unavailable after falling back to All boards. Evidence: `board.acceptance.test.mjs` / `resolves an invalid board query to the All boards view` verifies the All boards URL and selected tab, then checks the accessible fallback alert.

### Flow: Manage one board's statuses

- [x] Creating a status adds one column to the selected board. Evidence: `BoardView.test.ts` / `renames, reorders, and adds statuses` checks the created status request.
- [x] Renaming a status updates its column heading. Evidence: the same test verifies the selected status update request.
- [x] Reordering statuses updates their displayed order after reload. Evidence: the same test exercises keyboard reordering and verifies the persisted order; `boards.test.ts` / `persists status order and replaces the local order from the server` checks server reconciliation.
- [x] Archiving a status reassigns its cards and keeps them available in the board. Evidence: `board.acceptance.test.mjs` / `reassigns cards when a status is archived` verifies the card remains visible in Gantt.
- [x] Attempting to archive the last active status gives the user visible feedback. Evidence: `BoardView.test.ts` / `explains why the last active status cannot be archived` and `board.acceptance.test.mjs` / `explains why the last active status is disabled in board settings` verify the disabled action has a visible reason and accessible description; `board.acceptance.test.mjs` / `explains when another client makes a status the last active one` verifies a concurrent 409 is announced and leaves the status available; `BoardControllerApiTest.finalActiveStatusCannotBeArchived` covers the backend invariant.
- [x] Restoring an archived status returns it to the board. Evidence: `BoardArchiveView.test.ts` / `restores an archived status through an icon button`.
- [x] A failed status update leaves the board in a recoverable state. Evidence: `boards.test.ts` / `keeps a status active when archive fails` retains the status after the rejected update.

### Flow: Create one board card

- [x] Creating a card in a selected column places it in that column. Evidence: `BoardView.test.ts` / `adds a blank card to the clicked column from its header and opens it`.

### Flow: Open one board card

- [x] Opening a card displays the card-specific URL and editor. Evidence: `BoardView.test.ts` / `sets the selected card in the URL and clears it when the editor closes` verifies the query and editor.

### Flow: Edit one board card

- [x] Saving title and body updates the selected card. Evidence: `board.acceptance.test.mjs` / `autosaves edits and closes with Cmd/Ctrl+Enter from the body` verifies the title appears on the card and the body edit flushes on close; `formats a card body from the toolbar on desktop and phone` checks formatted body content.
- [x] Saving path, priority, status, and date fields updates the selected card's displayed metadata. Evidence: `BoardView.test.ts` / `sets and clears the card path from the header picker`, `puts dates, priority, status, labels, and an icon-only archive button in the editor footer`, `saves a single confirmed day as both start and due date`, and `flushes pending edits when closed and moves the card from the status select`.
- [x] Adding/removing BOARD labels updates the selected card's label chips. Evidence: `BoardView.test.ts` / `picks card labels from a searchable chip selector in the editor footer` and `shows each selected label's name on its chip and removes it from the chip`.
- [x] Closing the editor clears its selected card from the URL. Evidence: the same test verifies only the selected board remains in the route query after close.
- [x] A failed card save preserves the draft and identifies the recovery action. Evidence: `board.acceptance.test.mjs` / `keeps a failed card save retryable without losing the draft` checks the retained title and Retry action.
- [x] A stale card edit reports a conflict without silently replacing the current saved version. Evidence: `BoardView.test.ts` / `shows the newer card's times after a conflict and the retried save's times after Retry`; `boards.test.ts` / `keeps the current card intact when an edit times out`.

### Flow: Move one card between statuses

- [x] Moving a card to another status places it once in the destination. Evidence: `boards.test.ts` / `reconciles a moved card in both Kanban and Gantt collections` and `reorders neighboring cards when moving within the same status`; `BoardView.test.ts` / `flushes pending edits when closed and moves the card from the status select`.

### Flow: Reorder cards in an unsorted column

- [x] Reordering cards in an unsorted column persists the final order after reload. Evidence: `board.acceptance.test.mjs` / `reorders cards in a column with the keyboard alternative` moves the first dense card, verifies the saved move request, reloads, and asserts the first two cards retain their reordered positions.

### Flow: Sort cards by priority

- [x] Priority sorting shows cards in the selected priority order. Evidence: `BoardView.test.ts` / `shows a priority-sorted column in priority order`.
- [x] Sorted columns do not expose a misleading manual order result. Evidence: `BoardView.test.ts` / `does not reorder within a priority-sorted column` and `cycles a column's sort through three states`.
- [x] A failed reorder restores the prior order or offers a clear retry. Evidence: `boards.test.ts` / `restores the saved card order when a move request fails` verifies the original sibling order and positions are restored in Kanban and Gantt state after the move request rejects.
- [x] Keyboard/tap controls provide an alternative for supported drag actions. Evidence: `BoardView.test.ts` / `renames, reorders, and adds statuses` verifies keyboard ordering from the drag-handle control; card status can also be changed through the editor status select.

### Flow: Page through board cards

- [x] Loading more cards appends the next page without repeating prior cards. Evidence: `boards.test.ts` / `coalesces duplicate lazy-page requests at the same cursor` verifies one page request and one appended record.
- [x] Page order remains stable when card priorities are tied. Evidence: `board.acceptance.test.mjs` / `keeps page order stable when priority-sorted cards have ties` enables priority sorting for 20 equal-priority cards, loads the next page, and verifies all 21 retain their position order.
- [x] A page request failure exposes a retry action. Evidence: `boards.test.ts` / `keeps a failed lazy page retryable and exposes a recoverable error` checks error state and retry success.
- [x] Retrying a failed page does not duplicate cards. Evidence: the same test verifies the recovered card is appended once after retry.

### Flow: Use the Gantt view

- [x] Switching to Gantt shows the selected board's active cards. Evidence: `BoardView.test.ts` / `toggles between Kanban and Gantt views` and `keeps all active cards in the Gantt gutter while limiting bars to the visible dates`.
- [x] Changing the visible date range updates the timeline window. Evidence: `BoardView.test.ts` / `moves the timeline start to the card's start date from its edge arrow` and `moves the timeline end to the card's end date from its right edge arrow`.
- [x] Undated cards remain discoverable in the card name gutter. Evidence: `BoardView.test.ts` / `keeps all active cards in the Gantt gutter while limiting bars to the visible dates`.
- [x] Cards outside the visible interval remain discoverable in the gutter. Evidence: the same test and `shows edge arrows for dated cards outside the visible timeline`.
- [x] A card's inclusive start/end dates occupy the intended timeline days. Evidence: `BoardView.test.ts` / `selects and saves an inclusive date range when dragging across an undated row` and `previews a one-day bar on an undated card's row and saves the hovered date on click`.
- [x] Dragging a card bar changes its dates by whole days and shows save feedback. Evidence: `board.acceptance.test.mjs` / `moves and resizes Gantt dates and marks today across the chart` checks the exact updated date payload.
- [x] Resizing either edge changes the matching endpoint date. Evidence: the same test checks left and right endpoint updates.
- [x] Cancelling a drag leaves the saved date range unchanged. Evidence: `board.acceptance.test.mjs` / `cancels a Gantt drag and restores dates after a failed save` checks cancellation sends no request and both cancellation and failed save restore the original bar.
- [x] Offscreen date arrows move the visible window to include that card. Evidence: `BoardView.test.ts` / `moves the timeline start to the card's start date from its edge arrow` and `moves the timeline end to the card's end date from its right edge arrow`.
- [x] Hiding and restoring the card list preserves the user's selected view. Evidence: `BoardView.test.ts` / `hides and shows the Gantt card list from the timeline's top-left toggle` and `remembers the hidden Gantt card list in this browser`.
- [x] Gantt date and window controls remain visible and operable at 390px where Gantt is offered. Supplemental evidence: `board.acceptance.test.mjs` / `keeps Gantt date and window controls operable at phone width` checks control visibility and viewport bounds, advances the date window, and returns to Today. This Playwright Chromium viewport check does not replace the separately tracked real mobile Chrome/device pass.

### Flow: Start a timer from a card

- [x] A card with an eligible path exposes its start-timer action when no timer is running. Evidence: `BoardView.test.ts` / `shows a card play button only for path cards while no timer runs`.
- [x] Starting from the card creates a timer for that path with the card title as its description. Evidence: `BoardView.test.ts` / `starts a session from a card without opening it`.
- [x] A running timer hides or disables duplicate card start actions without shifting card layout unexpectedly. Evidence: `BoardView.test.ts` / `keeps an invisible play slot on In Progress cards while a timer runs`.

### Flow: Archive one card

- [x] Archiving a card removes it from the active board and places it in the archive. Evidence: `board.real-stack.acceptance.test.mjs` / `archives a card from the board and restores it on the archive page`; `boards.test.ts` / `removes an archived card from the active Gantt window`.
- [x] The archive deep link selects the requested board/card context. Evidence: `BoardArchiveView.test.ts` / `marks an archived board named by the link, whether as archivedBoard or board` and `scrolls to and marks the archived card a search result links to`.

### Flow: Restore one card

- [x] Restoring a card returns it to an active board and valid status. Evidence: `BoardArchiveView.test.ts` / `restores an archived card and names untitled cards accessibly` and `boards.test.ts` / `re-adds a restored dated card only when it overlaps the Gantt window`.
- [x] A card whose former status is archived is restored to a valid active status with visible feedback. Evidence: `BoardControllerApiTest.restoringCardFallsBackWhenItsStatusWasArchived` and `BoardArchiveView.test.ts` / `restores an archived card and names untitled cards accessibly`.
- [x] Returning from archive restores the relevant board context. Evidence: `BoardArchiveView.test.ts` / `links back to the board it was opened from` and `scrolls to and marks the archived card a search result links to`.

### Flow: Use Kanban on mobile Chrome

- [x] Board tabs and board-management actions are reachable at 390px. Supplemental evidence: `board.acceptance.test.mjs` / `fits the tabs without sideways scrolling and lists the rest under More (390px)` checks every board is reachable once; `moves the view switch and board settings into the board menu on phones` opens the board-management dialog.
- [x] Cards can be opened and edited using touch at phone width. Supplemental evidence: `board.acceptance.test.mjs` / `moves a card with touch taps through the editor's status select` opens and closes the editor with touch taps, saves a changed title, changes its status, and checks the resulting board card.
- [x] Card controls remain tappable without overlapping or clipping at phone width. Supplemental evidence: `board.acceptance.test.mjs` / `keeps every card editor control in its own slot on desktop and phone` checks editor control geometry and overlap at 320px and 390px; `keeps card timer actions at 44px on phones` checks minimum touch targets.
- [x] Touch drag actions have a tap or keyboard alternative where supported. Supplemental evidence: `board.acceptance.test.mjs` / `reorders cards in a column with the keyboard alternative` verifies keyboard ordering; `moves a card with touch taps through the editor's status select` provides a touch path to change a card's column without dragging.
- [x] The selected card remains identifiable during phone editor interaction. Supplemental evidence: `board.acceptance.test.mjs` / `moves a card with touch taps through the editor's status select` verifies the selected title remains in the editor and the card ID remains in the URL before editing; real mobile Chrome/device behavior remains part of the open platform pass.

## Notes

### Flow: Search notes

- [x] Searching notes by text shows matching notes. Evidence: `NotesView.test.ts` / `filters note text, restores the query in the URL, and distinguishes empty from error` verifies a text match remains visible.
- [x] The `q` query state is restored after reload and browser Back/Forward. Evidence: the same test remounts from `/notes?q=graph` and verifies the search field and result.
- [x] A no-match result is distinct from a failed notes request. Evidence: the same test checks `No notes match your search.` separately from `Unable to load notes.`.

### Flow: Filter archived notes

- [x] Enabling the archived filter shows archived notes only. Evidence: `NotesView.test.ts` / `switches between archived and active notes and restores the URL state` verifies the archived query, archived row, and Restore action.
- [x] Clearing filters restores the active note list. Evidence: the same test switches back, verifies the query is cleared, and confirms the active note returns.
- [x] Changing page size updates the number of visible note rows. Evidence: `NotesView.test.ts` / `changes page size and pages through notes without repeating records` checks the 20-row default and 25 rows at page size 50.
- [x] Moving between note pages preserves stable order without duplicates. Evidence: the same test checks that page 2 contains the final five ordered titles exactly once.

### Flow: Create one note

- [x] Creating a note opens its editor, sets its record-specific URL, and
  adds it to the list after remount from the API fixture. Evidence: `cd
  frontend && npx vitest run src/views/NotesView.test.ts -t 'creates a note
  from the icon action'` (component test; mocked API).

### Flow: Open one note

- [x] Opening a note row sets the note-specific URL. Evidence: `NotesView.test.ts` / `opens the note editor when the card body is clicked` verifies the `note-editor` route and selected id.
- [x] Directly loading a valid `/notes/:id` URL opens that note in the
  component route test and a desktop Chromium browser test. Evidence:
  `cd frontend && npx vitest run src/views/DeepLinks.test.ts` — `loads the
  selected note when its editor URL is opened directly`; `cd frontend && node
  --test --test-name-pattern='loads a note editor when the browser opens its
  deep link directly' scripts/nav-shell.acceptance.test.mjs` (mocked API).
- [x] Closing a note returns to its list context and clears its selected URL. Evidence: `NotesView.test.ts` / `returns from the note editor to the filtered list and clears its selected URL` verifies the search query survives both route transitions.
- [x] Opening a missing or inaccessible note shows a recoverable unavailable
  state in component and desktop Chromium tests. Evidence: `cd frontend && npx
  vitest run src/views/DeepLinks.test.ts` — `shows a recoverable error when a
  directly linked note is unavailable`; `cd frontend && node --test
  --test-name-pattern='missing note opened by browser deep link' scripts/nav-
  shell.acceptance.test.mjs` (mocked API).

### Flow: Edit note content

- [x] Editing the note title saves to the selected note. Evidence: `NotesView.test.ts` / `loads the editor and autosaves title and rich content without a save button` verifies the selected note update.
- [x] Editing paragraphs and plain text saves without losing line breaks. Evidence: `NotesView.test.ts` / `saves a plain-text copy with one line per body line, as the extension edits it` checks each saved line.
- [x] Rich-text toolbar actions apply the selected formatting at the caret. Evidence: `NotesView.test.ts` / `applies selected formatting in the note editor and autosaves it` selects body text, applies Bold, and verifies the saved content mark.
- [x] Checklist/list/quote/code formatting remains intact after save and reopen. Evidence: `NotesView.test.ts` / `preserves list, checklist, quote, and code blocks after save and reopen` verifies saved content renders with each structure after remount.
- [x] Pasting formatted content does not create unsafe or visibly corrupted content. Evidence: `NotesView.test.ts` / `pastes rich note content without retaining unsafe markup` verifies rich formatting is retained, script markup is discarded, and sanitized content autosaves.
- [x] Long content remains readable and editable without breaking the page layout. Evidence: `nav-shell.acceptance.test.mjs` / `keeps long note titles and paragraphs within a phone-width editor` verifies long title/body content and checks document, editor, and ProseMirror widths at 390px.

### Flow: Inspect note line history

- [x] Enabling Line history shows the last-edit time beside each saved body line. Evidence: `NotesView.test.ts` / `toggles a per-line edit-time gutter that the URL remembers` and nested line-history save tests.
- [x] Lines added since the last completed save are identified as Unsaved. Evidence: `NotesView.test.ts` / `marks a typed line unsaved, then shows the time the save returned`.
- [x] Moving the caret to another line updates the announced line number and edit time. Evidence: `NotesView.test.ts` line-history assertions update the caret and verify the current line stamp.
- [x] Turning Line history off hides its gutter without changing note content. Evidence: `NotesView.test.ts` / `toggles a per-line edit-time gutter that the URL remembers` toggles the query and asserts the saved editor content remains.

### Flow: Assign labels to a note

- [x] Searching and selecting a NOTE label assigns it to the current note. Evidence: `NotesView.test.ts` / `suggests matching existing labels while typing and applies a selected label`.
- [x] Removing an assigned label removes only that association. Evidence: `NotesView.test.ts` / `removes only the selected note label and saves the remaining associations` verifies the other selected label remains in the save payload.
- [x] Creating a label from the picker assigns the intended new label. Evidence: `NotesView.test.ts` / `adds a new label from the note label picker` and `creates a note label with Enter in the picker`.

### Flow: Archive one note

- [x] Archiving a note requires confirmation; cancelling leaves the note unchanged. Evidence: `NotesView.test.ts` / `archives a note after confirmation` and `leaves a note unchanged when archive confirmation is cancelled`.
- [x] Confirming archive removes only the selected note from the active list. Evidence: `NotesView.test.ts` / `archives a note after confirmation` verifies the other note remains and receives no delete request.
- [x] The archived note remains available in the archived list with its content intact. Evidence: `NotesView.test.ts` / `archives a note after confirmation` switches to Archive and verifies the archived title and body excerpt.

### Flow: Restore one note

- [x] Restoring a note returns it to the active list with content intact. Evidence: `NotesView.test.ts` / `restores a note from the archive`.
- [x] An empty archive explains its state and offers a route back to Active notes. Evidence: `NotesView.test.ts` / `restores a note from the archive` checks the empty message and action; `nav-shell.acceptance.test.mjs` / `keeps the active-notes recovery action in an empty archive` verifies the direct query route, recovery click, and cleared URL filter.

### Flow: Permanent deletion of a note

- [x] Permanent deletion is not offered on the Notes route; the supported destructive action is confirmed Archive with a restore path. Evidence: `NotesView.vue` exposes Archive/Restore controls; `NotesView.test.ts` / `archives a note after confirmation`, `leaves a note unchanged when archive confirmation is cancelled`, and `restores a note from the archive` verify the supported flow. `FLOW-09.11` records permanent deletion as unsupported for this surface.

### Flow: Pin one note

- [x] Pinning a note changes its visible pinned state. Evidence: `NotesView.test.ts` / `pins notes and persists card ordering` checks the button's updated accessible name.

### Flow: Reorder notes

- [x] Reordering notes changes their visible order after reload. Evidence: `NotesView.test.ts` / `pins notes and persists card ordering` checks the new order on the list and after remount from the API fixture.
- [x] Keyboard/touch alternatives are available where drag reordering is supported. Evidence: `NotesView.test.ts` / `reorders notes with accessible move controls`; `nav-shell.acceptance.test.mjs` / `reorders notes with a touch-sized control at phone width` and `reorders notes with the keyboard on desktop` verify the 44px touch target and browser keyboard operation.
- [x] A failed reorder restores the saved order or provides a clear retry. Evidence: `NotesView.test.ts` / `keeps note order after a failed reorder and allows a retry` verifies the saved order remains visible, the error is announced, and a second drag succeeds.

### Flow: Recover unsaved note changes

- [ ] Navigating away with unsaved edits warns before discarding them.
- [ ] Choosing to stay returns the user to the unsaved editor.
- [ ] Choosing to discard leaves the last saved version intact.
- [x] A failed save preserves the draft and offers recovery. Evidence: `NotesView.test.ts` / `keeps a failed note draft and retries the save from an explicit action` verifies the retained draft and successful retry.
- [ ] A conflicting newer version presents a recovery choice and does not
  silently overwrite the winning content.

Coverage note: `NotesView.test.ts` / `replays a draft when another window
saved first` verifies automatic retry with the freshly loaded version and a
visible Saved state. It does not offer a recovery choice, so this criterion
remains open.

Coverage note: `NotesView.test.ts` / `flushes a pending autosave before
navigating back to the note list` and `waits for an in-flight save and flushes
a newer draft before leaving` verify pending/queued autosaves finish before
navigation;
`keeps a failed draft in the editor, retries it, then permits navigation`
verifies failed saves keep the user on the editor with the draft, then allow
navigation after Retry succeeds. No explicit stay/discard warning is offered,
so the warning and discard criteria remain open.

### Flow: Use the Notes editor in mobile Chrome

- [x] The note list and editor can be reached with touch at phone width. Evidence: `nav-shell.acceptance.test.mjs` / `opens and uses the Notes editor with touch-sized controls on mobile` opens a note from the mobile list and returns to it from the editor.
- [x] Editing controls remain visible or reachable while the mobile keyboard
  is open. Supplemental Chromium evidence: `nav-shell.acceptance.test.mjs` /
  `keeps the Notes draft and editor controls reachable across a keyboard-like
  viewport resize` checks the formatting control intersects the reduced
  viewport. A real mobile keyboard still needs verification.
- [x] Long editor content scrolls without trapping the page or obscuring the
  formatting toolbar. Supplemental Chromium evidence:
  `nav-shell.acceptance.test.mjs` / `scrolls long Notes content without
  trapping the page or hiding formatting controls` checks page scroll, toolbar
  reachability, and horizontal overflow at 390px. Real mobile Chrome still
  needs verification. Notes saves automatically and has no manual Save button.
- [x] Rich-text controls have touch targets suitable for repeated editing. Evidence: the same mobile browser test checks every toolbar button is at least 44×44px.
- [x] Closing the keyboard preserves the caret and entered content.
  Supplemental Chromium evidence: the same viewport-resize test asserts the
  draft text and caret selection survive restoring the taller viewport. A real
  mobile keyboard still needs verification.

## Cross-cutting behavior

### Flow: Recover from a failed page read

- [x] A failed page load displays an error distinct from a valid empty state.
  Evidence: `NotesView.test.ts` / `filters note text, restores the query in the
  URL, and distinguishes empty from error` checks that no matches show the
  empty state without an alert, while an offline search shows an alert.
- [x] A failed list-page request keeps previously loaded records available.
  Evidence: `NotesView.test.ts` / `keeps the visible notes when a focus refresh
  fails` asserts the refresh error while the previously loaded note remains in
  the list and the empty state stays hidden.

### Flow: Recover from a failed mutation

- [x] A failed mutation preserves user-entered values where retry is possible.
  Evidence: `PathsView.test.ts` / `preserves a failed path create and lets the
  user retry` checks the entered name survives failure and can be submitted
  successfully.
- [x] Retrying a failed mutation does not create duplicate records.
  Evidence: `PathsView.test.ts` / `prevents duplicate path creation while the
  first request is pending` submits twice during one pending request and checks
  the API receives only one create.
- [x] A loading action communicates progress and prevents accidental duplicate
  submission. Evidence: the same test checks the submit button is disabled,
  retains its “Add path” label, and exposes “Adding path…” as a live status.

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
  Partial evidence: `nav-shell.acceptance.test.mjs` / `shows a visible keyboard
  focus ring that is not covered by the shell` checks the first Tab target has
  a 2px focus ring, is inside the phone viewport, and is not covered at its
  center point. Other controls and scrolled/sticky states still need coverage.
- [ ] Dialogs, menus, pickers, and forms have predictable focus entry and
  return behavior.
  Partial evidence: `nav-shell.acceptance.test.mjs` / `moves focus into and
  returns focus from the Path create dialog` checks initial focus on the name
  field and focus restoration after Escape; `opens the first-board dialog
  with keyboard focus and returns focus on Escape` checks the same lifecycle
  from the Boards workspace. Other dialog/menu/picker patterns remain to be
  checked.
- [ ] Drag, date-range, and reorder actions have a keyboard alternative where
  those actions are not inherently pointer-only.

### Flow: Operate the application with mobile Chrome touch

- [ ] Primary touch targets are comfortably tappable at phone width.
- [x] Mobile text controls use an input size that avoids unintended browser
  zoom where applicable. Supplemental Chromium evidence:
  `nav-shell.acceptance.test.mjs` / `uses at least 16px text controls on
  phone-width routes` checks visible inputs, selects, textareas, and editable
  content on Sessions, Logs, Notes, Calendar, and Settings at 390px. A real
  mobile browser zoom interaction still needs verification.
- [ ] The page remains zoomable using browser controls.
  Partial evidence: `nav-shell.acceptance.test.mjs` / `does not disable browser
  zoom in the viewport configuration` checks the viewport metadata omits
  `user-scalable=no` and a 1.0 maximum scale. Actual browser zoom interaction
  still needs verification.
- [ ] The on-screen keyboard does not permanently obscure the active control
  or its save/recovery action.
- [ ] Modals and drawers keep their content scroll contained and provide a
  reachable close action.
- [ ] Gestures have a tap or keyboard alternative unless the gesture is
  essential to the task.

### Flow: Display long and empty user content

- [ ] Very long titles, descriptions, note bodies, and log text do not overlap
  adjacent controls or create page-wide overflow.
  Partial evidence: `nav-shell.acceptance.test.mjs` / `keeps long note titles
  and paragraphs within a phone-width editor`, `wraps very long Log text
  within the phone-width detail layout`, `keeps a long Path description
  inside its phone-width card`, and `wraps a long Board card title inside its
  phone-width card`; `PathsView.test.ts` / `keeps long path titles on one
  truncated line`. Very long descriptions in other routes and route-specific
  combinations still need explicit coverage.
- [ ] Empty strings and empty collections render intentional empty states.
  Partial evidence: `LogsView.test.ts` / `shows the intentional empty state
  when no logs exist` checks the empty message without rows or an error;
  `NotesView.test.ts` / `shows an actionable empty state when no notes exist`
  checks the message, absence of rows/error, and Create new note action, while
  `renders an empty rich-text body as italic Empty note` checks an empty
  user-entered body; Labels, Imports, and a loaded empty Board list are also
  covered by named component tests; `nav-shell.acceptance.test.mjs` / `shows
  an add-card action for a loaded empty Board column` checks a loaded empty
  card column and its action. Other supported collections and blank fields
  still need explicit coverage.

### Flow: Honor reduced-motion preferences

- [x] Reduced-motion preferences suppress or simplify nonessential movement.
  Evidence: `nav-shell.acceptance.test.mjs` / `suppresses global search motion
  when reduced motion is preferred` checks the rendered search panel has no
  animation or transition when Chromium emulates `prefers-reduced-motion:
  reduce`; `frontend/src/style.css` applies the same reduced-motion rule across
  the application.
- [x] Status and selection are communicated with text, shape, or accessible
  labels as well as color. Evidence: `CalendarView.test.ts` / `announces when
  the Calendar Today action selects the current date` checks the polite
  selection message; `ColorPalette.test.ts` / `announces the currently selected
  color through pressed state` checks accessible selected state; `BoardView.test.ts`
  / `keeps the column heading as the accessible name for its section` checks
  status names remain available to assistive technology.

## OTOTEST-03 inventory acceptance

- [x] Every supported route in the [product test tree](product-test-tree.md)
  has an inventory row for direct load, page identity, and applicable query
  state. Evidence: [`01-route-matrix.md`](01-route-matrix.md) reconciles all 19
  registered route entries from `frontend/src/main.ts` and records route,
  evidence, and remaining gaps.
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
- [x] Fixture/mock, API/service, real-browser, and manual evidence remain
  clearly distinguished. Evidence: [`01-route-matrix.md`](01-route-matrix.md)
  and [`01-control-matrix.md`](01-control-matrix.md) label component, mocked
  browser, real-stack, API/service, and manual evidence separately.
- [ ] Dialog and menu action rows cover the applicable open, submit, cancel,
  validation, confirmation, focus, failed-request, and retry outcomes as
  separate responsibilities.
- [x] `/development` is explicitly excluded from supported route completeness
  and absent from authenticated product navigation. Evidence:
  [`01-route-matrix.md`](01-route-matrix.md) marks the route excluded;
  `nav-shell.acceptance.test.mjs` / `keeps every supported primary destination
  reachable at phone width` asserts the complete primary-link href list without
  `/development`.
- [x] Native iOS and Chrome extension flows are excluded from this milestone;
  extension coverage is tracked by OTOTEST-04. Evidence:
  [`README.md`](README.md) defines iOS as out of scope and tracks extension
  coverage under OTOTEST-04.
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

