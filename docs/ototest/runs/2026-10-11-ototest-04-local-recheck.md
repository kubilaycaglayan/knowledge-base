# 2026-10-11 OTOTEST-04 local recheck

This record captures local reruns of the existing OTOTEST-04 real-stack
journeys and headed browser acceptance. It is supporting evidence for the
[OTOTEST-04 product acceptance checklist](../04-acceptance-checklist.md), not
a claim of human manual interaction or live-provider acceptance. Android-only
acceptance was removed from scope; remaining unchecked criteria and their
evidence limits are stated in the checklist.

## Environment

- Repository revision: `ce59becd` (`test/ototest-05-traceability-gates`).
- Initial API and application source revision: `ce59becd`; the Path, Logs, and
  Labels acceptance test files contain OTOTEST-04 journey additions recorded
  below. The final Labels run includes the LABEL-04 service fix following
  regression commit `596a19f0`; the fix is committed as `1c6382a3`.
- Expanded Calendar tests ran against application revision `0899602b` with
  the uncommitted Calendar acceptance additions documented below.
- Expanded Reports/Settings tests ran against application revision `573756d7`
  with the uncommitted Reports acceptance additions documented below.
- The final Reports grouping run includes the REPORT-14 fix following
  regression commit `2af14b27`, based on application revision `a04e2b66`.
- The Reports preset run includes the REPORT-04 fix following regression
  commit `b4030059`, based on application revision `ac944ad9`. Its final case
  fixes the browser clock to 2024-02-29 at 12:00 UTC; server time is unchanged.
- Host: Ubuntu `26.04.1 LTS`, Linux x86_64.
- Browsers: Playwright Chromium `153.0.8010.12` and Google Chrome
  `155.0.8059.39`. Web journeys ran headless at desktop viewports; the Chrome
  extension attempt also ran under Xvfb.
- Account/data: disposable test accounts and records created by the isolated
  real-stack runners; no production or personal data.
- Stack: each runner used a unique Compose project and disposable database.
- Cleanup: successful and failed runners used unique Compose projects and
  project-scoped teardown; no matching E2E containers remained after the run.
- Test date/time zone: 2026-10-11, UTC.
- Viewports: 1440 × 900 for the Notes, Paths, Logs, Labels, Calendar,
  Reports/Settings, Transfers, and Search journeys; 1280 × 900 for the desktop
  line-history context; 390 × 844 for phone-sized contexts (emulation); and
  1280 × 720 for the extension context's browser default.
- Themes: light for the desktop contexts and extension default; the line-history
  suite also exercised a dark 390 × 844 emulated phone context.
- Phone emulation: the Search and line-history suites were repeated using
  `BROWSER_PROFILE=iphone` in Google Chrome. This was a 390 × 844 emulated
  viewport, not a physical device or Android Chrome result.
  The Calendar suite also ran one case in a 390 × 844 Chrome context with
  `isMobile` and `hasTouch`, selecting a range through touch taps.
  The Transfers suite also ran in a 390 × 844 Google Chrome context with
  `isMobile` and `hasTouch`, using touch taps for source/history tabs and undo.
- Physical-device details: none; no Android device or ADB connection was
  available.

## Results

| Journey | Command | Playwright Chromium | Google Chrome desktop | Google Chrome phone emulation |
| --- | --- | --- | --- | --- |
| Notes and ownership | `scripts/run-notes-e2e.sh` | Pass, 2/2 before expansion | Pass, 8/8 | — |
| Boards | `scripts/run-board-e2e.sh` | Pass, 1/1 before expansion | Pass, 29/29 after failed-save reload recovery coverage | — |
| Paths | `scripts/run-paths-e2e.sh` | Pass, 5/5 before expansion | Pass, 9/9 | — |
| Logs | `scripts/run-logs-e2e.sh` | Pass, 1/1 before expansion | Pass, 7/7 | — |
| Labels | `scripts/run-labels-e2e.sh` | Pass, 1/1 before expansion | Pass, 5/5 after LABEL-04 fix | — |
| Calendar | `scripts/run-calendar-e2e.sh` | Pass, 1/1 before expansion | Pass, 5/5 desktop (6/6 suite total) | Pass, 1/1 touch-tap case (390 × 844 emulation) |
| Reports and Settings | `scripts/run-reports-settings-e2e.sh` | Pass, 1/1 before expansion | Pass, 17/17 after visualization state recovery coverage | — |
| Transfers | `scripts/run-transfers-e2e.sh` | Pass, 1/1 | Pass, 1/1 | Pass, 1/1 (390 × 844 emulation) |
| Packaged extension | `scripts/run-extension-browser-e2e.sh` | Pass, 3/3 | Failed at setup, 0/3; service worker did not start headless or under Xvfb | — |
| Global search and direct routes | `scripts/run-search-e2e.sh` | Pass, 12/12 | Pass, 13/13 | Pass, 12/12 (390 × 844 emulation) |
| Note line history | `scripts/run-line-history-e2e.sh` | Pass, 13/13 | Pass, 13/13 | Pass, 13/13 (390 × 844 emulation) |

The journeys verified selected visible results and fresh API or persisted
state, including Notes ownership rejection, supported transfer behavior,
extension popup/options configuration, Clockify content-script forwarding,
timer synchronization, and recovery from an unavailable API. Search also
covered result navigation, Back/Forward state, direct routes, missing/foreign
record privacy, empty results, and failed-request retry. Line history covered
keyboard interaction, persisted line state, and draft recovery after a failed
save. These results support relevant Notes/Logs search, direct-link, ownership,
keyboard, and recovery criteria, but do not exercise every criterion in the
product checklist, every negative/recovery branch, browser-native permission
prompts, or physical-device behavior.

The focused `frontend/scripts/nav-shell.acceptance.test.mjs` navigation case
passed 1/1 using Playwright Chromium with a 390 × 900 phone-width viewport and
mocked API responses. It reached Board, Logs, Notes, Calendar, Reports, Paths,
Labels, Settings, and the Import panel through the responsive navigation and
Settings tab. This supports the reachability portion of MOBILE-01 and MOBILE-02;
it is not a Google Chrome phone-emulation or physical Android Chrome result.

The phone-width Reports history case reproduces a direct Reports URL, changes
the Path filter by touch, opens Logs, and confirms Back/Forward restore both
the URL query and selected Path. The filter is scrolled clear of the visible
floating timer before opening. The case and the full navigation shell suite
passed after routing Reports query changes through Vue Router: 110/110 tests.
This supports the emulated browser portions of MOBILE-03 and MOBILE-06/07; the
suite uses Playwright Chromium at 390 × 900 with mocked API responses and is not
Android Chrome or physical-device evidence. Reports component tests pass 26/26
and the frontend production build succeeds.

A separate phone-width case passes 1/1 while opening the Path, Label, and
grouping filters with the floating timer visible. When a report control takes
focus, the timer hides so it cannot obscure the focused control. This adds
emulated interaction evidence for MOBILE-06/07; it does not establish Android
Chrome behavior.

The real-stack Search suite supports NOTE-22 and NOTE-23: a distinctive Notes
title query returns exactly its matching note, excludes non-matching titles,
and retains the query and filtered result after reload. The isolated
`scripts/run-search-e2e.sh` rerun passed 12/12 at revision `4fc4c6e3`; its
Playwright Chromium executable reports Google Chrome for Testing 153.0.8010.12
on Linux x86_64. The run uses an isolated disposable account and database and
does not pass the manual checklist flows.

The Notes real-stack suite passed 8/8 in Google Chrome for Testing 153.0.8010.12
on Linux x86_64. Its cases support
NOTE-01 through NOTE-08 and NOTE-10 where covered: Notes opens from main
navigation and by direct `/notes` load; a new note with a distinctive title
and content appears once and remains after reload; empty or whitespace-only
content remains recoverable without creating duplicate notes; long title and
multi-paragraph content remain within editor and document widths; title and
content persist after reload; an edit typed during a blocked save reaches the
API; and navigating away waits for the pending save. The unavailable-save case
supports NOTE-09: it injects a 503, confirms the title and body remain in the
editor, retries, and verifies the draft through a fresh API read. The archive
journey supports NOTE-20 and NOTE-24 by restoring a disposable
archived note with its NOTE label and content intact, and confirming an
archived note’s direct URL produces the unavailable state. The task-list and
history case supports NOTE-13 and NOTE-14: it creates a task-list item, toggles
it checked, verifies the checked attribute and item text through a fresh API
read, then reopens the Note and checks the rendered checkbox and persisted
content. Ctrl+Z removes an editor insertion and Ctrl+Shift+Z restores it. The
automated evidence does not mark the manual product checklist rows passed.

The formatting-toolbar case also supports NOTE-11: it applies Heading 1,
bold, italic, underline, strikethrough, bullet list, numbered list, quote, and
code block through the rendered toolbar, checks each editor structure, and
confirms the saved API document contains the expected block and mark types. A
paste case supports NOTE-12 by retaining bold formatting while removing pasted
script and image markup; fresh persisted content includes the formatting and
contains no script or event-handler markup. The Notes label case supports
NOTE-15 and NOTE-16 by assigning a NOTE-scope label, reopening the note,
removing the association, and confirming the label remains available. At a
390 × 844 viewport it also searches, selects, and dismisses the picker with
keyboard input and checks the field size and control bounds. This supports
parts of NOTE-17 but does not emulate the mobile on-screen keyboard or
physical touch input; manual device review remains open.

