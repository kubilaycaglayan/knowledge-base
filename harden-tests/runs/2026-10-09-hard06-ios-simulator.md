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
| `KnowTests.testKeychainPersistsReplacesAndDeletesSession` | Keychain save threw `storage` at `ios/KnowTests/KnowTests.swift:72`. |
| `KnowUITests.testCalendarLoadingAndExpiredSessionFixtures` | Calendar fixture did not expose the `calendar.day.2026-09-13` button within 8 seconds (`KnowUITests.swift:704`). |
| `KnowUITests.testCalendarLongPressAndTapCompleteInclusiveRange` | Could not find the `calendar.day.2026-09-13` start button (`KnowUITests.swift:762`). |
| `KnowUITests.testCalendarSavedFixtureShowsAccessibleDayAndRangeControls` | Could not find the `calendar.day.2026-09-03` button (`KnowUITests.swift:682`). |
| `KnowUITests.testLabelsListAndCreateControlsAreReachable` | The Calendar scope switch had no matching `Calendar` accessibility identifier (`KnowUITests.swift:990`). |
| `KnowUITests.testNotesLineHistoryListsEachLineWithItsEditTime` | The line-history toggle remained `On` after the test tapped it; expected `Off` (`KnowUITests.swift:1075`). |
| `KnowUITests.testPathsMergeRequiresConfirmationAndRemoveOffersUndo` | The `paths.merge` button was absent after opening path edit (`KnowUITests.swift:853`). |
| `KnowUITests.testSessionLabelsPickerHasSummaryCompactPriorityAndKeyboardAccessibleToggle` | The selected and unselected label rows shared the same vertical position, `424.0` (`KnowUITests.swift:1190`). |

These are observed failures, not confirmed root causes. The result bundle and
failure diagnostics are available from the linked Actions run. Triage the
underlying test or product issues through the repository's bug-fix workflow;
this test-hardening milestone does not silently classify the failed cases as
passing or repair product behavior.

## Acceptance impact

- Confirms a clean-checkout XcodeGen and full-scheme simulator command can run
  on an actual hosted macOS/Xcode environment.
- Demonstrates that the current full native test suite is not a passing release
  gate: one unit test and seven UI tests failed.
- Confirms the result bundle was uploaded on failure. The workflow retained it
  for 30 days; retain or mirror it to the release record before that expires.
- Does not establish live-backend, server-persistence, VoiceOver, or full
  device/locale/time-zone coverage. The live Reports test was skipped.
- Does not change the historical disabled iOS workflow jobs.
