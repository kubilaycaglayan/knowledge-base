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

These are observed failures, not confirmed root causes. The result bundle and
failure diagnostics are available from the linked Actions run. Triage the
remaining UI test failures through the repository's bug-fix workflow; this
test-hardening milestone does not silently classify the failed cases as
passing or repair product behavior. The Keychain failure is consistent with
the unsigned test configuration, but does not by itself prove the cause.

### Source-level triage (not yet reproduced or verified)

Inspection after the run found several plausible test-harness or query issues.
These are leads for follow-up, not resolutions; each remains a failed test
until a focused rerun on the supported simulator demonstrates the fix.

| Failure | Source observation | Follow-up evidence needed |
| --- | --- | --- |
| Three calendar day queries | `CalendarModel` receives its default `Date()` in `WorkspaceView`, while the saved fixture and assertions use September 2026. The run date was October 2026, so the visible month may not contain the fixture's expected day identifiers. | Freeze the UI fixture's calendar, locale, and date consistently, then rerun all calendar UI cases and check month navigation/API date keys. |
| Labels Calendar switch query | The editor constructs each switch with `scope.title`, but the test queries `app.switches["Calendar"]` as though that string were a stable identifier. | Inspect the failure snapshot and query by an explicit accessible identifier/label; verify VoiceOver names and selected state rather than weakening the assertion. |
| Notes line-history toggle | The control exposes an accessibility value and toggles state; the test reads the value immediately after tapping. | Use a condition-based wait for the value and verify the history list appears/disappears through the accessible tree. If the value does not update, route the behavior through bug-fix workflow. |
| Paths merge button | The button is nested in the edit form's final section and the test does not scroll before asserting it exists. | Determine whether the control is outside the sheet's accessible viewport; scroll the form and verify the merge confirmation and undo flow. |
| Session label ordering | The assertion compares `minY` for chips rendered in a horizontal row; equal vertical coordinates do not establish their order. | Assert horizontal order (`minX`) and selected-first behavior, then rerun the picker case. |

The seven UI failures have not been repaired in this documentation-only
milestone. The follow-up must preserve accessibility checks and distinguish
test-query mistakes from native behavior defects. Do not change the disabled
workflow until a full supported-host run passes with the documented signing
configuration.

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