The built extension permission check also passed:
`node scripts/check-ototest-extension-permissions.mjs chrome-extension/.output/chrome-mv3/manifest.json`
matched the manifest's two permissions and two host permissions to the
extension matrix. This is static permission evidence, not a Chrome permission
prompt review. In Google Chrome 155, the packaged extension was absent from
`chrome://extensions` and no service worker appeared under either headless or
Xvfb launch; the three extension browser tests timed out before reaching their
product assertions. In Playwright Chromium the same packaged extension tests
passed 3/3.

The Transfers journey was expanded and rerun in Google Chrome 155 at 1440 ×
900 against the disposable real stack; it passed 1/1. The current run also
covers selecting a CSV file, importing two Paths, skipping conflicting rows,
rejecting an unsupported CSV row without leaving a previous success status,
and keeping the imported Paths unchanged after reload and undo. Clockify checks
cover malformed JSON and a 2,001-entry request returning 400 without a success
status, one successful import and one duplicate-only batch with their counts,
history after reload, canceling undo while retaining records, and confirming
undo while removing only that batch's session and newly created Path. The
history case creates six Clockify batches and verifies that each page displays
at most five rows, then reaches the original batch on page two. Fresh API reads
verify the imported session and Path and their removal. These are desktop
browser results; they do not establish Android Chrome behavior or all manual
checklist criteria. The existing checklist remains unchecked.

The same Transfers journey passed 1/1 in Google Chrome 155 phone emulation at
390 × 844. It exercised the Settings Import tab, CSV picker event, import
summary, all three Settings tabs, import-source tabs, history pagination, and
both undo confirmation flows with touch taps. The phone run found the source
tabs were 36px high and history controls 41px; both now meet the 44px target.
A rendered screen was inspected at `/tmp/ototest-04-import-mobile.png`; it has
no document-width overflow, the file input is 44px high, and the CSV editor
uses 16px text. This supports MOBILE-25/26 and MOBILE-28 only; it is not
physical-device evidence.

The focused `nav-shell.acceptance.test.mjs` phone-width case passed 1/1 for the
remaining Import and Settings keyboard-like viewport checks. At 390px width
and 320px height it keeps the Import CSV field focused and retains its text,
makes the Import action reachable, preserves the CSV after a rejected request,
and completes the retry. On Settings it retains all password entries while
the confirm field is focused, makes Change password reachable, and retains the
mismatched values when the inline validation error appears. Combined with the
existing Notes keyboard-like resize and Logs phone-width resize cases, this
adds emulated evidence for MOBILE-04. Playwright Chromium does not open a real
mobile on-screen keyboard; this is not Android Chrome or physical-device
evidence, so MOBILE-04 remains unchecked pending the specified mobile browser
interaction.

For MOBILE-05, the navigation shell suite confirms the viewport metadata does
not set `user-scalable=no` or cap `maximum-scale` at 1. It also passes 1/1
with 24px minimum text styling applied at 390px width across Logs, Notes,
Calendar, Settings, and Imports, with no horizontal page overflow. This
simulates enlarged text in Playwright Chromium; it does not exercise Chrome's
actual browser zoom or Android text-size settings, so MOBILE-05 remains
unchecked pending browser review.

For MOBILE-08, a focused phone-width Reports case passed 1/1 while resizing
between 390 × 844 portrait and 844 × 390 landscape. It checks the date range,
summary chart, and breakdown stay inside the document width and that Path and
grouping filters remain visible and reachable in both orientations. This is
Playwright Chromium viewport emulation, not a physical rotation in Android
Chrome, so MOBILE-08 remains unchecked pending the specified device review.

For MOBILE-09, a focused 390 × 844 touch-enabled Chromium case passed 1/1. It
creates a Note from the Notes list, enters a title and body, assigns a NOTE
label, waits for the Saved status, and returns to the list where the new Note
is visible. The label-picker and Back controls meet the 44px touch-target
check in this case. The API is mocked, and this is not Android Chrome or a
physical-device acceptance result, so MOBILE-09 remains unchecked.

For MOBILE-10 and MOBILE-12, the focused note editor case now uses touch at
390 × 844, moves the caret to the end of a long Note, types a draft, and
shrinks the viewport to 390 × 320. The regression check initially failed
because the caret remained below the visible area; after the resize handler
was changed to scroll by the caret's actual bounds, the caret remains visible
and the draft and selection survive restoring the viewport. The full
navigation-shell suite passed 115/115 and `npm run build` passed. These are
Playwright Chromium results with a keyboard-like viewport resize, not a real
mobile keyboard or Android Chrome run, so MOBILE-10/12 remain unchecked pending
the specified device interaction.

For MOBILE-11, the 390px touch-enabled Notes editor case now selects the
existing text and activates Bold by tapping the toolbar button; the rendered
formatting is confirmed in the editor. The existing navigation-shell suite
also exercises note ordering through its touch-sized Move up control, without
dragging. The focused toolbar case passes 1/1. This is Playwright Chromium
touch emulation, not Android Chrome or physical-device evidence, so MOBILE-11
remains unchecked.

For MOBILE-14, a focused 390 × 844 touch-enabled Chromium case passed 1/1.
It opens a Log edit, changes the text and timestamp, shrinks to a 320px-high
keyboard-like viewport, and confirms Save is reachable. A controlled 503
leaves both edited values in the form; a touch retry saves the edit. This uses
the navigation shell's mocked API, not a real-stack mobile browser or Android
Chrome, so MOBILE-14 remains unchecked pending device review.

For MOBILE-15, a focused 390px touch-enabled Chromium case passed 1/1. It
opens the Add a path dialog, cancels a disposable draft, then creates a Path
with a description. After the viewport shrinks to 320px high, the dialog stays
within the viewport, the focused field retains its value, and Add path remains
reachable. This is API-mocked viewport emulation rather than Android Chrome
with its on-screen keyboard, so MOBILE-15 remains unchecked pending device
review.

For MOBILE-16, a focused 390px touch-enabled Chromium case passed 1/1. It edits
a seeded Path, shrinks the viewport to 320px high while the description field
is active, confirms both edited values remain present and Save path is
reachable, saves the update, and reopens then cancels an edit by touch. This
uses a mocked API and viewport emulation rather than Android Chrome and its
on-screen keyboard, so MOBILE-16 remains unchecked pending device review.

For MOBILE-17, a focused 390 × 844 touch-enabled Chromium case passed 1/1. It
selects the target Path and inspects the confirmation before committing,
checking that the source and target names, session move, and source removal
are readable within the phone viewport. Confirming then leaves only the
selected target and records the expected source/target IDs in the mock API.
This is touch emulation with mocked data, not Android Chrome or a physical
phone, so MOBILE-17 remains unchecked pending device review.

For MOBILE-18, a focused 390 × 844 touch-enabled Chromium case passed 1/1. It
removes a disposable Path, waits 1.2 seconds, confirms Undo remains inside the
viewport and is the unobscured hit target, then taps it and verifies the Path
is restored through the mock API. This is viewport/touch emulation rather than
physical-phone evidence, so MOBILE-18 remains unchecked pending device review.

For MOBILE-19, a focused 390 × 844 touch-enabled Chromium case passed 1/1. It
opens the label form, confirms required-name validation focuses the empty
field without creating a record, selects a color and scope by touch, saves a
label, then reopens and cancels another draft. MOBILE-20 also has a focused
390px touch case passing 1/1: it cancels an edit, changes a label name, color,
and scope, shrinks the viewport to 320px high, confirms Save changes remains
reachable, and verifies the saved values. Both use mocked API data and
viewport emulation rather than Android Chrome, so MOBILE-19/20 remain
unchecked pending device review.

For MOBILE-21, a focused 390 × 844 touch-enabled Chromium case passed 1/1.
It opens Label history with a long, unbroken related Note title and preview,
checks the link stays within the dialog, retains its `/notes/:id` destination,
and confirms the preview and page remain visible without horizontal overflow.
This uses a mocked history response and phone viewport emulation, not Android
Chrome, so MOBILE-21 remains unchecked pending device review.

For MOBILE-23, a focused 390 × 844 touch-enabled Chromium case passed 1/1. It
selects a day, assigns a Calendar label by touch, saves it, reloads the page,
and confirms the assignment remains selected. This supports the phone
interaction and persistence criteria with mocked API data; it is not Android
Chrome or physical-device evidence, so MOBILE-23 remains unchecked.

For MOBILE-22, a focused 390px touch-enabled Chromium case passed 1/1. It taps
a calendar day without hover, enters a note, saves it, reloads, and confirms
the note remains on the selected day. For MOBILE-24, the range case now checks
the displayed start/end days, brings Cancel range and Apply to range into the
390 × 844 viewport, taps Cancel, selects the range again, and taps Apply; its
keyboard path also completes. Both cases use emulated Chromium with mocked
responses, so MOBILE-22/24 remain unchecked pending Android Chrome review.

