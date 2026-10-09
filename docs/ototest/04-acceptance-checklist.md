# OTOTEST-04 product acceptance checklist: real-stack journeys and Chrome integration

**Milestone:** [OTOTEST-04 — Real-stack and extension journeys](04-real-stack-and-extension.md)

**Product map:** [#ototest product test tree](product-test-tree.md)

**Status:** Draft acceptance checklist; no flows are marked passed.

This checklist describes product behavior to accept for OTOTEST-04. It is not
a test plan or a claim that any flow passed. Each flow below has one user
responsibility. It covers the Knowledge Base web application in desktop Chrome
and mobile Chrome, plus the installed Chrome extension in desktop Chrome. It
excludes native iOS. Standard Chrome on Android does not install desktop Chrome
extensions; mobile Chrome checks therefore exercise the responsive web app,
not the extension.

## Product review basis

The checklist was derived from the OTOTEST-04 milestone brief, the product
tree, the registered web routes, the Vue views and stores, and the Manifest V3
extension entrypoints. A read-only authenticated review of the local
application confirmed the Notes, Paths, Logs, Labels, Calendar, Reports,
Settings, and Imports routes and their rendered controls. A phone-width Chrome
profile (390 × 844 CSS pixels) rendered Reports without document-width
overflow. The floating timer sat over the report filter area in that view, so
the mobile checks below explicitly verify that it does not make controls
unavailable. This review is source and rendered-state context only; it does not
mark an acceptance flow complete or establish physical Android-device
behavior.

Product source reviewed includes `frontend/src/main.ts`;
`frontend/src/views/NotesView.vue`, `PathsView.vue`, `LogsView.vue`,
`LabelsView.vue`, `CalendarView.vue`, `ReportsView.vue`, `SettingsView.vue`,
and `ImportsView.vue`; and `chrome-extension/wxt.config.ts`,
`chrome-extension/entrypoints/popup/index.html`,
`chrome-extension/entrypoints/options/index.html`,
`chrome-extension/entrypoints/background.ts`, `chrome-extension/popup.js`,
`chrome-extension/options.js`, and the Clockify content entrypoints.

## Acceptance conditions and evidence

- [ ] **SETUP-01** Use a local or explicitly approved non-production Knowledge
  Base environment and a disposable account. Do not use production or
  personal records.
- [ ] **SETUP-02** Record the application revision, API revision when
  different, Chrome version, operating system, account type, theme, date/time
  zone, and each viewport used for the acceptance pass.
- [ ] **SETUP-03** Run web flows in desktop Chrome at a laptop-width viewport
  and in mobile Chrome on an Android device. Record physical-device evidence
  separately from any emulated phone viewport.
- [ ] **SETUP-04** Run extension flows in desktop Chrome with the packaged
  Manifest V3 extension installed. Record the package/build identity and
  granted permissions; an unpacked developer preview does not represent a
  store-installed extension if distribution behavior is under review.
- [ ] **SETUP-05** Record pass, fail, blocked, or not applicable separately
  for desktop web, Android Chrome web, and desktop Chrome extension. Do not
  combine their results into one status.
- [ ] **SETUP-06** For each saved mutation, record the visible result and a
  fresh page read after navigation or reload. A toast by itself does not
  establish persisted state.
- [ ] **SETUP-07** Keep the evidence to redacted screenshots or notes and
  aggregate results. Do not capture credentials, bearer tokens, browser
  storage, or private user data.
- [ ] **SETUP-08** Use keyboard-only interaction for keyboard alternatives and
  touch interaction for mobile Chrome. Record any desktop viewport emulation
  as emulation, not physical-device evidence.
- [ ] **SETUP-09** Leave no test-created timer running. Remove or restore only
  disposable records created for the acceptance pass, using the product's
  supported recovery path where possible.
- [ ] **SETUP-10** Treat each flow as its own result. A successful neighboring
  action or a shared page render does not pass another flow.

## Web application flows

### Notes

#### Flow: Create and persist a note

- [ ] **NOTE-01** Open Notes from navigation and by directly loading `/notes`;
  confirm both entry paths display the Notes workspace.
- [ ] **NOTE-02** Create one note with a distinctive disposable title and
  content; confirm it appears once in the list with the saved title and
  updated timestamp.
- [ ] **NOTE-03** Reload Notes and confirm the created note remains available
  and opens at its own detail route.
- [ ] **NOTE-04** Submit an empty note and whitespace-only title/content where
  the UI allows submission; confirm the product gives a clear, recoverable
  result and does not create an unintended duplicate.
- [ ] **NOTE-05** Create a note with long title and multi-paragraph content;
  confirm the list and editor remain readable without hiding note actions.

#### Flow: Edit and persist note content

- [ ] **NOTE-06** Change an existing disposable note's title and content;
  confirm the save indicator resolves to success and the rendered content
  matches the edit.
- [ ] **NOTE-07** Navigate away and return or reload; confirm the edited title
  and content remain persisted.
- [ ] **NOTE-08** Make a further edit while save is pending; confirm later
  typing is not silently discarded when the earlier save completes.
- [ ] **NOTE-09** Simulate an unavailable save request in the approved local
  environment; confirm the draft remains visible and the user can retry or
  recover without losing the text.
- [ ] **NOTE-10** Attempt to leave an unsaved note edit; confirm the product
  warns before discarding or otherwise preserves the draft.

#### Flow: Format note content

- [ ] **NOTE-11** Apply each supported rich-text toolbar operation used by
  this note (headings, emphasis, lists, quote, link, or code); confirm the
  editor reflects the selected formatting.
- [ ] **NOTE-12** Paste formatted content into a note; confirm supported
  formatting remains usable and unsafe or unsupported markup does not execute
  or break the editor.
- [ ] **NOTE-13** Create and toggle a task-list item; confirm checked state
  and item text persist after reopening the note.
- [ ] **NOTE-14** Use Undo and Redo in the editor; confirm each action changes
  only the expected edit and remains keyboard operable.

#### Flow: Assign labels to a note

- [ ] **NOTE-15** Assign an available NOTE-scope label to a disposable note;
  confirm the selected label is visible in the editor and after reopening.
- [ ] **NOTE-16** Remove an assigned NOTE label; confirm it is absent from
  the note after reload and the label itself remains available.
- [ ] **NOTE-17** Open label selection on a narrow screen; confirm search,
  selected chips, and dismissal remain operable with the mobile keyboard.

#### Flow: Archive a note

- [ ] **NOTE-18** Archive a disposable note; confirm it leaves the active
  list and the product identifies the archive action clearly.
- [ ] **NOTE-19** Reload the active Notes list; confirm the archived note does
  not reappear among active notes.

#### Flow: Restore an archived note

- [ ] **NOTE-20** Open archived notes and restore one disposable archived
  note; confirm it returns to the active list with its content and labels
  intact.
- [ ] **NOTE-21** Reload the active list; confirm the restored note remains
  active and its archived copy is not duplicated.

#### Flow: Search for a note

- [ ] **NOTE-22** Search by a distinctive note title; confirm matching notes
  are shown and non-matching notes are excluded.
- [ ] **NOTE-23** Reload or use browser Back/Forward with a search query;
  confirm the Notes URL and displayed results stay in sync.

#### Flow: Open a note from its direct URL

- [ ] **NOTE-24** Open a note by its direct `/notes/:id` URL; confirm an
  owned note opens and an unknown, archived, or foreign note produces a safe
  unavailable state.

### Paths

#### Flow: Create a Path

- [ ] **PATH-01** Create one Path with a unique name; confirm it appears in
  the Paths list and can be selected in the relevant product controls.
- [ ] **PATH-02** Create a Path with a description and selected color; confirm
  both values are visible after a fresh load.
- [ ] **PATH-03** Submit a blank or whitespace-only name; confirm validation
  explains the problem and does not create a record.
- [ ] **PATH-04** Attempt a duplicate name; confirm a recoverable error is
  shown and the existing Path is not overwritten.

#### Flow: Edit a Path

- [ ] **PATH-05** Edit a Path name and description; confirm the saved values
  appear in the list and its related Path board.
- [ ] **PATH-06** Change a Path color and text color; confirm the selected
  state has a non-color cue and remains legible in light and dark themes.
- [ ] **PATH-07** Cancel a Path edit; confirm unsaved values are discarded
  and the persisted values remain unchanged after reload.
- [ ] **PATH-08** Cause a Path save to fail in the approved environment;
  confirm the error is visible and the user can recover without losing the
  intended edits.

#### Flow: Pin a Path

- [ ] **PATH-09** Pin a Path; confirm its pressed state and list ordering are
  clear and remain consistent after reload.
- [ ] **PATH-10** Unpin the Path; confirm it no longer has the pinned state
  and can be pinned again.

#### Flow: Change Path board visibility

- [ ] **PATH-11** Hide a Path board; confirm the product asks for confirmation
  and explains that its cards are retained.
- [ ] **PATH-12** Cancel the hide confirmation; confirm the board remains
  visible and its cards remain accessible.
- [ ] **PATH-13** Confirm the hide action; confirm the board disappears from
  visible board navigation while its cards remain preserved.
- [ ] **PATH-14** Show the hidden board again; confirm the board and its
  retained cards return after a fresh load.

#### Flow: Merge two Paths

- [ ] **PATH-15** Choose a distinct target Path for a disposable source Path;
  confirm the target picker identifies the intended source and target.
- [ ] **PATH-16** Cancel the merge confirmation; confirm neither Path nor its
  related records change.
- [ ] **PATH-17** Confirm the merge; confirm the source Path is removed, its
  eligible sessions move to the target, and the target remains available.
- [ ] **PATH-18** Attempt to merge a Path into itself or an unavailable target;
  confirm invalid targets cannot be selected or saved.
- [ ] **PATH-19** Reload Path and related record views; confirm the merge is
  reflected consistently and no source Path remains selectable.

#### Flow: Remove a Path

- [ ] **PATH-20** Request removal of a disposable Path; confirm a confirmation
  explains the short undo window before removal.
- [ ] **PATH-21** Cancel removal; confirm the Path remains unchanged.
- [ ] **PATH-22** Confirm removal; confirm the Path leaves the active list and
  a time-limited Undo action is announced and visible.

#### Flow: Undo Path removal

- [ ] **PATH-23** Activate Undo while the recovery action is available;
  confirm the Path returns to the active list.
- [ ] **PATH-24** Reload Paths and related board views; confirm the restored
  Path and its associations remain available.
- [ ] **PATH-25** Let the undo window expire without selecting Undo; confirm
  the transient action disappears and the product does not imply recovery is
  still available.

#### Flow: Open Path history

- [ ] **PATH-26** Open a Path's history; confirm related sessions, logs, notes,
  or board items shown by the product link to the correct owned resource.
- [ ] **PATH-27** Load `/paths/:id` directly and use browser Back; confirm the
  expected Path history context opens and the return destination is usable.
- [ ] **PATH-28** Load a missing or foreign Path ID; confirm no other user's
  Path details or related records are disclosed.

### Logs

#### Flow: Create a Log

- [ ] **LOG-01** Create a Log with a short body and explicit timestamp;
  confirm it appears once with the submitted time.
- [ ] **LOG-02** Create a Log using the browser-time default; confirm the
  displayed timestamp follows the chosen local time zone and is readable.
- [ ] **LOG-03** Submit empty or whitespace-only Log text; confirm the user
  receives clear validation and no empty Log is created.
- [ ] **LOG-04** Create a multi-line, long Log entry; confirm it remains
  readable and does not overflow its row or detail view.
- [ ] **LOG-05** Reload Logs; confirm the created Log and its timestamp remain
  persisted.

#### Flow: Edit a Log

- [ ] **LOG-06** Edit Log text; confirm the saved row reflects the new text.
- [ ] **LOG-07** Edit a Log timestamp; confirm the displayed time reflects the
  saved value after reload.
- [ ] **LOG-08** Cancel a Log edit; confirm the original text and timestamp
  remain unchanged.
- [ ] **LOG-09** Cause an edit request to fail; confirm the typed text remains
  available for retry and the failure is explained.
- [ ] **LOG-10** Open `/logs/:id` directly; confirm the selected owned Log is
  shown and missing or foreign IDs display a safe unavailable result.

#### Flow: Assign labels to a Log

- [ ] **LOG-11** Assign a LOG-scope label; confirm it appears on the Log and
  remains after reload.
- [ ] **LOG-12** Remove a Log label; confirm the assignment is removed without
  deleting the Log or label.
- [ ] **LOG-13** Attempt to assign a label outside the LOG scope; confirm the
  product does not silently apply an unsupported assignment.

#### Flow: Search Logs

- [ ] **LOG-14** Search for a distinctive Log phrase; confirm matching rows
  are returned and the empty-result state gives a clear next step.
- [ ] **LOG-15** Reload a filtered Logs URL and use Back/Forward; confirm the
  query and displayed results remain synchronized.
- [ ] **LOG-16** Clear the search; confirm the full applicable list returns
  and focus remains in a predictable location.

#### Flow: Page through Logs

- [ ] **LOG-17** Move to the next Logs page; confirm a distinct page of rows
  appears and the current page is communicated.
- [ ] **LOG-18** Return to the previous Logs page; confirm the earlier rows
  return without duplicate or missing entries.
- [ ] **LOG-19** Reach the first and last page; confirm unavailable paging
  directions cannot be activated.

#### Flow: Remove a Log

- [ ] **LOG-20** Request Log removal; confirm the irreversible action is
  described before it is committed.
- [ ] **LOG-21** Cancel Log removal; confirm the Log remains visible and
  unchanged.
- [ ] **LOG-22** Confirm Log removal; confirm the row disappears and remains
  absent after a fresh load.

### Labels

#### Flow: Create a Label

- [ ] **LABEL-01** Create a uniquely named Label with a color and selected
  usage scopes; confirm it appears in the Labels list.
- [ ] **LABEL-02** Confirm the Label is available only to the selected product
  surfaces (Notes, Calendar, Sessions, Logs, or Boards).
- [ ] **LABEL-03** Submit a blank or whitespace-only name; confirm validation
  and no Label creation.
- [ ] **LABEL-04** Submit a duplicate name; confirm a useful error and no
  accidental replacement of the existing Label.

#### Flow: Edit a Label

- [ ] **LABEL-05** Change a Label's name and color; confirm the updated values
  appear in the Labels list and in its assigned records.
- [ ] **LABEL-06** Change a Label's available scopes when it has no conflicting
  assignments; confirm the new scope availability persists after reload.
- [ ] **LABEL-07** Remove a scope that still has assignments; confirm the
  product explains the conflict and preserves the Label and assignments.
- [ ] **LABEL-08** Cancel an edit; confirm saved Label values remain unchanged.

#### Flow: Find a Label

- [ ] **LABEL-09** Search by a Label name; confirm matching Labels are shown
  and a no-match query has a clear empty state.
- [ ] **LABEL-10** Reload or navigate Back/Forward with a Label search query;
  confirm URL and visible results agree.

#### Flow: Remove a Label

- [ ] **LABEL-11** Remove an unused disposable Label; confirm the action is
  confirmed and the Label is absent after reload.
- [ ] **LABEL-12** Attempt to remove a Label with assignments; confirm the
  product explains that assignments must be removed first and preserves all
  assigned records.

#### Flow: Review Label history

- [ ] **LABEL-13** Open `/labels/:id` for an owned Label; confirm its history
  totals, timeline, and related-label trail are associated with that Label.
- [ ] **LABEL-14** Open a related record from Label history; confirm it opens
  the matching owned Note, Log, Session, or other supported record.
- [ ] **LABEL-15** Close Label history; confirm the Labels list and prior
  search context remain available.
- [ ] **LABEL-16** Open history for a Label with no records; confirm an empty
  state is shown rather than an error or unrelated history.
- [ ] **LABEL-17** Open a missing or foreign Label ID; confirm the application
  does not disclose another account's history.

### Calendar

#### Flow: Select a calendar month and day

- [ ] **CAL-01** Open Calendar; confirm the selected month and year are
  identified and the day grid labels its weekday columns.
- [ ] **CAL-02** Move to the previous and next month; confirm the grid and
  month heading change together across year boundaries.
- [ ] **CAL-03** Choose a month and year from the controls; confirm the
  displayed grid corresponds to the selected values.
- [ ] **CAL-04** Open `/calendar?date=YYYY-MM-DD`; confirm a valid date selects
  its day and an invalid date is handled without a broken calendar.

#### Flow: Save a calendar day

- [ ] **CAL-05** Select a day and enter a day note; save and confirm the note
  appears for that date after a fresh load.
- [ ] **CAL-06** Edit a saved day note; confirm the new value persists and the
  prior value is not shown as current.
- [ ] **CAL-07** Clear a day note; confirm the cleared value remains empty
  after reload.
- [ ] **CAL-08** Cause a day save to fail; confirm the user sees an error and
  can retry without losing the current draft.

#### Flow: Assign calendar labels to a day

- [ ] **CAL-09** Assign a CALENDAR-scope Label to one day; confirm its name
  and allocation are visible on the selected day and persist after reload.
- [ ] **CAL-10** Change a calendar Label color; confirm the selected color is
  applied to the calendar and remains readable with a text/name cue.
- [ ] **CAL-11** Remove a calendar Label from a day; confirm only the
  assignment is removed and the Label remains available elsewhere.
- [ ] **CAL-12** Create a new calendar Label from the day editor; confirm it
  becomes available for the day and appears in Label management.

#### Flow: Apply calendar labels to a date range

- [ ] **CAL-13** Select a start and end date; confirm each included day is
  identified as part of the selected range.
- [ ] **CAL-14** Apply a Label allocation to a range; confirm the allocation is
  saved for the intended inclusive dates after reload.
- [ ] **CAL-15** Select a reversed range; confirm the UI normalizes or explains
  the date order and does not silently apply an unintended range.
- [ ] **CAL-16** Cancel a selected range; confirm no unsaved day or range
  changes are committed.
- [ ] **CAL-17** Use keyboard and touch to select an equivalent date range;
  confirm range selection does not require a finicky pointer drag alone.
- [ ] **CAL-18** Check leap day, month end, and year end; confirm the range
  includes exactly the selected dates in the account's local time zone.

### Reports

#### Flow: Filter Reports by date range

- [ ] **REPORT-01** Open `/reports`; confirm the initial report interval,
  current date range, and loading/empty/error feedback are understandable.
- [ ] **REPORT-02** Select each available daily, weekly, monthly, quarterly,
  and yearly interval; confirm totals and date boundaries update for that
  interval.
- [ ] **REPORT-03** Select a custom date range; confirm its displayed start
  and end match the selected dates and include the documented boundary days.
- [ ] **REPORT-04** Move to the previous and next report interval; confirm the
  selected interval advances by the correct unit without changing its type.
- [ ] **REPORT-05** Reload a Reports URL with date parameters; confirm the
  selected range is restored from the URL.
- [ ] **REPORT-06** Navigate away and use Back/Forward; confirm report range
  and query state restore with the route.
- [ ] **REPORT-07** Supply malformed or incomplete date parameters; confirm a
  safe default or validation outcome rather than an invalid range display.

#### Flow: Filter Reports by Path

- [ ] **REPORT-08** Select one Path filter; confirm the report totals and
  breakdown use the selected Path only.
- [ ] **REPORT-09** Clear the Path filter; confirm the unfiltered report
  returns and its URL no longer implies a Path restriction.
- [ ] **REPORT-10** Reload a Path-filtered Reports URL; confirm the selected
  Path and visible data remain aligned.

#### Flow: Filter Reports by Label

- [ ] **REPORT-11** Select one Label filter; confirm report totals and source
  rows reflect the selected Label.
- [ ] **REPORT-12** Clear the Label filter; confirm unfiltered report data
  returns and the URL state is cleared.

#### Flow: Group report breakdowns

- [ ] **REPORT-13** Change the report grouping; confirm the breakdown groups
  rows by the selected dimension and reports its empty state when appropriate.
- [ ] **REPORT-14** Reload a grouped Reports URL; confirm the grouping and
  date range are restored together.

#### Flow: Read report charts and tables

- [ ] **REPORT-15** Review tracked-time totals and breakdowns; confirm units,
  zero values, selected range, and locale-aware duration labels are clear.
- [ ] **REPORT-16** Open and close the Sankey visualization; confirm its
  control communicates its state and its information has a usable text/table
  alternative.
- [ ] **REPORT-17** Toggle the trendline; confirm its visible state and chart
  data agree and can be restored after returning to the route.
- [ ] **REPORT-18** Review no-data, zero-duration, and missing Path/Label
  reports; confirm they render a clear empty/zero state rather than a broken
  chart.

#### Flow: Open a report source record

- [ ] **REPORT-19** Open a source record from a report; confirm it reaches the
  correct owned Session, Log, Calendar day, Path, or Label context.

### Settings and account

#### Flow: Change and persist the appearance preference

- [ ] **SET-01** Choose each supported appearance preference; confirm the
  current page changes to the selected appearance.
- [ ] **SET-02** Navigate to another route and reload; confirm the selected
  appearance remains in effect.
- [ ] **SET-03** Check forms, native selects, dialogs, charts, and report
  controls in light and dark appearance; confirm labels, focus, and values
  remain legible.

#### Flow: Change the account password

- [ ] **SET-04** On a disposable account, set a password when one is not
  configured; confirm the success message and sign-in methods update.
- [ ] **SET-05** On a disposable account with a password, submit the current
  password and a new matching password; confirm the password change succeeds
  and a subsequent sign-in can use the new password.
- [ ] **SET-06** Submit mismatched confirmation values; confirm inline or
  adjacent feedback explains the error and no password change occurs.
- [ ] **SET-07** Submit an incorrect current password; confirm the product
  reports a recoverable failure and retains no misleading success state.
- [ ] **SET-08** Check password manager autofill and paste behavior; confirm
  the form uses appropriate autocomplete metadata and does not block paste.

#### Flow: Export Knowledge Base data

- [ ] **SET-09** Request a Knowledge Base CSV export; confirm a usable
  `knowledge-base-export.csv` download is produced with a success message.
- [ ] **SET-10** Open the export; confirm expected records, Unicode, commas,
  quotes, and line breaks are represented safely and consistently.
- [ ] **SET-11** Confirm the export contains only the signed-in account's data
  and does not include credentials, access tokens, or another user's records.
- [ ] **SET-12** Make export unavailable in the approved environment; confirm
  the page reports failure and offers a retry without claiming a download.

### Imports and transfer history

#### Flow: Import a Knowledge Base CSV

- [ ] **IMPORT-01** Choose a valid Knowledge Base CSV through the file picker;
  confirm its contents are accepted and the import summary reports imported,
  skipped, and created Path counts where applicable.
- [ ] **IMPORT-02** Paste a valid Knowledge Base CSV; confirm it follows the
  same import behavior as file selection.
- [ ] **IMPORT-03** Import a CSV containing existing/conflicting rows; confirm
  those rows are skipped and existing records remain unchanged.
- [ ] **IMPORT-04** Submit malformed, unsupported, or empty CSV content;
  confirm an actionable error and no misleading completed-import status.
- [ ] **IMPORT-05** Reload after a successful import; confirm imported records
  are visible in their owning product areas.

#### Flow: Import a Clockify report in the web app

- [ ] **IMPORT-06** Select the Clockify source and submit a valid disposable
  export; confirm the summary reports imported and duplicate-skipped rows.
- [ ] **IMPORT-07** Submit invalid or oversized Clockify content; confirm the
  product explains the failure and does not report a successful import.
- [ ] **IMPORT-08** Reload after a successful Clockify import; confirm its
  completed sessions and any created Paths are visible in the product.

#### Flow: Review import history

- [ ] **IMPORT-09** Confirm each successful import creates one history batch
  with source, date, imported count, skipped count, and created Path count.
- [ ] **IMPORT-10** Move through import-history pages; confirm each page has
  correct batch rows and first/last page controls are bounded.
- [ ] **IMPORT-11** Reload Imports; confirm batch history and undone status
  remain accurate.

#### Flow: Undo a Knowledge Base import batch

- [ ] **IMPORT-12** Request undo for a Knowledge Base batch; confirm the
  product identifies the source/date and asks for confirmation.
- [ ] **IMPORT-13** Cancel undo; confirm imported records and batch status
  remain unchanged.
- [ ] **IMPORT-14** Confirm undo; confirm only records owned by that batch are
  removed, the batch is marked undone, and the summary reports the effect.
- [ ] **IMPORT-15** Reload the affected pages and history; confirm the undone
  records remain absent and the batch cannot be undone a second time.

#### Flow: Undo a Clockify import batch

- [ ] **IMPORT-16** Request undo for a Clockify batch; confirm source and
  batch identity are clear before confirmation.
- [ ] **IMPORT-17** Cancel undo; confirm the imported Clockify records remain.
- [ ] **IMPORT-18** Confirm undo; confirm the batch's imported sessions,
  activity records, and newly created Paths are removed as described.
- [ ] **IMPORT-19** Reload sessions, Paths, and Imports; confirm the batch is
  marked undone and unrelated pre-existing records remain intact.

## Shared persistence, session recovery, and ownership flows

#### Flow: Recover an authenticated deep link after sign-in

- [ ] **RECOVERY-01** Open a protected milestone-four route while signed out;
  confirm protected content is hidden until authentication completes.
- [ ] **RECOVERY-02** Sign in with a disposable account; confirm the original
  requested internal route is restored.
- [ ] **RECOVERY-03** Use an unsafe external or protocol-relative return value;
  confirm the browser remains on Knowledge Base.

#### Flow: Recover from an expired web session

- [ ] **RECOVERY-04** Let or configure a disposable session to expire; confirm
  a protected request returns the user to the signed-out state with a clear
  recovery path.
- [ ] **RECOVERY-05** Sign in again; confirm the user can reopen the route and
  that unsaved form text is either preserved or its loss is clearly disclosed.
- [ ] **RECOVERY-06** Confirm a stale response for a replaced session does not
  sign out the currently authenticated account.

#### Flow: Enforce record ownership in web routes

- [ ] **OWNER-01** Open a foreign or unknown Note, Path, Log, Label, or other
  directly addressable record ID; confirm the application shows no protected
  details and gives a safe unavailable result.
- [ ] **OWNER-02** Attempt to use a foreign Path, Label, board, or other
  referenced ID in an owned record flow; confirm the reference is rejected
  without mutating either account's data.
- [ ] **OWNER-03** Open report, calendar, or history links derived from owned
  data; confirm every linked record remains within the signed-in account.

#### Flow: Recover from a failed web save

- [ ] **RECOVERY-07** Cause a save request to fail in the approved
  environment; confirm an explicit error is shown and no success message is
  presented.
- [ ] **RECOVERY-08** Retry the failed save after the service is available;
  confirm the final persisted state contains one intended change.
- [ ] **RECOVERY-09** Reload after the rejected save; confirm the UI matches
  server state and does not retain an optimistic value as if it had saved.

#### Flow: Recover from a rejected web import

- [ ] **RECOVERY-10** Submit invalid import content; confirm an actionable
  error appears without a completed-import state or unintended partial data.
- [ ] **RECOVERY-11** Correct the import and retry; confirm the completed
  batch and imported records match the single successful submission.

#### Flow: Recover from a failed web removal

- [ ] **RECOVERY-12** Cause a removal request to fail; confirm the record
  remains available, the error is visible, and a fresh load reflects server
  state.

## Mobile Chrome web application flows

Run the corresponding single-responsibility web flows above in Android Chrome
and record outcomes separately. The criteria here cover mobile-specific
interaction and layout behavior; they do not replace the action and persistence
criteria in the named flows.

#### Flow: Navigate milestone-four routes in mobile Chrome

- [ ] **MOBILE-01** Reach each milestone-four route using the responsive
  navigation and confirm no destination is hidden or unreachable at phone
  width.
- [ ] **MOBILE-02** Use the responsive navigation to open Notes, Paths, Logs,
  Labels, Calendar, Reports, Settings, and Imports; confirm each destination
  can be reached at phone width.

#### Flow: Restore mobile browser history

- [ ] **MOBILE-03** Use Chrome Back and Forward after opening a deep link and
  changing a filter; confirm route, query, and visible selection return
  together.
- [ ] **MOBILE-04** Open the on-screen keyboard in Notes, Logs, Imports, and
  Settings; confirm focused fields and submit/recovery controls remain visible
  or can be reached without losing input.
- [ ] **MOBILE-05** Verify browser zoom remains enabled and text remains
  readable at narrow width and enlarged text settings.

#### Flow: Keep mobile report controls reachable

- [ ] **MOBILE-06** Open Reports with the floating timer visible; confirm its
  fixed position does not cover the date range, Path/Label filters, grouping,
  or their focused controls.
- [ ] **MOBILE-07** Scroll Reports and open filter controls; confirm the
  floating timer can be moved, collapsed, or otherwise does not block the
  selected control or its result.
- [ ] **MOBILE-08** Rotate or resize the phone viewport; confirm report charts,
  tables, and filter controls remain usable without unintended horizontal
  scrolling.

#### Flow: Create a note in mobile Chrome

- [ ] **MOBILE-09** Create a Note using touch; confirm the editor,
  label picker, save feedback, and navigation controls have usable hit areas.

#### Flow: Edit a note in mobile Chrome

- [ ] **MOBILE-10** Edit a Note using touch; confirm the mobile keyboard keeps
  the active text and current selection visible.
- [ ] **MOBILE-11** Use toolbar alternatives and any list reorder control
  without relying on a desktop-only hover action or drag gesture.

#### Flow: Keep long note text visible in mobile Chrome

- [ ] **MOBILE-12** Use the mobile keyboard with a long Note; confirm the
  active text and current selection remain visible while editing.

#### Flow: Create a Log in mobile Chrome

- [ ] **MOBILE-13** Create a Log using touch and the mobile keyboard; confirm
  timestamp, text, and submit controls remain reachable.

#### Flow: Edit a Log in mobile Chrome

- [ ] **MOBILE-14** Edit a Log using touch; confirm the edited timestamp and
  text remain reachable and the save error preserves the draft.

#### Flow: Create a Path in mobile Chrome

- [ ] **MOBILE-15** Create a Path using touch; confirm dialogs fit, fields
  remain visible above the keyboard, and save/cancel controls work.

#### Flow: Edit a Path in mobile Chrome

- [ ] **MOBILE-16** Edit a Path using touch; confirm dialogs fit,
  fields remain visible above the keyboard, and save/cancel controls work.

#### Flow: Confirm a Path merge in mobile Chrome

- [ ] **MOBILE-17** Complete Path merge confirmation on a phone; confirm the
  source/target identity and irreversible result are readable before commit.

#### Flow: Undo Path removal in mobile Chrome

- [ ] **MOBILE-18** Use Path removal Undo on a phone; confirm the action is
  visible long enough and does not cover the control needed to activate it.

#### Flow: Create a Label in mobile Chrome

- [ ] **MOBILE-19** Create a Label using touch; confirm scope options,
  color selection, field errors, and dialog dismissal are operable.

#### Flow: Edit a Label in mobile Chrome

- [ ] **MOBILE-20** Edit a Label using touch; confirm scope options, color
  selection, field errors, and dialog dismissal are operable.

#### Flow: Review Label history in mobile Chrome

- [ ] **MOBILE-21** Review Label history on a phone; confirm related records
  remain readable and links are not clipped.

#### Flow: Save a calendar day note in mobile Chrome

- [ ] **MOBILE-22** Select a calendar day and save its note using touch;
  confirm the date grid does not require hover.

#### Flow: Assign a calendar label in mobile Chrome

- [ ] **MOBILE-23** Assign a calendar Label to one day using touch; confirm
  the date grid does not require hover and the allocation remains visible.

#### Flow: Select a calendar range in mobile Chrome

- [ ] **MOBILE-24** Select a calendar range with a tap/click alternative to
  dragging; confirm start/end dates and Apply/Cancel controls remain visible.

#### Flow: Import a CSV in mobile Chrome

- [ ] **MOBILE-25** Select a CSV file or paste import text in mobile Chrome;
  confirm the file picker, textarea, status summary, and recovery controls
  remain usable.

#### Flow: Undo an import batch in mobile Chrome

- [ ] **MOBILE-26** Review and undo an import batch on a phone; confirm
  confirmation text, batch identity, and undo status do not overflow.

#### Flow: Change preferences in mobile Chrome

- [ ] **MOBILE-27** Change the appearance preference on a phone; confirm the
  native select is operable and the selected theme is clear.

#### Flow: Navigate Settings tabs in mobile Chrome

- [ ] **MOBILE-28** Open the Account, Import, and Export tabs on a phone;
  confirm the selected tab state and panel content remain operable.

#### Flow: Download an export in mobile Chrome

- [ ] **MOBILE-29** Download an export on a phone; confirm Chrome completes
  the download and the product provides a clear success or recovery message.

#### Flow: Reach mobile touch targets

- [ ] **MOBILE-30** Confirm interactive targets are comfortably touchable and
  adjacent controls do not activate accidentally.

#### Flow: Keep mobile content within the viewport

- [ ] **MOBILE-31** Confirm no content, dialog, chart, or toolbar causes
  unintended horizontal page overflow at phone width.

#### Flow: Keep mobile focus and actions unobscured

- [ ] **MOBILE-32** Confirm sticky/floating controls never obscure keyboard
  focus, modal controls, snackbar Undo actions, or the current text field.

#### Flow: Use mobile alternatives for drag gestures

- [ ] **MOBILE-33** Confirm calendar range selection, Path ordering, and any
  other drag gesture has a tap/click or keyboard alternative.

## Chrome extension flows (desktop Chrome)

These flows cover the current extension popup, API Settings page, background
service worker, and Clockify report content integration. Do not mark a mobile
Chrome extension result as passed: standard Chrome for Android does not host
desktop Manifest V3 extensions.

#### Flow: Install the Knowledge Base extension

- [ ] **EXT-01** Install the intended extension package in desktop Chrome;
  confirm Chrome recognizes the Knowledge Base product and package identity.
- [ ] **EXT-02** Review the requested `storage` and `identity` permissions
  and host access for the configured Knowledge Base API and Clockify report
  pages; confirm each request has a product purpose.
- [ ] **EXT-03** Deny optional or host access where Chrome permits; confirm
  affected extension features explain the missing access and unaffected
  popup/settings features remain usable.

#### Flow: Open the extension Tracker popup

- [ ] **EXT-04** Open the extension popup; confirm the Tracker page has a
  clear Knowledge Base identity and a descriptive page title.

#### Flow: Open extension API Settings

- [ ] **EXT-05** Open API Settings in a new tab; confirm its Knowledge Base
  identity and page title are clear.

#### Flow: Configure the extension API endpoint

- [ ] **EXT-06** Enter the approved local API base URL and save it; confirm a
  success status is announced.
- [ ] **EXT-07** Close and reopen the popup; confirm the saved API endpoint
  remains active.
- [ ] **EXT-08** Submit an invalid URL or a URL with an unsupported scheme;
  confirm validation prevents a misleading successful connection.
- [ ] **EXT-09** Point the extension at an unavailable API; confirm the user
  receives a clear connection error and can correct the endpoint.

#### Flow: Sign in to the extension with email and password

- [ ] **EXT-10** Sign in with a disposable account using the popup email and
  password form; confirm the authenticated Tracker workspace opens.
- [ ] **EXT-11** Submit invalid credentials; confirm an actionable error and
  retained sign-in form are shown without exposing credentials.

#### Flow: Sign in to the extension with Google

- [ ] **EXT-13** Complete Google sign-in when enabled for the local
  environment; confirm the authorized account is connected to the extension.

#### Flow: Sign out from the extension

- [ ] **EXT-14** Sign out from the extension menu; confirm authenticated timer
  and note content is hidden until the next sign-in.

#### Flow: Start an extension timer

- [ ] **EXT-15** Select an owned Path and start the timer; confirm the popup
  displays running state and elapsed time.
- [ ] **EXT-16** Add a session description and supported labels; confirm the
  saved timer and web timer show the same Path, description, and labels.
- [ ] **EXT-17** Start a timer already running in the web app; confirm the
  extension reconciles to the single server-owned timer instead of creating a
  second running timer.
- [ ] **EXT-18** Change the selected Path or labels before starting; confirm
  the draft selection is retained and then used for the new timer.

#### Flow: Stop an extension timer

- [ ] **EXT-19** Stop a running extension timer; confirm it becomes a
  completed session in the web app and remains present after a fresh read.
- [ ] **EXT-20** Stop the timer from the web app while the extension popup is
  open; confirm the extension refreshes to the stopped server state.
- [ ] **EXT-21** Reload the popup after stopping; confirm no stale running
  timer is restored from extension-local cache.

#### Flow: Edit extension timer start time

- [ ] **EXT-22** Open the running timer's start-time editor; confirm current
  date and time are shown and can be canceled without changing the timer.
- [ ] **EXT-23** Save a valid corrected start time; confirm the web app and
  extension display the corrected server value.
- [ ] **EXT-24** Enter a future or invalid start time; confirm validation
  prevents the change and focuses or identifies the invalid field.

#### Flow: Open the Notes tab in the extension popup

- [ ] **EXT-25** Open the Notes tab; confirm owned notes load and an empty
  workspace offers a clear create action.

#### Flow: Create a note in the extension popup

- [ ] **EXT-26** Create a note from the extension; confirm it appears in the
  web Notes list after a fresh load.

#### Flow: Edit a note in the extension popup

- [ ] **EXT-27** Edit an existing extension note; confirm title and content
  save and remain after closing and reopening the popup.

#### Flow: Format a note in the extension popup

- [ ] **EXT-28** Use supported Markdown shortcuts and task-list syntax; confirm
  content remains readable and compatible in the web editor.

#### Flow: Reopen the current note in the extension popup

- [ ] **EXT-29** Close the popup while a note is open and reopen it; confirm
  the open-note context is restored without losing saved content.

#### Flow: Recover from an extension note save failure

- [ ] **EXT-30** Cause a note save to fail; confirm the popup shows a
  recoverable error and does not claim unsaved text was saved.

#### Flow: Show Clockify integration on a supported report

- [ ] **EXT-31** Open a supported Clockify detailed report; confirm the
  Knowledge Base overlay appears only on the supported report route.

#### Flow: Disable Clockify import

- [ ] **EXT-32** Disable Clockify import in the extension settings menu;
  confirm the report overlay stops importing and communicates the disabled
  state.

#### Flow: Enable Clockify import

- [ ] **EXT-33** Re-enable Clockify import; confirm the overlay returns on a
  supported report page.

#### Flow: Import a valid Clockify report from the extension

- [ ] **EXT-34** Import a valid disposable Clockify report; confirm the
  overlay reports imported, duplicate-skipped, and new Path counts.
- [ ] **EXT-35** Confirm the imported sessions and new Paths are visible in
  Knowledge Base after a fresh web read.

#### Flow: Open an unsupported Clockify route

- [ ] **EXT-36** Open an unsupported Clockify page or report route; confirm no
  import is attempted and the page remains usable.

#### Flow: Handle invalid Clockify report content

- [ ] **EXT-37** Submit malformed or oversized Clockify report data; confirm
  validation is explained and no incorrect import count is reported.
- [ ] **EXT-38** Re-import duplicate Clockify report data; confirm repeated
  rows are reported as skipped and existing sessions are not duplicated.

#### Flow: Recover the extension after service-worker restart

- [ ] **EXT-39** Close the popup, allow the service worker to stop, then open
  the popup again; confirm current timer state is recovered from the API.
- [ ] **EXT-40** Restart or update the extension while a server timer is
  active; confirm the current timer is reconciled and no duplicate is started.
- [ ] **EXT-41** Restart while an extension note editor is open; confirm saved
  note context can be reopened and unsaved text is not falsely represented as
  saved.

#### Flow: Recover extension authentication

- [ ] **EXT-42** Expire or revoke the disposable extension session; confirm a
  rejected API response leads to a sign-in recovery state.
- [ ] **EXT-43** Sign in again; confirm the extension can reload the current
  timer, Paths, labels, and Notes without stale account state.
- [ ] **EXT-44** Confirm extension error messages and browser-visible logs do
  not contain access tokens, passwords, or full authorization headers.

#### Flow: Recover from an unavailable extension API

- [ ] **EXT-45** Make the configured Knowledge Base API unavailable; confirm
  timer and Notes actions show recoverable errors and saved server state is
  not fabricated from cache.
- [ ] **EXT-46** Restore API availability; confirm retry refreshes the current
  timer and does not duplicate a stopped or running session.

#### Flow: Recover from denied Knowledge Base API host access

- [ ] **EXT-47** Remove or deny API host permission where supported; confirm
  the extension explains how to restore access and does not show a false
  successful sync.

#### Flow: Recover from denied Clockify host access

- [ ] **EXT-48** Block Clockify host access; confirm only the Clockify overlay
  integration is affected and normal Tracker and Notes actions still work.

#### Flow: Handle an unexpected API redirect or CORS rejection

- [ ] **EXT-49** Confirm an unexpected API redirect or rejected CORS request is
  surfaced as an error with a safe recovery path.

## Completion review

- [ ] **DONE-01** Every applicable flow has an independent desktop web,
  Android Chrome web, or desktop extension result recorded; unsupported
  contexts are explicitly marked not applicable with the platform reason.
- [ ] **DONE-02** Every successful mutation has a fresh read proving the
  corresponding user-visible state persisted.
- [ ] **DONE-03** Negative, empty, loading, unavailable-service, and recovery
  states are recorded for flows where those states apply.
- [ ] **DONE-04** Each reported issue identifies the route or extension
  surface, exact user action, expected result, observed result, browser/device,
  and redacted evidence reference.
- [ ] **DONE-05** No acceptance result claims a physical mobile-device pass
  based only on desktop viewport emulation.
- [ ] **DONE-06** No native iOS flow or iOS application result is included.
