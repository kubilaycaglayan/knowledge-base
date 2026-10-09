# HARD-06 macOS simulator validation run

## Run metadata

| Field | Value |
| --- | --- |
| Result | **Failed**; project generation/build succeeded, native tests reported failures |
| Commit | `cbcd16ce9afce5cfb9ac3e34275c23747341b938` (`ci: probe HARD-06 macOS simulator validation`) |
| GitHub Actions run | [37894080452](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/37894080452) |
| Started / completed | 2026-10-09 06:32:43 UTC / 06:55:52 UTC |
| Host | GitHub-hosted `macos-latest`, Apple Silicon |
| macOS | 26.6.2, build 25G83 |
| Xcode | 26.6, build 17F113 |
| XcodeGen | 2.46.0 |
| Simulator runtime | iOS 26.5, build 23F77 |
| Simulator device | iPhone 17 Pro, UDID `22452A91-4697-4369-8812-53ADB77EB73B` |
| Scheme / signing | `Know`, full unit and UI scheme; simulator signing disabled |
| Result artifact | `hard06-ios-37894080452`, `.xcresult`, uploaded by the run and retained for 30 days |

The run began from a clean GitHub checkout, installed XcodeGen, generated
`ios/Know.xcodeproj`, built the app and test targets, and executed the full
scheme. The full run took about 23 minutes. An Xcode warning reported two
matching simulator architectures for the selected iPhone 17 Pro UDID; the
selected destination was iOS 26.5, arm64.

## Outcomes

| Test target | Executed | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| `KnowTests` | 128 | 127 | 1 | 0 |
| `KnowUITests` | 67 | 59 | 7 | 1 |
| **Total** | **195** | **186** | **8** | **1** |

The one skipped UI case was
`testReportsLiveAPIFlowWhenExplicitlyConfigured`, as expected because no live
API credentials were provided. All UI tests therefore ran with the local
fixture setup; no account secrets were supplied.

### Failed tests

| Test | Observed failure |
| --- | --- |
| `KnowTests.testKeychainPersistsReplacesAndDeletesSession` | Keychain save threw `storage` at `ios/KnowTests/KnowTests.swift:72` with `CODE_SIGNING_ALLOWED=NO`. A targeted rerun with the historical ad hoc simulator signing settings passed; see diagnostic run below. |
| `KnowUITests.testCalendarLoadingAndExpiredSessionFixtures` | Calendar fixture did not expose the `calendar.day.2026-09-13` button within 8 seconds (`KnowUITests.swift:704`). |
| `KnowUITests.testCalendarLongPressAndTapCompleteInclusiveRange` | Could not find the `calendar.day.2026-09-13` start button (`KnowUITests.swift:762`). |
| `KnowUITests.testCalendarSavedFixtureShowsAccessibleDayAndRangeControls` | Could not find the `calendar.day.2026-09-03` button (`KnowUITests.swift:682`). |
| `KnowUITests.testLabelsListAndCreateControlsAreReachable` | The Calendar scope switch had no matching `Calendar` accessibility identifier (`KnowUITests.swift:990`). |
| `KnowUITests.testNotesLineHistoryListsEachLineWithItsEditTime` | The line-history toggle remained `On` after the test tapped it; expected `Off` (`KnowUITests.swift:1075`). |
| `KnowUITests.testPathsMergeRequiresConfirmationAndRemoveOffersUndo` | The `paths.merge` button was absent after opening path edit (`KnowUITests.swift:853`). |
| `KnowUITests.testSessionLabelsPickerHasSummaryCompactPriorityAndKeyboardAccessibleToggle` | The selected and unselected label rows shared the same vertical position, `424.0` (`KnowUITests.swift:1190`). |

These are observed failures from the first full run, not confirmed root causes.
The result bundle and failure diagnostics are available from the linked Actions
run. Subsequent focused runs have verified test-harness corrections for six UI
cases and a locator/visibility correction for the Labels case, described below.
The Keychain failure is consistent with the unsigned test configuration, but
does not by itself prove the cause.

### Source-level triage (not yet reproduced or verified)

Inspection after the run found test-harness and query issues. Focused reruns
now provide evidence for these corrections; the original full-scheme result
remains failed until the complete scheme passes again.