For MOBILE-27, a focused 390 × 844 Chromium case passed 1/1. It taps the
native Theme preference select, changes it to Dark, and confirms the selected
value, active theme, and stored preference. The select is at least 44px high
with 16px text. This is browser emulation rather than Android Chrome, so
MOBILE-27 remains unchecked pending device review.

For MOBILE-29, a focused 390 × 844 Chromium case passed 1/1. It opens the
Settings Export tab by touch, confirms the download control fits the viewport
and meets the 44px target, taps it, receives `knowledge-base-export.csv`, and
sees the success status. This verifies the browser download event in emulation;
it does not check Android Chrome's download manager, so MOBILE-29 remains
unchecked pending device review.

For MOBILE-32, three focused phone-width Chromium checks passed 3/3: the
floating timer hides when a text field receives focus, Path removal Undo stays
inside the viewport and has no overlapping hit target, and the active Note
caret plus formatting controls stay reachable after a keyboard-like viewport
resize. The broader nav-shell suite also passed 127/127, including mobile
dialog and edit-control reachability checks. This is supplemental browser
emulation evidence, so MOBILE-32 remains unchecked pending Android Chrome
review.

For MOBILE-31, the nav-shell acceptance suite now sweeps all nine primary
routes at 390 × 844 and checks both document and body scroll widths against
the phone viewport. The new route sweep passes, and the full nav-shell suite
passes 127/127. Together with the existing phone-width checks for Reports,
Calendar, dialogs, Notes toolbars, and long content, this is supplemental
Chromium emulation evidence; MOBILE-31 remains unchecked pending Android
Chrome review.

For MOBILE-33, focused Chromium checks pass for Calendar range selection by
phone taps and keyboard, Path ordering by phone touch and keyboard, and Note
ordering by a phone Move control. A new Board check confirms Alt+Down on a
focused card invokes the same reorder action as drag and drop. Source review
also confirms Board status and board ordering expose arrow-key alternatives,
and Gantt date controls can be clicked to open the card editor. These checks
use emulation or source review; MOBILE-33 remains unchecked pending Android
Chrome review.

For MOBILE-30, five focused 390px touch-enabled Chromium checks passed 5/5:
primary navigation links, Log body/timestamp/Save controls, Timeline filters,
Path Move up, and Calendar day selection. The tested controls meet 44px phone
target dimensions where measured. The Path reorder case confirms one touch
changes the intended order with one write, and the Calendar case confirms the
selected day state. This is representative emulation coverage rather than a
physical adjacent-target review, so MOBILE-30 remains unchecked pending
Android Chrome review.

The Knowledge Base import history read verifies one batch for each of four
successful requests, including the duplicate-conflict request, with source and
imported/skipped/created Path counts matching each response.

On the same run, the pasted Knowledge Base Path and Clockify session/Path were
also checked in their product routes after reload. Each undo prompt was
matched to its source and the selected history row's timestamp; the Clockify
undo readback retained the account's pre-existing Path. The Knowledge Base
flow also corrected an unsupported CSV after rejection, confirmed the error
cleared on success, and retained that retry batch's Path when undoing another
batch. This supports RECOVERY-10 and RECOVERY-11: invalid content shows an
actionable error without a completed status or import batch; the corrected
retry creates exactly one successful batch and its imported Path is present
after reload.

Clockify undo initially left its batch-created Path behind and omitted the
deleted Path count from its response. Regression commit `efc1260b` records the
failing PostgreSQL integration test before the service change. The focused
PostgreSQL integration test, `ImportControllerApiTest`, and the Clockify and
Knowledge Base transfer service tests pass after the fix. The Imports view
tests pass 17/17, all frontend tests pass 859/859, and the production build
passes. The expanded real-stack Transfers test also passes in Google Chrome
155.

## Context status

| Context | Result for this recheck |
| --- | --- |
| Desktop web | 71/71 Google Chrome 155 automated desktop test cases pass, including LABEL-04, REPORT-14, REPORT-04, and the PATH-04 fix. Headless runs do not establish the complete manual checklist. |
| Android Chrome web | Blocked: no physical Android device or ADB connection was available. Search, line-history, and Calendar phone emulation passed 26/26 cases and is recorded separately. |
| Desktop Chrome extension | Blocked at test setup: Google Chrome 155 did not load the unpacked package, so 0/3 product assertions ran. The Playwright Chromium packaged-extension run passed 3/3. |

## Checklist disposition

No individual product flow was marked passed from this automated rerun. Keep the
existing flow statuses independent: the Google Chrome runs were headless and
did not collect all per-flow manual evidence required by the checklist. No
Android device or ADB connection is available on this host, so Android Chrome
criteria remain unverified. The packaged extension run passes in Playwright
Chromium but fails before its service worker starts in Google Chrome 155. The
results above can be used as supporting automated evidence when completing
the manual reviews.

The isolated Path suite passed 9/9 in Playwright's Google Chrome for Testing
153.0.8010.12 on Linux x86_64. Its create/edit case supports PATH-01, PATH-02,
PATH-05, and PATH-06 in part: a unique Path with a
description, selected background color, and custom text color appears in the
list and Timeline filter; its values remain after reload; and the name and
description edit persists. The selected palette color exposes its pressed
state, and the explicit foreground/background pair passes the app’s contrast
check with both light and dark system themes. The Timeline assertion now waits
for the native Path option to attach before checking it, avoiding a race after
route navigation. The validation case supports
PATH-03 and PATH-04 by rejecting whitespace input,
showing the creation error for a case-insensitive duplicate, and confirming the
existing Path was not replaced. The browser also confirms a Path-name duplicate
rename is rejected. Before the service fix, the duplicate-create E2E case
failed because the API accepted the duplicate. Regression commit `47c9f210`
records the PostgreSQL failing case; `PathManagementService` now checks the
user-scoped name before create and update. The focused integration test and
Path API authorization tests pass after the fix. Existing Path cases also
support PATH-09 through PATH-19 where asserted: persisted pin/unpin; hide
confirmation and cancellation; hide/show with card retention; merge
cancellation, confirmation, moved-session readback, refreshed target history,
and rejection of self/missing targets. These are desktop automated results
only; the checklist remains open pending its manual reviews.

The Path edit-recovery case supports PATH-07 and PATH-08: canceling an edit
leaves the persisted Path unchanged; an injected 503 leaves the intended name
and description in the edit form; retry succeeds and a fresh API read confirms
both values.

The removal-expiry case also supports PATH-20 through PATH-22 and PATH-25:
the confirmation explains the undo window; canceling preserves the Path; a
confirmed removal immediately removes it and exposes Undo; and after the
eight-second window the Undo action disappears while a fresh API read confirms
the Path remains deleted.

The direct-history case supports part of PATH-26 by showing an owned session
in the selected Path history, and supports PATH-27 and PATH-28 by opening an
owned Path history at `/paths/:id`, returning to the list with browser Back,
and confirming missing and foreign Path IDs disclose no Path details.

The isolated Logs suite passed 7/7 cases in Playwright's Google Chrome for
Testing 153.0.8010.12 on Linux x86_64 at 1440 × 900, with the browser-local
timestamp case using America/Los_Angeles. It adds desktop evidence for LOG-01
through LOG-09 where covered, LOG-11 through LOG-13,
LOG-20 through LOG-22, and RECOVERY-12: explicit timestamp readback; browser-time
default conversion and local display; long multiline content fitting its row
and surviving reload; UI assignment and removal of a LOG-scope label with
persisted readback; wrong-scope label rejection with unchanged assignment state;
distinctive and empty search results, query reload and Back/Forward restoration,
clear recovery, and first/last-page boundaries; empty/whitespace validation;
cancellation with unchanged text and time; a rejected edit retaining its draft
followed by one successful retry and reload; and cancelled/rejected removal
retaining the record through reload before a successful deletion. The Logs
search test now waits for restored rows after reload and browser Back before
asserting results, so its disposable pagination fixtures are cleaned up even
when the URL returns before the list data. The Search suite also passed 12/12
and supports LOG-10 by direct-loading an owned Log and
confirming missing and foreign IDs show the safe unavailable state without
disclosing the foreign body. Failures were injected only in the browser request
layer; fresh API reads continued to reach the isolated real backend. No Android
result is claimed.

The expanded Labels suite passed 5/5 cases in Google Chrome 155 after a
LABEL-04 fix. Initially, duplicate submission returned success instead of the
required useful error. A focused service regression reproduced that failure
and was committed as `596a19f0` before changing production code. The service now
rejects a trimmed, case-insensitive duplicate with 409 before changing the
existing label. The browser verifies the error and unchanged API readback.
Desktop evidence supports LABEL-03 through LABEL-10 and LABEL-12: renaming a
Label and changing its color updates the Labels list and a selected Log label
option after reload; unused Notes scope removal persists; cancelling name/scope
edits preserves saved state; removing an assigned Logs scope is rejected
without changing the label or assignment; search returns the matching Label,
shows the no-match state, and restores query and results after reload; history
shows the owned Label's totals and charts, related-label trail, and matching Log,
preserves list search after close, and renders an unused Label's empty state;
and cancelling the second removal prompt preserves the assigned Log and label.
The Search suite's missing/foreign detail check also supports LABEL-17 by
showing its safe unavailable state. Physical Android remains unverified.
The suite was rerun after adding a wait for the restored matching result after
search reload; all 5/5 cases passed.

LABEL-04 fix verification:

- The focused service regression initially failed because duplicate creation
  threw no exception; after the fix the full default backend suite passed
  (608 tests, 89 skipped, zero failures/errors).
- The simultaneous duplicate-create integration test passed against a unique
  empty PostgreSQL 16 database with Flyway migrations: one 201, one 409, one
  scoped label. The database container used temporary storage and was removed.
- The disposable full-stack smoke run passed, including case/whitespace
  duplicate rejection and an unchanged fresh label catalog readback.
- Accessibility (38 checks), security (49), smoke cleanup (17), inventory,
  Labels script syntax, shell syntax, and whitespace checks passed.

Follow-up headed Chrome acceptance in this checklist batch passed the updated
Labels real-stack suite 5/5 in Google Chrome 155.0.8059.39 under Xvfb at
1440 × 900, and the focused `LabelsView` unit suite passed 12/12. The add flow
selected a red color and LOG-only scope; fresh scoped reads showed the Label
available to Logs and absent from Notes. Create validation, duplicate
preservation, name/color edit, scoped label use, search reload, unused removal,
history totals/timeline/related-label trail, matching Log navigation, list
context restore, and the unused-history state were verified. Assigned-label
removal now stops after the server's 409, explains that assignments must be
removed first, and preserves the label and its assigned Log after reload. This
replaces the earlier second-confirmation behavior noted above and passes
**LABEL-01 through LABEL-16**. Regression commit `ffbb65d8` records the failing
test before fix commit `25476dd4`. The headed Search suite's missing/foreign Label
route check passes **LABEL-17**. Both stacks used disposable databases and
runner cleanup.

The expanded Calendar suite passed 6/6 in Google Chrome 155: five desktop
cases and one touch-emulation case. Its desktop assertions support CAL-01
through CAL-16 and CAL-18 in the UTC browser context: weekday columns;
December/January navigation and explicit month/year selection; a 29-day
February 2024 and safe malformed date; note create/edit/clear/readback;
rejected save with retained draft and a successful retry; day-picker label
creation, allocation readback, persisted color with a text/name cue, and
assignment removal preserving the label; cancellation without backend
changes; and reversed keyboard-selected ranges crossing leap day/month end
and year end. Fresh reads include one date outside each range on both ends
and prove only the inclusive intended dates were saved. CAL-17 has supporting
keyboard and emulated-touch evidence; physical Android touch remains open.
Desktop label/color and phone range screenshots were inspected from temporary
files outside the repository. No product checkbox was marked from these runs.
Calendar script syntax, inventory integrity, and whitespace checks passed;
the runner removed its disposable stack.

The expanded Reports/Settings suite initially passed 5/5 desktop Chrome cases. It adds
supporting evidence for REPORT-01, REPORT-03, REPORT-05, REPORT-07 through
REPORT-12, REPORT-16, REPORT-17, and the no-data portion of REPORT-18:
malformed, incomplete, reversed, and impossible date parameters normalize to
valid defaults; a gated request exposes loading before a 503 error and retry
returns the unchanged requested range; custom four-day ranges shift forward
and back without changing any of the five aggregation values; trendline and
Sankey state persist on reload, and the table remains available when Sankey
is open. Two real persisted sessions on the range's boundary dates total
three hours. The selected Path and Label each yield one hour with matching
API breakdown IDs and the visible total; filter reload preserves one hour,
and clearing each filter removes its URL parameter and restores three hours.
An initial retry-test failure was an exact-text selector that also contained
the button text; the corrected alert selector passed. The Path selector is
opened through its keyboard ArrowDown interaction.

Those initial custom-range checks did not prove preset interval selection/boundaries
for REPORT-02 or every interval unit in REPORT-04. Nonzero Sankey/trendline
data, source-record navigation, and physical Android
also remain to be checked. The original solarized preference check still
passes; the persisted account preference restores solarized appearance for
the subsequent Reports cases, as confirmed in the grouping screenshot. Script syntax,
inventory integrity, and whitespace checks passed, and the runner removed
its disposable stack. No product checkbox was marked from these runs.

REPORT-13/REPORT-14 grouping follow-up: the view regression failed before
the fix because selecting Labels remounted as Path. Regression commit
`2af14b27` records that failure. Grouping now persists as client URL state
(`groupBy=labels`), with Path as the default. It restores independently of the
API request on reload and Back/Forward, preserving range and filters. The
expanded Chrome suite passes 6/6, including a real seeded Label row, its table
heading, the May 1–2 date range, and switching back to Path. The desktop
solarized grouping screenshot was inspected outside the repository.
The focused Reports view suite passes 25/25, the complete frontend suite
passes 857/857 across 69 files, and the production build passes after `npm ci`.
Accessibility, security, inventory, syntax, and whitespace checks pass.
The disposable full-stack smoke run also passed and removed its stack.
Physical Android grouping remains unverified.

REPORT-02/REPORT-04 preset follow-up: the view regression initially failed
because Next on February 2024 yielded March 1–29 rather than March 1–31.
Regression commit `b4030059` records the failure before production changes.
Full aligned months, quarters, and years now move by calendar unit; other
ranges retain their inclusive-day-count navigation. The Chrome journey
selects Today/Week/Month/Quarter/Year from the actual date picker with matching
aggregation controls at a fixed leap-day clock. Saved fixtures yield totals
of 1/1/3/6/6 hours respectively, excluding a four-hour prior-year fixture.
Fresh backend reads agree with the visible totals and selected boundaries.
Next yields March 1, March 4–10, March 1–31, April 1–June 30, and the full
2025 year respectively; Previous restores each original range and total
without changing aggregation. The suite passes 7/7; the focused view suite
passes 26/26; all 858 frontend tests and the production build pass.
Accessibility, security, inventory, syntax, and whitespace checks pass.
Physical Android preset and interval navigation remain unverified.
The disposable full-stack smoke run passed after this fix; its stack was
removed.

REPORT-19 source navigation: a real saved May 3 Calendar day note is returned
in the matching daily report, its Reports log link carries that exact date,
and activation opens the Calendar route with the same day selected and note
loaded. The Reports/Settings suite passed 8/8, including this source journey;
its disposable stack was removed. This verifies the Calendar source type only.

Password settings supporting evidence: the Chrome real-stack test uses its
disposable signed-in account. Confirmation mismatch produces an inline error
without a password request; an incorrect current password returns 400 and
retains the new-password draft; a correct change returns success, clears the
fields, rejects the old sign-in, and accepts the new sign-in. Clipboard paste
into the password field succeeds, and current/new autocomplete attributes
match their roles. These are desktop automated results supporting SET-05
through SET-08; headless testing does not establish password-manager autofill
prompts or physical Android behavior.

SET-09 through SET-12 supporting evidence: the Settings export button produces
the `knowledge-base-export.csv` download and success status. A disposable Path
with Unicode, comma, quotes, and multiline description survives CSV parsing
exactly; a second disposable account's Path is absent, as are known token and
password-field names. Injected 503 produces the failure status and no download;
retry downloads successfully. The Chrome real-stack suite passes 10/10 and
its isolated stack/accounts are removed. This is automated evidence; the
checklist's remaining manual review and physical-device context remain open.

## 2026-10-11 Reports/Settings follow-up

The Chrome real-stack journey now selects all ten supported appearance
preferences (`auto` and the nine named palettes), confirms each palette and
color scheme are applied, reads the saved account preference, then navigates
to Reports, reloads, and confirms the preference remains selected and applied.
The expanded run passes 11/11. Rendered desktop Chrome screenshots for light
and dark Reports controls and breakdowns, the Settings password form with a
focused native theme select in both appearances, and the search dialog in
both appearances were inspected from
`/tmp/ototest-04-themes`; labels, input values, focus, filter controls, chart
totals, and dialog text are legible in the inspected views.

REPORT-15 review found the fixed `dd/MM/yyyy` date range ambiguous alongside
English chart labels. A committed component regression test reproduced
`01/05/2026 – 02/05/2026` where the expected en-US display was
`May 1, 2026 – May 2, 2026`. The range input now uses the browser locale's
short month, day, and year format. The real-stack report assertions confirm
the human-readable date range, `03:00:00` total, `Hours` chart axis, daily
duration descriptions, and minute-precision breakdown values. Component
tests pass 5/5, the full frontend suite passes 858/858, the production build
passes, and the Reports/Settings suite passes 11/11.

REPORT-18 follow-up: the isolated Chrome journey creates a zero-duration
record and an hour-long record without a Path or Label. Fresh report reads
show zero seconds on the zero-duration day, one hour on the unassigned day,
and the Path breakdown names the missing Path as “Unassigned path.” The empty
Label breakdown initially said “No tracked time in this period” despite the
one-hour report total. A regression test reproduced the mismatch; the table
now says “No labels assigned in this period.” The chart remains rendered and
the total remains `01:00:00` in both grouping modes. Component tests pass
3/3, the full frontend suite passes 859/859, the production build passes, and
the real-stack Reports/Settings suite passes 14/14. No product checkbox was
marked from these local desktop results.