| Failure | Source observation | Follow-up evidence needed |
| --- | --- | --- |
| Three calendar day queries | `CalendarModel` used its default `Date()` while the fixture/assertions use September 2026. Initializing the UI fixture calendar to the fixture date made all three focused cases pass. | Keep the fixture date and timezone pinned; cover them in the combined focused and full-scheme reruns. |
| Labels Calendar switch | The original test queried `app.switches["Calendar"]`, which matches an identifier, and ran while the editor's name field had focus. The partial-row snapshot showed a blank second switch. After scrolling the form and querying by accessible label, the case passed on the original `Toggle(scope.title, ...)` implementation. | Keep the scroll and label-based query; no product accessibility defect was reproduced. Verify the case in the combined focused and full-scheme reruns. |
| Notes line-history toggle | The test edited text with the keyboard open and immediately tapped the toolbar toggle. Dismissing the keyboard and waiting for the value change made the focused case pass. | Keep keyboard dismissal and the condition-based wait; verify in combined focused and full-scheme reruns. |
| Paths merge button | The merge action is in the edit form's final section. Scrolling to it before querying made the focused merge/undo case pass. | Keep the scroll-to-control behavior and verify in combined focused and full-scheme reruns. |
| Session label ordering | The test compared `minY` for chips in one horizontal row. Comparing `minX` made the selected-first picker case pass. | Keep the horizontal ordering assertion and verify in combined focused and full-scheme reruns. |

The focused run at commit `588c1cc` exercised all seven original failure cases
on the hosted Mac and iPhone 17 Pro / iOS 26.5 destination. Six passed after
test-harness changes; the Labels locator still failed. See
[run 37899618008](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/37899618008).

The Labels test then passed after scrolling the form and locating Calendar by
its accessible label on both an explicit-label variant and the original
`Toggle(scope.title, ...)` source. The latter run is
[37903974831](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/37903974831).
This confirms a test query/visibility issue rather than a product defect. A
combined rerun of all seven cases passed at commit `98c1a63`: 7 tests, 0
failures, on the same hosted Mac and iPhone 17 Pro / iOS 26.5 destination. See
[run 37904668069](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/37904668069).
The full `Know` scheme is being rerun with the documented ad hoc signing
settings in [run 37905570002](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/37905570002);
until it completes, the original full-scheme failure remains the authoritative
release-gate result.

## Keychain signing diagnostic

| Field | Value |
| --- | --- |
| Result | **Passed**, targeted diagnostic only |
| Commit | `8476e8d5b537346081eb81790c67bf2c5fbd60a3` |
| GitHub Actions run | [37896776559](https://github.com/kubilaycaglayan/knowledge-base/actions/runs/37896776559) |
| Host / tools | macOS 26.6.2 (25G83), Xcode 26.6 (17F113), XcodeGen 2.46.0 |
| Destination | iPhone 17 Pro simulator, iOS 26.5 (23F77), arm64 |
| Test | `KnowTests.testKeychainPersistsReplacesAndDeletesSession`: 1 passed, 0 failed |
| Signing | `CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=` |
| Result artifact | `hard06-keychain-37896776559`, `.xcresult`, retained by Actions for 30 days |

The source test that failed in the full unsigned run passed on the same host
and simulator with ad hoc signing. The supported command now uses these
simulator signing settings. The full unit suite has not been rerun with that
configuration, and the seven UI failures remain unresolved.

## Acceptance impact

- Confirms a clean-checkout XcodeGen and full-scheme simulator command can run
  on an actual hosted macOS/Xcode environment.
- Demonstrates that the initial full native test run is not a passing release
  gate: seven UI tests failed, and one unit failure is consistent with its
  signing-disabled test configuration. A targeted ad hoc-signed rerun of that
  unit test passed, but the full unit suite has not been repeated with it.
- Confirms the result bundle was uploaded on failure. The workflow retained it
  for 30 days; retain or mirror it to the release record before that expires.
- Does not establish live-backend, server-persistence, VoiceOver, or full
  device/locale/time-zone coverage. The live Reports test was skipped.
- Does not change the historical disabled iOS workflow jobs.