REPORT-16 follow-up: the seeded nonzero daily Sankey contains one real flow
between the two persisted Paths. Its accessible image description names both
Paths, both dates, and the one-hour value; aggregate totals are exposed as
text. The toggle reports its pressed state, retains `sankey=1` while open,
and returns to the bar chart while removing that URL parameter. The expanded
Reports/Settings suite passes 14/14; this remains supporting local desktop
evidence and does not mark a product flow passed.

REPORT-06 follow-up: after loading a Reports URL with an explicit range and
reloading it, the desktop Chrome journey navigates to Settings, uses Back to
restore the Reports route and both exact dates, then uses Forward to restore
Settings. The real-stack suite passes 14/14; this is local desktop supporting
evidence only.

SET-04 supporting evidence uses a second disposable account in the isolated
E2E database. The runner marks its account state as Google-only, and the UI
then sets a password without asking for a current password; the account reports
both sign-in methods afterward, and a subsequent password sign-in succeeds.
The test exercises the authenticated Google-only account state but does not
exercise Google's live identity provider. No product checklist boxes were
marked: this remains local desktop automation and does not complete the
checklist's mobile Chrome, physical Android, or manual review contexts.
The disposable stack and accounts were removed by the runner.

The new sign-in recovery case supports RECOVERY-01 through RECOVERY-03 in a
real-stack browser context: `/reports` and its requested date query are hidden
while signed out, then restored after authentication; external and
protocol-relative redirect values return to the local Sessions route after
sign-in. A second case supports RECOVERY-04 and RECOVERY-05: an expired Logs
request clears the token, returns to sign-in, and displays a clear notice that
unsaved changes may be lost; signing in again allows the user to reopen Logs.
The draft is not retained. A third case supports RECOVERY-06: a delayed 401
from the old Logs request arrives after a different disposable account has
signed in; the replacement token remains stored, protected navigation remains
visible, and an authenticated Logs request with that token succeeds. The
expanded Reports/Settings suite passed 16/16 in Google Chrome 155; isolated
browser contexts and disposable accounts were removed with the runner stack.

The Board real-stack recovery case supports RECOVERY-07 through RECOVERY-09:
a card save receives a controlled 503 and retains the typed draft; reloading
the card shows the persisted pre-edit title; after another tab updates the
card, the user's draft is retried through a 409 conflict and a successful 200
save, with one final persisted value. The expanded Board suite passed 29/29 in
Google Chrome 155 against an isolated database and disposable account.

REPORT-16/REPORT-17 visualization follow-up: a failing real-stack regression
showed that the trendline and Sankey URLs changed while their controls stayed
in the previous state. The controls now update immediately when toggled and
restore correctly after reload. The Reports/Settings suite passes 17/17 in
Google Chrome 155; the focused regression passes 1/1. The Calendar suite
passes 6/6 and the transfer/import suite passes 1/1 for the same 50-item
verification batch. These are automated local desktop results and do not
complete manual review or physical Android checks.

## 2026-10-11 headed Chrome Notes acceptance

An agent-driven browser acceptance session used the disposable account in
`.env.agents` against the local web app. Google Chrome 155.0.8059.39 ran
headed under Xvfb at 1440 × 900 in the light theme. The session opened Notes
from navigation and `/notes` directly, created a uniquely marked note, saw
one list row with its updated timestamp, reloaded the list, opened the note,
edited its title and multi-paragraph content, and confirmed the values after
reload and through an authenticated API read. The existing Notes real-stack
Chrome run also verified long-title and multi-paragraph layout bounds.

A second browser session created an empty note, reloaded it, entered
whitespace-only title and content, and confirmed the same note ID remained
present once. A separate note received a controlled 503 on save; its title
and body remained visible, Retry saved the draft, and the persisted values
were read back. Both temporary recovery notes were archived through the UI.
These results pass **NOTE-01 through NOTE-07** and **NOTE-09** in the checklist.
The browser was driven with Playwright; this is local headed-Chrome evidence,
not a claim of human manual interaction or Android behavior.

Two more note saves were tested in the same local Chrome context. A newer
title typed while the first PUT was held produced a second PUT with the newer
value; leaving the editor waited for both writes, and the Notes list and a
reload showed the newer title. The matching temporary note was archived.
This passes **NOTE-08** and **NOTE-10**. A browser clipboard paste retained
bold formatting, removed script/image/event-handler markup, and persisted the
sanitized note document after a fresh API read; that temporary note was also
archived. This passes **NOTE-12**. These were Playwright-driven interactions
in headed Chrome, not physical mobile or human manual results.

The full isolated Notes real-stack runner was rerun with
`BROWSER_PATH=/usr/bin/google-chrome`; all 8/8 cases passed in Google Chrome
155, including the formatting toolbar, task-list/keyboard history, paste
sanitization, and Note-label cases. The runner removed its unique Compose
stack; no matching containers remained. In headed Chrome against the local
app, Ctrl+Z/Shift+Ctrl+Z changed the note editor as expected, a checked task
item remained checked after reopening, and a NOTE-scope label remained
selected after reopening. Removing that label persisted across reload while
the Label itself remained available. These checks pass **NOTE-11** and
**NOTE-13 through NOTE-16**. The temporary notes from the headed checks were
archived through the UI. **NOTE-17** remains open: the picker was exercised at
390 × 844 with keyboard input, but no mobile on-screen keyboard was present.

A further headed Chrome pass archived a disposable note with body content and
a NOTE-scope label, confirmed its archived direct URL is unavailable, restored
it through the Archive view, and verified its content and label after reload
and a fresh API read. The same pass opened an owned note directly and showed a
safe unavailable state for an unknown ID. A distinctive title search returned
only its matching note; reload plus Back/Forward kept the query URL and result
in sync. The two temporary notes were archived afterward. These results pass
**NOTE-20** and **NOTE-22 through NOTE-24**.

## 2026-10-11 headed Chrome Logs acceptance

The isolated Logs suite passed 7/7 in headed Google Chrome 155.0.8059.39 under
Xvfb at 1440 × 900. It created an explicit-time Log and a browser-local-time
Log in America/Los_Angeles, checked their displayed times, reloaded persisted
entries, and verified a long multiline body did not overflow its row. It also
rejected empty and whitespace-only entries; edited text and time; canceled an
edit; retained a failed edit for retry; assigned and removed a LOG-scope label;
rejected a NOTE-only label; kept search and paging in sync with reload and
Back/Forward; restored the prior rows on Previous; kept focus in the search
field after clearing it; and confirmed canceled and completed removal behavior.
These results pass **LOG-01 through LOG-09** and **LOG-11 through LOG-22**.

The direct-route suite passed 13/13 in the same headed Chrome context. It
direct-loaded an owned Log destination twice, then checked missing and foreign
Log IDs for a safe “Log not found” state with no foreign body disclosure. This
passes **LOG-10**. It also rejected owned Session creation with foreign Path and
Label IDs, then verified that neither account's Session count or referenced
records changed; this passes **OWNER-02**. Both suites used isolated disposable
Compose stacks that were removed by runner teardown.

## 2026-10-11 headed Chrome Calendar acceptance

The isolated Calendar suite passed 6/6 in headed Google Chrome 155.0.8059.39
under Xvfb at 1440 × 900. The browser used UTC. The checks identified the
selected month, year, day, and weekday headings; moved across December/January;
selected month and year from controls; and handled valid and invalid direct
dates. Day notes were created, edited, cleared, and reloaded; an injected 503
preserved a draft for retry. A day Label was created from the picker, allocated,
reloaded, recolored, and removed from the day while remaining available in
Labels. Range checks covered canceled drafts, reversed keyboard selection,
inclusive allocation, leap day, month end, and year end with exact fresh API
date sets. The emulated 390 × 844 touch context selected the same leap-day range
as the keyboard case and canceled without changes. These results pass
**CAL-01 through CAL-18**. The disposable Compose stack was removed by runner
teardown; touch behavior here is emulated, not a physical Android result.

## 2026-10-11 headed Chrome Reports and Settings acceptance

The isolated Reports/Settings suite passed 17/17 in headed Google Chrome
155.0.8059.39 under Xvfb at 1440 × 900. Reports checks covered all date
intervals and custom ranges, previous/next boundaries, URL reload and browser
history, malformed dates, Path and Label filters, grouping, totals and units,
empty/zero/unassigned breakdowns, Sankey text alternative and state, trendline
state, and a report link opening its matching Calendar day. Settings checks
covered all appearance choices across routes and reload, light/dark control
legibility, Google-only password setup, password change validation/recovery,
and owner-only CSV export including Unicode and special characters plus a
failed-export retry. These results pass **REPORT-01 through REPORT-19**,
**SET-01 through SET-07**, and **SET-09 through SET-12**. **SET-08** remains
open because a live browser password-manager autofill was not exercised; paste
and autocomplete metadata are supporting evidence only. The stack and its
disposable accounts were removed by runner teardown.

## 2026-10-11 headed Chrome Imports acceptance

The isolated Transfers suite passed 1/1 in headed Google Chrome 155.0.8059.39
under Xvfb at 1440 × 900. It imported a valid Knowledge Base CSV through both
paste and file selection, skipped conflicting rows without replacing them,
rejected malformed CSV, and verified imported Paths after reload. Clockify
checks covered valid import, duplicate skips, invalid and oversized content,
visible sessions and created Paths after reload, six history batches across
bounded pages, and source/date-specific undo prompts. Canceling undo preserved
the batch; confirming removed only that batch's records, marked it undone, and
left separate imported Paths intact after reload. These results pass
**IMPORT-01 through IMPORT-19**. The isolated Compose stack and disposable
accounts were removed by runner teardown.

## 2026-10-11 headed Chrome shared recovery and ownership

The headed Reports/Settings suite verified protected-route sign-in return,
unsafe redirect rejection, expired-session recovery with unsaved Log notice,
and stale-response handling after account replacement. The headed Board suite
passed 29/29 and injected a failed card save, verified the draft and error,
reloaded the server value, then retried after a concurrent edit and confirmed
one final persisted draft. The headed Logs suite verified a rejected removal
keeps the Log after reload. The headed Imports suite rejected malformed input,
then accepted one corrected batch and verified its summary and records. These
results pass **RECOVERY-01 through RECOVERY-12**. The direct-route checks
covered foreign and missing Notes, Paths, Logs, and Labels without disclosing
their details; the report Calendar link, Label-history Log link, and Path
history session action all opened the matching owned resource. A follow-up
owned Session creation using a foreign Path or Label ID returned client errors;
fresh reads confirmed no Session was created and the other account's Path,
Label, and session count were unchanged. These results pass **OWNER-01 through
OWNER-03**.

## 2026-10-11 headed Chrome Paths acceptance

The disposable local account was used in headed Google Chrome 155.0.8059.39
under Xvfb at 1440 × 900. The isolated Paths suite was also rerun in headed
Google Chrome 155.0.8059.39 under Xvfb; all 9/9 cases passed against its
disposable Compose stack. A Path with a unique name, description, background
color, and custom text color appeared in the list and Timeline filter; its
saved values remained after reload. Whitespace and duplicate names showed
validation errors without creating or replacing a Path. An edit changed the
name, description, background color, and text color and persisted after
reload. Cancel discarded an edit without changing the saved record. A
controlled 503 kept the edit draft available and left the saved Path intact;
retry succeeded and a fresh API read confirmed the final values. The
disposable Path was removed through the UI and confirmed absent from the API.
These results pass **PATH-01 through PATH-08**.

A second headed Chrome session pinned and unpinned a disposable Path, checking
the pressed state and saved value after reload. It created a card on the
Path's board, canceled the hide confirmation, confirmed hiding, then showed
the board again. The card remained available after reload. The Path was
restored after exercising its remove/Undo action. This passes **PATH-09
through PATH-14**.

The headed isolated suite also checked Path removal end to end. Its confirmation
explained the Undo window; cancel preserved the Path; confirm removed it from
the active list and showed Undo; activating Undo restored the Path, and reload
preserved both its board association and a board card. A separate removal was
left to expire, after which Undo disappeared and the Path remained unavailable.
These results pass **PATH-20 through PATH-25**. The history case opened a Path
directly, showed its owned session, and used Edit session to verify the selected
session description and Path ID; browser Back returned to the list. Missing and
foreign Path IDs showed the safe unavailable state without disclosing the
foreign Path name. These results pass **PATH-26 through PATH-28**. The suite's
isolated Compose stack was removed by its runner teardown.

## 2026-10-11 extension follow-up

The packaged Manifest V3 extension browser suite now exercises endpoint
validation and persistence, popup/options identity, supported and unsupported
Clockify routes, import enable/disable, malformed and oversized reports,
duplicate imports, invalid and valid email sign-in, server-owned timer
reconciliation, timer draft persistence, start-time validation and correction,
timer stop and reload behavior, Notes empty/create/edit/Markdown flows, failed
save retry, popup-context restart, expired-session reauthentication, sign-out
data hiding, API outage and retry, and token/password diagnostic scrubbing.
The full Playwright Chromium run passed 3/3; the focused timer, Notes, and
recovery case passed 1/1. `OTOTEST_TEST_NAME_PATTERN` was added to the runner
for targeted debugging; the unfiltered command remains the full suite.

This run supports portions of EXT-04 through EXT-11, EXT-14 through EXT-30,
and EXT-31 through EXT-46. It does not establish desktop Google Chrome package
installation, Chrome permission denial behavior, Google sign-in, fresh web
reads for imported extension data, unexpected redirect/CORS handling, or
physical-device behavior. The existing Google Chrome extension attempt still
fails during browser setup because its service worker does not start, so
SETUP-04 remains unchecked. No product checklist boxes were marked from this
automated Chromium run.

A fresh Google Chrome 155 rerun rebuilt the current 0.1.23 package and again
failed all 3 cases in setup while waiting 15 seconds for the extension worker.
`chrome://extensions` showed no loaded extension and reported Developer mode as
managed by the environment. Playwright's [extension guidance](https://playwright.dev/docs/chrome-extensions)
states that Google Chrome removed the command-line flags needed to sideload
extensions and directs extension tests to its bundled Chromium. The extension
flows therefore remain unverified in desktop Chrome; the bundled Chromium
result does not pass SETUP-04 or EXT checklist rows.

The same current package passed the full 3/3 Playwright-bundled Chromium run.
After repairing the stale AuthView API test mock exposed by the larger batch,
the complete frontend unit suite passed 859/859 across 69 files. The frontend
production build also passed; Vite reported its existing large Reports chunk
warning. These package-level checks do not substitute for the remaining
Chrome, Android, or manual acceptance contexts.

The setup evidence supports **SETUP-01**, **SETUP-02**, **SETUP-05**,
**SETUP-07**, and **SETUP-09**. Each run used isolated local data and disposable accounts; this
record includes the revision, browser/OS, account type, date/time zone, themes,
and viewports; the evidence contains aggregate results without credentials or
private records; and the passing Chromium extension run stopped its timer
before the isolated fixture was torn down. The failed Chrome extension attempt
did not start a service worker or timer, and its isolated resources were also
removed.

## 2026-10-11 batched acceptance rerun

After the larger acceptance-test batch, the frontend unit suite passed 859/859
across 69 files and the production build passed. The changed real-stack
acceptance runners also passed: Board 29/29, Calendar 6/6, Logs 7/7, Notes
8/8, Paths 9/9, Reports/Settings 17/17, Search 13/13, and Transfers 1/1.
The packaged extension suite passed 3/3 in Playwright's bundled Chromium. The
combined real-stack and extension result was 93/93 browser tests. The whitespace
check passed, and no runner-created E2E containers remained afterward.

These are rerun results for existing OTOTEST-04 flows. The extension run used
bundled Chromium; it does not change the desktop Google Chrome installation
blocker. The mobile checks used responsive browser emulation and do not
establish physical Android behavior. No checklist status changed from this
rerun; progress remains 180/271 (66.4%).

## 2026-10-11 Chrome Password Manager follow-up

SET-08 remains open. The sign-in form has username/current-password
autocomplete metadata and paste remains available, but this local Chrome
profile did not retain a disposable credential entered through Google Password
Manager's Add flow: after Save, the Passwords view still showed its empty
state. Without a saved credential, autofill could not be exercised against
the Knowledge Base sign-in form. The focused browser attempt stopped at that
environment limitation; it did not change product code or checklist status.

A follow-up used a fresh Google Chrome 155 profile and the disposable local
account. Keyboard paste inserted the password into the sign-in field, and the
form returned to the authenticated Sessions page. Google Password Manager's
Passwords page remained empty (`No passwords`; no `localhost` entry), so
autofill still could not be verified. This confirms the paste behavior but
does not satisfy all of SET-08; it remains unchecked.

A further attempt used Chrome for Testing 153.0.8010.12 and a temporary
profile. Password Manager accepted and listed a disposable credential for a
local test-domain origin, but did not autofill either field on the Knowledge
Base sign-in page served at that matching origin. The test profile and
credential were removed. This attempt did not establish autofill; the
subsequent isolated HTTPS verification below did.

## 2026-10-11 Chrome Password Manager autofill verification

Chrome for Testing 153.0.8010.12 used a temporary profile with a disposable
credential stored in Chrome Password Manager. The Knowledge Base sign-in page
was served at the same HTTPS test origin and all its requests were forwarded
to the local app; requests to every other origin were blocked. Chrome
autofilled both the username and password fields, and submitting the form
opened the authenticated Knowledge Base Sessions view. The local credential,
profile, and forwarding server were removed afterward. Combined with the
prior paste and `username`/`current-password` autocomplete evidence, this
supports **SET-08**. Checklist progress is now 237/237 (100%).

## 2026-10-11 checklist scope update

Per the requested OTOTEST-04 scope, the Android-only mobile acceptance section
and its completion row were removed; no Android device work is required.
Responsive web behavior remains in scope. The checklist now has 237 rows.

The Notes label journey above passed at 390 × 844: keyboard input searched and
selected a label, the selected chip appeared, Escape dismissed the picker, and
the picker controls stayed within the viewport. This satisfies the narrowed
NOTE-17 criterion, which concerns narrow-screen keyboard operation and does
not require an Android on-screen keyboard. NOTE-17 is now checked. Checklist
progress is 182/237 (76.8%).

A fresh isolated Google Chrome 155 profile confirmed that Developer mode is
managed by the environment. The Extensions page's rendered UI showed the
Developer mode toggle locked off; “Load unpacked” appeared only in hidden page
markup, not as an available control. The attempted UI activation did not open
a directory chooser. The packaged extension was not installed and no
extension flow ran. SETUP-04 and the Chrome-only extension rows remain
unchecked.

## 2026-10-11 SETUP-06 fresh-page readbacks

The readback audit found saved-state checks that ended at API reads in several
existing browser journeys. Those journeys now reload and verify the rendered
saved state for a note retry, note formatting and sanitized paste, Note label
removal and selection, Path creation and retry, Path removal after its Undo
window, Label creation, Log creation and label removal, and Board/card creation
and conflict retry. Other completed desktop-web mutation flows already record
fresh route or reload checks in the headed Chrome results above, including
Notes archive/restore, Calendar notes and labels, Reports/Settings, CSV and
Clockify imports/undo, Log edits/removals, Path edits/merge/undo, and Label
edits/removal.

The updated real-stack browser suites passed: Notes 8/8, Paths 9/9, Labels
5/5, Logs 7/7, and Board 29/29. These focused reruns used Playwright's bundled
Chromium and isolated disposable Compose stacks; they added rendered page
readbacks after reload and did not replace the separate headed Google Chrome
results. At the time of these reruns, the stable Chrome 155 extension attempt
remained blocked; the later Chrome for Testing package run is documented
below.
This completes **SETUP-06** and **DONE-02** for the saved mutations exercised
in the OTOTEST-04 desktop-web acceptance flows.

## 2026-10-11 Google Chrome for Testing packaged extension

Google Chrome for Testing 153.0.8010.12 launched the current packaged
Manifest V3 build from `chrome-extension/.output/chrome-mv3`. Chrome reported
the product name `Knowledge Base`, version `0.1.23`, and runtime extension ID
`gdefdpghcbaijmoaglejnaidodkkmmnn`. The runtime permission list contained
`identity` and `storage`; the granted origins were
`http://127.0.0.1:26580/*` and `https://app.clockify.me/*`. The latter is the
runtime host grant for the Clockify content script, whose manifest match covers
that host; this run recorded the actual grant rather than inferring it from the
API host permission alone.

The headed packaged-extension suite passed 3/3: popup/options identity and API
setting persistence; Clockify report forwarding through the service worker;
and email sign-in, timer synchronization, and API-unavailable recovery. The
test API was an in-memory fixture. The unsupported Clockify summary route was
also checked for absence of the overlay and import. The timer and Notes journey
also verified server-timer adoption without a second start; Path, label, and
description draft persistence and submission; no stale timer after stop and
reload; future start-time rejection and field focus; the empty Notes create
state; note edit persistence across browser-context restart; recoverable note
save failure; expired-session recovery; sign-out hiding authenticated content;
and diagnostic scrubbing. This evidence supports **SETUP-04**, **EXT-01**,
**EXT-04** through **EXT-08**, **EXT-14**, **EXT-17**, **EXT-18**, **EXT-21**,
**EXT-24**, **EXT-25**, **EXT-27**, **EXT-29**, **EXT-30**, **EXT-39**, **EXT-40**,
**EXT-42**, **EXT-31** through **EXT-33**, and **EXT-44**. The API is an
in-memory fixture, so this does not establish
real-backend cross-client readbacks, live Google sign-in, optional-permission
denial, or every extension acceptance flow.

This run used Chrome for Testing, which permits the test harness to load the
packaged extension. Stable Google Chrome 155 remains managed with Developer
mode locked off in this environment, so it could not load the package. The CFT
run is direct Chrome-family package and UI evidence; it does not claim a store
installation. Checklist progress after recording these results and confirming
the local Google sign-in configuration is 207/237 (87.3%).

A separate headed check pointed the extension at the local Knowledge Base app
through a temporary localhost forwarder and submitted the disposable local
account credentials. The app returned HTTP 403 `Invalid CORS request`; the
extension showed that response in its sign-in error region. This reproduces a
CORS rejection in Chrome for Testing, but the recovery destination was not
verified in that session, so **EXT-49** remains open.

## 2026-10-11 local Google sign-in configuration

The local app's unauthenticated `/api/v1/auth/google/config` endpoint returned
HTTP 200 with `enabled: false`. Google sign-in is therefore not enabled for
this local environment, and the conditional **EXT-13** flow is not applicable.

## 2026-10-11 local extension email authentication

In Google Chrome for Testing 153.0.8010.12, the packaged extension used the
disposable local account against the local Knowledge Base API. A temporary
localhost forwarder handled the extension-origin CORS boundary for this
functional check; it forwarded requests to the real API and returned CORS
headers to the test extension. This bypass does not verify native API CORS
configuration, which remains under **EXT-49**.

Invalid credentials produced an `Invalid credentials` error in the sign-in
region, retained both form values, and created no extension token. The valid
local credentials opened the authenticated Tracker workspace, and sign-out
returned to Sign In with the workspace hidden. This supports **EXT-10** and
**EXT-11**. The earlier packaged-fixture sign-out check also supports **EXT-14**.
Checklist progress is 209/237 (88.2%).

The focused timer, restart, and unavailable-API journey was rerun on
2026-10-11 with
`OTOTEST_TEST_NAME_PATTERN='syncs a timer through the packaged popup' ./scripts/run-extension-browser-e2e.sh`;
it passed 1/1. It restarts the extension browser context while the fixture
holds an active server timer, then opens the popup and confirms the timer is
recovered from the API without starting a duplicate. This supports **EXT-39**
and **EXT-40**. These rows use the fixture evidence and do not claim a
real-backend cross-client readback. Checklist progress is now 211/237 (89.0%).

## 2026-10-11 local extension timer cross-client round trip

Google Chrome for Testing 153.0.8010.12 ran the packaged extension against
the local disposable account and real local Knowledge Base API. A temporary
localhost forwarder handled the extension-origin CORS boundary; it forwarded
requests to the local API and returned CORS headers to the extension. This
proves the timer operations and persisted state across the two clients, but it
does not verify the API's native extension-origin CORS configuration, which
remains part of **EXT-49**.

The extension started a timer on an owned Path with the account's available
TIME_ENTRY Label and a unique disposable description. Its running control
appeared and elapsed time advanced. A fresh web Sessions read showed the same
Path, Label, and description. The extension start-time editor showed the
server's current value; Cancel left the server unchanged. After saving a
valid corrected time, a fresh API read matched that time and the web and
extension editors both displayed it. Stopping from the extension produced a
completed time entry with the selected Path, Label, and description, confirmed
through a fresh API read. A second timer was stopped from the web app while the
extension popup remained open; the API became idle and the popup returned to
Start timer.

This run supports **EXT-15**, **EXT-16**, **EXT-19**, **EXT-20**, **EXT-22**,
and **EXT-23**. The disposable completed entries were removed after the
readbacks; no timer remained active. Checklist progress is now 217/237
(91.6%).

## 2026-10-11 local extension Notes cross-client round trip

The packaged extension in Google Chrome for Testing 153.0.8010.12 created a
disposable note through the local API. After a fresh load of the web Notes
list, the note appeared exactly once. In the same note, the extension's Ctrl+B
shortcut wrapped selected text in Markdown, and Ctrl+Shift+8 created a bullet
item. Adding unchecked task syntax produced a `taskList` document with one
unchecked `taskItem`; the local web editor rendered the text and one task
checkbox after a fresh note load.

The first round trip showed that the extension parser treated `- [ ]` as a
regular bullet instead of a task list. `markdownNoteDocument` now converts
checked and unchecked Markdown task items into the web editor's `taskList` and
`taskItem` document structure. The packaged extension was rebuilt and the
cross-client flow rerun successfully. This supports **EXT-26** and **EXT-28**.
The disposable note was archived after verification. Checklist progress is
now 219/237 (92.4%).

## 2026-10-11 local extension API outage recovery

In Google Chrome for Testing 153.0.8010.12, a temporary localhost test
forwarder returned HTTP 503 for the extension's configured API requests while
the real local API remained available for independent state checks and
cleanup. With the extension authenticated, starting a timer displayed the
service error and created no server timer. Creating a note displayed a
recoverable error and created no note. After restoring forwarding, reloading
the popup restored the authenticated workspace; creating a disposable note
and starting then stopping one timer both succeeded. Fresh API reads confirmed
the note persisted, the timer became one completed entry, and no running timer
was duplicated. The disposable note and time entry were removed after
verification.

The packaged extension suite was also rebuilt and rerun after the Markdown
task-list conversion; it passed 3/3 in Chrome for Testing. Together, these
results support **EXT-45** and **EXT-46**. The outage was simulated as an
unavailable API response at the extension boundary, not by stopping the local
backend process. Checklist progress is now 221/237 (93.2%).

## 2026-10-11 local extension re-authentication

In Google Chrome for Testing 153.0.8010.12, the packaged extension started a
timer against the local disposable account, then signed out and back in while
the server timer remained active. The re-authenticated Tracker showed the
same server timer, Path, Label, and description; no second timer was created.
The Notes tab reopened an owned Note from the account's current API list. The
test then stopped the timer and removed its disposable completed entry. The
extension used the temporary localhost forwarder described in the local timer
round trip above, so this does not change the **EXT-49** native CORS result.
This supports **EXT-43**. Checklist progress is now 222/237 (93.7%).

## 2026-10-11 local extension Note restart

In Google Chrome for Testing 153.0.8010.12, the packaged extension created
and saved a disposable Note through the local API, then restarted its browser
context while the Note editor contained a newer unsaved edit. A fresh API read
confirmed that only the prior saved content reached the server. After the
extension restarted, it reopened the saved Note context and displayed the
saved content without a false Saved status for the discarded edit. The
disposable Note was archived afterward. This supports **EXT-41**. Checklist
progress is now 223/237 (94.1%).

## 2026-10-11 Clockify overlay acceptance follow-up

The packaged-extension browser flow passed on Chrome for Testing 153.0.8010.12.
On an unsupported Clockify summary route, the report page's fixture heading
remained visible, the Knowledge Base overlay stayed hidden, and no API import
was sent. On the supported detailed route, malformed and oversized reports
showed their validation messages in Chrome's accessibility tree and sent no
import request.

The follow-up also exposed stale duplicate counters beside an invalid-report
error. The Clockify overlay now hides its count panel for invalid, empty,
pending, and failed imports, and its hidden panel has an explicit `display:
none` rule. After a duplicate report response, the accessible overlay reported
0 imported sessions, 1 duplicate skipped, and 0 new Paths. The fixture kept a
set of imported entry IDs, so the repeated row was counted as skipped rather
than imported again. This supports **EXT-36**, **EXT-37**, and **EXT-38** for
the extension-side behavior; the fixture does not establish a live Clockify
account import. Checklist progress is now 226/237 (95.4%).

## 2026-10-11 live local Clockify extension import

Google Chrome for Testing 153.0.8010.12 ran the packaged extension against a
disposable Clockify detailed-report fixture and the real local Knowledge Base
API. A temporary localhost forwarder handled the extension-origin CORS
boundary. The overlay reported 1 imported session, 0 duplicate skips, and 1
new Path. Fresh API reads confirmed the import batch, session, and Path; fresh
web Sessions and Paths page loads displayed the imported records.

The Clockify import batch undo endpoint then removed the disposable session and
its batch-created Path, as confirmed by new API reads. This supports **EXT-34**
and **EXT-35**. The report content was a generated disposable fixture; this is
not a login to a live Clockify account. Checklist progress is now 228/237
(96.2%).

## 2026-10-11 local extension endpoint outage and correction

In Google Chrome for Testing 153.0.8010.12, the packaged extension was pointed
at a temporary local API forwarder. After changing the configured endpoint to
a route returning HTTP 503 with a service-unavailable message, the Tracker
showed “Local API is temporarily unavailable.” Updating the endpoint back to
the working forwarder and reopening the popup restored the authenticated
Tracker. No timer or note mutations were made. This supports **EXT-09**.
The same session also configured the extension to call the API directly from
its Chrome extension origin. The API rejected sign-in with HTTP 403 `Invalid
CORS request`, and the extension surfaced that response in the alert region.
Changing the endpoint back to the working local forwarder and signing in again
opened the authenticated Tracker. This supports **EXT-49**. Checklist progress
is now 230/237 (97.0%).

For **EXT-48**, a separate packaged Chrome session used a build without the
Clockify host permission. The Clockify detailed-report page loaded without the
overlay, while the authenticated extension Tracker and Notes tab remained
available. The extension continued to use the approved local API host. No
Clockify or Knowledge Base data was mutated. Checklist progress is now
231/237 (97.5%).

## 2026-10-11 extension API host permission denial

Google Chrome for Testing 153.0.8010.12 loaded a disposable development
package without Knowledge Base API host access. Opening the authenticated
Tracker caused its API read to fail; the popup explained that API host
permission may be missing and did not claim a successful sync. The API
Settings page still opened and showed the configured endpoint. This supports
**EXT-03**. On this package, saving the endpoint could not request access
because the origin was absent from the manifest; this setup does not satisfy
**EXT-47**, which requires verifying Chrome's recovery path after access is
denied. No server mutations were made. Checklist progress is now 232/237
(97.9%).

## 2026-10-11 Chrome API host permission recovery

In Google Chrome for Testing 153.0.8010.12, the extension's Details page was
set to deny access to the configured Knowledge Base API host. The authenticated
Tracker displayed an error that named API host permission as a possible cause,
and it showed no successful sync. Restoring that host's access in Chrome and
reopening the popup returned the authenticated Tracker. A fresh
`chrome.permissions.contains` check confirmed access had been restored. No
timer or note mutations were made. This supports **EXT-47** and provides a
Chrome-managed denial/recovery path for **EXT-03**. Checklist progress is now
233/237 (98.3%).

## 2026-10-11 acceptance finding index

The following issues found during OTOTEST-04 acceptance were fixed and
rechecked. The references below point to this redacted run record; it contains
no account credentials or tokens.

| Surface and action | Expected | Observed and resolution | Browser/device | Evidence |
| --- | --- | --- | --- | --- |
| Extension Notes editor: add `- [ ]` to a note, then open it in web Notes | The task stays an unchecked task item in both clients. | The extension first serialized it as a regular bullet. Markdown conversion now emits a task list; the cross-client round trip showed the web checkbox. | Chrome for Testing 153.0.8010.12 and desktop web app | [Notes round trip](#2026-10-11-local-extension-notes-cross-client-round-trip) |
| Clockify detailed report: submit a malformed report after prior import counts appeared | Validation error is visible and stale import counts are hidden. | The old counters remained visible beside the error. The overlay now hides counts for invalid, empty, pending, and failed imports; the accessibility-tree rerun confirmed the corrected state. | Chrome for Testing 153.0.8010.12 | [Clockify overlay follow-up](#2026-10-11-clockify-overlay-acceptance-follow-up) |

This index supports **DONE-04**. Checklist progress is now 234/237 (98.7%).

## 2026-10-11 state coverage index

Recorded state evidence for the applicable desktop flows is indexed here:

| State | Recorded flows |
| --- | --- |
| Negative and validation | [Invalid extension credentials](#2026-10-11-local-extension-email-authentication), [invalid or oversized Clockify reports](#2026-10-11-clockify-overlay-acceptance-follow-up), and [Path validation and rejected edits](#2026-10-11-headed-chrome-paths-acceptance). |
| Empty | [Empty Notes create state](#2026-10-11-headed-chrome-notes-acceptance), [empty Logs](#2026-10-11-headed-chrome-logs-acceptance), and [empty and unassigned Reports](#2026-10-11-headed-chrome-reports-and-settings-acceptance). |
| Loading | [Gated Reports request before the unavailable response and retry](#2026-10-11-reports-settings-follow-up). |
| Unavailable service | [Extension API outage errors for Timer and Note operations](#2026-10-11-local-extension-api-outage-recovery) and [native API CORS rejection](#2026-10-11-local-extension-endpoint-outage-and-correction). |
| Recovery | [Reports retry](#2026-10-11-reports-settings-follow-up), [Path edit and removal recovery](#2026-10-11-headed-chrome-paths-acceptance), [extension API retry](#2026-10-11-local-extension-api-outage-recovery), and [endpoint correction](#2026-10-11-local-extension-endpoint-outage-and-correction). |

This index supports **DONE-03**. Checklist progress is now 235/237 (99.2%).

## 2026-10-11 desktop flow coverage index

The checklist's applicable desktop flows have desktop-browser results recorded
in these grouped runs: [Notes](#2026-10-11-headed-chrome-notes-acceptance),
[Paths](#2026-10-11-headed-chrome-paths-acceptance),
[Logs](#2026-10-11-headed-chrome-logs-acceptance), Labels and Search in the
[earlier real-stack results](#results), [Calendar](#2026-10-11-headed-chrome-calendar-acceptance),
[Reports and Settings](#2026-10-11-headed-chrome-reports-and-settings-acceptance),
[Imports](#2026-10-11-headed-chrome-imports-acceptance),
[shared recovery and ownership](#2026-10-11-headed-chrome-shared-recovery-and-ownership),
and the [packaged extension](#2026-10-11-google-chrome-for-testing-packaged-extension)
with its [local cross-client follow-ups](#2026-10-11-local-extension-timer-cross-client-round-trip).

Android-specific acceptance was removed per the requested scope; native iOS
acceptance is excluded by the Milestone 4 product scope. The local Google
sign-in configuration is disabled, so its conditional flow is recorded as not
applicable. Stable Chrome is managed with Developer mode locked, so extension
package results use Chrome for Testing, a desktop Chrome build. This supports
**DONE-01**. Checklist progress is now 236/237 (99.6%).
