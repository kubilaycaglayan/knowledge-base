# HARD-06 native test inventory

Inventory inspected from `ios/KnowTests/` and `ios/KnowUITests/`. “Unit” means
Swift/XCTest model, API transport, or conversion assertions using stubs and
fixtures. “UI” means an `XCUIApplication` simulator flow, generally launched
with in-memory fixtures. Neither label means live-backend coverage. The
historical disabled workflow does not run the complete UI suite.

## Simulator UI tests

All names below are methods of `KnowUITests` in
[`KnowUITests.swift`](../../ios/KnowUITests/KnowUITests.swift). Unless noted,
the test checks rendered controls and fixture state, not persistence to a
server.

| Screen/flow | Automated simulator test names | Evidence and gaps |
| --- | --- | --- |
| Sign in, registration, session | `testAuthenticationControlsAreReachable`, `testPasswordVisibilityCanBeToggled`, `testEmptySubmissionShowsInlineValidation`, `testMalformedEmailShowsInlineValidationWithoutSubmitting`, `testAuthenticationModeCanSwitchToRegistration`, `testAuthenticationModeSwitchPreservesDraftFields`, `testRegistrationRequiresMatchingPasswordConfirmation`, `testAuthenticationControlsRemainReachableAtAccessibilityTextSize`, `testAuthenticationAppearanceScreenshots`, `testSignOutReturnsToAuthenticationFlow` | UI fixtures cover form controls, validation, mode switch, sign out, text size, appearance. Real sign-in, registration, session restore/expiry, Google consent/cancel/error are not end-to-end simulator/backend flows. |
| Workspace entry | `testAuthenticatedWorkspaceControlsAreReachable` | Fixture navigation checks Paths and Sessions entry points; not a complete screen sweep. |
| Reports | `testReportsDestinationAndAccessibleSummaryAreReachable`, `testReportsDateButtonsOpenAccessiblePickerAndReturnToSummary`, `testReportsFixtureScreenshotEvidence`, `testReportsLiveAPIFlowWhenExplicitlyConfigured`, `testReportsRemainReadableAtAccessibilityTextSize`, `testReportsRemainUsableWithReducedMotion`, `testReportsFollowLiveAppearanceChangesWithoutReloading`, `testReportsRemainReachableInLandscape`, `testReportsUseLargePhoneWidthWithoutHorizontalOverflow`, `testReportsRemainUsableOnSmallPhoneWidth`, `testReportsEmptyStateAndRecoverableErrorFixtures`, `testReportsOfflineFixtureKeepsRetryAndSessionRecoveryAvailable`, `testReportsCalendarAndSankeyFixturesExposeTextualDetails`, `testReportsCalendarNoteOnlyAndFractionFixturesExposeDistinctDetails`, `testReportsReferenceFailureFallsBackToReportCategories`, `testReportsLongFilterOptionsKeepAccessibleRemovalControls`, `testReportsZeroAndLongRangeFixturesRemainNavigable`, `testReportsDenseFixtureKeepsLargeCategoryCollectionsReadable`, `testReportsGeneratedContentRemainsLiteralText`, `testReportsLoadingSkeletonAndEmptySankeyRemainRecoverable`, `testReportsFiltersAndPresentationRestoreAcrossWorkspaceSections` | UI fixture coverage includes empty/error/offline, recovery, accessible summaries, layout and appearance. Only `testReportsLiveAPIFlowWhenExplicitlyConfigured` touches a live API, and it is opt-in. No automated VoiceOver session or persistence check. |
| Calendar | `testCalendarNavigationGridAndEditorAreReachable`, `testCalendarSavedFixtureShowsAccessibleDayAndRangeControls`, `testCalendarOfflineFixtureOffersRetryWithoutSigningOut`, `testCalendarLoadingAndExpiredSessionFixtures`, `testCalendarPortionsRangeAlternativeAndFailedSaveRetainDraft`, `testCalendarCreatesLabelWithCustomPaletteColor`, `testCalendarLongPressAndTapCompleteInclusiveRange`, `testCalendarControlsRemainReachableInDarkAccessibilityAppearance`, `testCalendarLightSystemAndReducedMotionAppearances` | Fixture UI checks navigation, save draft/error, accessibility size/appearance and gestures. No fixed locale/timezone UI run or server persistence verification. |
| Paths | `testNewPathDraftRequiresDiscardConfirmation`, `testPathsHistoryAndEditControlsAreReachable`, `testPathsEmptyAndOfflineFixturesOfferRecovery`, `testPathsMergeRequiresConfirmationAndRemoveOffersUndo`, `testPathsControlsRemainReachableAtAccessibilityTextSize`, `testPathsAccessibilityNamesAndRemovalRecoveryAnnouncement` | Fixture UI checks draft discard, merge/remove affordances, empty/offline recovery and accessible names. No server-backed CRUD/undo verification. |
| Logs | `testLogsComposerEditDeleteAndLabelsAreReachable`, `testLogsCreateAnnouncesSuccess`, `testLogsEmptyAndOfflineFixturesOfferRecovery`, `testLogsControlsRemainReachableAtAccessibilityTextSize`, `testLogsAppearanceScreenshots` | Fixture UI checks composer, edit/delete, labels, empty/offline, announcement and layout. No backend persistence/relaunch check. |
| Labels | `testLabelsListAndCreateControlsAreReachable`, `testLabelsEmptyAndOfflineFixturesOfferRecovery` | Fixture UI checks list/create and empty/offline states; edit/delete, validation failures, color accessibility, and API persistence are not covered in UI. |
| Notes | `testNotesListEditorAndArchiveControlsAreReachable`, `testNotesLineHistoryListsEachLineWithItsEditTime`, `testNotesEmptyAndOfflineFixturesOfferRecovery`, `testArchivedNotesCanBeRestored`, `testNotesControlsRemainReachableAtAccessibilityTextSize`, `testNotesAppearanceScreenshots` | Fixture UI checks list/editor/archive/restore and line-history rendering. Saved line conversion also has Foundation unit coverage, but native save-to-server, conflict retry, relaunch persistence, and rendered recovery are not covered. |
| Sessions/timer | `testSessionsTimerAndMultipleLabelCreation`, `testSessionLabelsPickerHasSummaryCompactPriorityAndKeyboardAccessibleToggle`, `testSessionLabelsCanBeCreatedFromAnEmptyStateWithoutAChevron`, `testSessionEditPersistsAndDeletionRequiresConfirmation`, `testSessionUnsavedChangesCanBeKeptOrDiscarded`, `testSessionsOfflineRetryAndEmptyState`, `testSessionsAppearanceScreenshots` | UI fixture checks timer/selection/editor states and recovery. “Persists” in the test name is fixture/model state, not live API persistence. No native live WebSocket/reconnect/background flow. |

`testReportsLiveAPIFlowWhenExplicitlyConfigured` is the sole opt-in real API UI
test currently identified. It is intentionally excluded from the default
manual release command; its isolated-data procedure is in
[`06-supported-validation.md`](06-supported-validation.md).

## Required behavior matrix disposition

“Automated” below names existing source evidence only. “Deferred” means the
required native/backend/device behavior has no adequate current test and must
not be reported as passed. A release owner may record a manual check for a
deferred item, with host, device, and artifact evidence, but there is no such
run record for this milestone yet.

| Required flow | Current automated evidence | Disposition of uncovered behavior |
| --- | --- | --- |
| Launch and auth | `KnowTests.testPasswordLoginTrimsEmailAndPreservesPassword`, `testRegistrationUsesSharedEndpoint`, `testGoogle*`, `testRejectedCredentialsShowErrorAndAllowRetry`, `testRefreshUnauthorizedExpiresCurrentSession`; UI auth methods listed above | Deferred: real backend login/register, restore/expiry rendered states, Google consent outcomes, and systematic keyboard/accessibility states. |
| Notes | `NotesTests` conversion, line rules, pagination, create/archive model, conflict/replay; Notes UI methods listed above | Deferred: API persistence after navigation/relaunch, server-backed archive/restore, save conflict/retry and failure recovery. |
| Sessions/timer | `SessionsTests` start/stop snapshot, retry, stale poll, socket snapshot; session UI methods listed above | Deferred: live API/WebSocket, server one-running invariant, reconnect/background/foreground and two-client delivery. |
| Logs | `LogsTests` create/edit/delete, conflict, retry and unauthorized; Logs UI methods listed above | Deferred: rendered server-backed persistence, empty/history and full mutation failure flows. |
| Paths | `PathsTests` CRUD model, merge/remove transport, undo and recovery; Paths UI methods listed above | Deferred: rendered server persistence, confirmation/undo across navigation, ownership and VoiceOver traversal. |
| Labels | `LabelsTests` validation, create/edit/delete and recovery; Labels UI list/create methods above | Deferred: UI edit/delete, color/name accessibility and API persistence. |
| Calendar | `CalendarTests` date math, drafts, cache, ranges, failures and races; Calendar UI methods above | Deferred: server date-key persistence and frozen locale/timezone/DST simulator matrix. |
| Reports | `ReportsTests` ranges, filters, aggregation, failures and fixtures; Reports UI methods above | Automated fixture UI and one opt-in live API flow. Deferred: server-backed persistence (read-only), VoiceOver chart traversal, and full supported-device/locale matrix. |

Across screens, largest Dynamic Type is covered only by selected auth,
reports, paths, logs, and notes flows; the session picker has a keyboard
accessibility case. Systematic VoiceOver, keyboard, safe-area, rotation,
device-size, appearance, and locale/time-zone evidence remains deferred. Mobile
Chrome is a web-client validation category and must be reported separately;
the mobile browser run is not native simulator evidence.

## Unit/model/API test suites

These `XCTestCase` methods use deterministic values, model transports, or
`URLProtocol` stubs. They provide no rendered SwiftUI evidence. Method names
below are grouped by test class and source file to make missing screen coverage
auditable.

| Test class / source | Test names and covered behavior |
| --- | --- |
| `KnowTests` — [`KnowTests.swift`](../../ios/KnowTests/KnowTests.swift) | `testAPIClientPreservesQueryItemsAndDecodesNullTimer`; `testSessionDraftEncodesExplicitClearsAndMultipleLabels`; `testKeychainPersistsReplacesAndDeletesSession`; `testPasswordLoginTrimsEmailAndPreservesPassword`; `testRegistrationUsesSharedEndpoint`; `testGoogleExchangesIDTokenForBackendSession`; `testRejectedCredentialsShowErrorAndAllowRetry`; `testMalformedAuthResponsePreservesExistingSession`; `testMissingGoogleConfigurationDoesNotContactBackend`; `testGoogleCancellationReturnsToIdleWithoutError`; `testGoogleVerificationFailureUsesGoogleRecoveryCopy`; `testGoogleConfigurationRequiresMatchingIDsAndCallbackScheme`; `testClearingAuthenticationErrorReturnsPhaseToIdle`; `testFormatSecondsUsesHoursAndMinutes`; `testIOSTimerRequestEncodesCanonicalSourceAndTargets`; `testLabelRequestEncodesSharedLabelFields`; `testLogsAPIUsesAuthenticatedContractAndFullLabelReplacement`; `testPathsAPIUsesAuthenticatedMutationContract`; `testNotesAPIUsesAuthenticatedPaginationAndMutationContract`; `testNativeColorPaletteMatchesWebSharedPalette`; `testReportsThemeTextAndControlContrastInBothAppearances`; `testReportsChartPaletteAdaptsToThreeToOneContrastInBothAppearances`; `testReportsThemeNonTextControlsGridlinesFocusAndSelectedIndicatorsMeetContrast`; `testUITestingLaunchArgumentIsRecognized`; `testAuthenticatedUITestingFixtureSkipsNetworkRefresh`; `testStatisticsDecodesLabelBreakdowns`; `testAPIClientDecodesResponsesAndAddsBearerToken`; `testAPIClientMapsUnauthorizedResponses`; `testCalendarAPIUsesScopedAuthenticatedContracts`; `testAPIClientRetriesTransientFailuresAndSurfacesOfflineState`; `testAPIClientDoesNotRetryNonIdempotentRequests`; `testAppModelSurfacesOfflineRefreshState`; `testRefreshUnauthorizedExpiresCurrentSession` |
| `NotesTests` — [`NotesTests.swift`](../../ios/KnowTests/NotesTests.swift) | `testDocumentRoundTripsRichTextToPlainTextAndJSON`; `testPlainTextKeepsEachRichLineSeparate`; `testPlainTextRoundTripsBlankLinesAndFallsBackForNonDocuments`; `testLineHistorySavedLinesFollowTheServerLineRules`; `testLineHistoryMatchesTaskLinesWithoutTheirCheckbox`; `testLineHistoryRowsKeepSavedTimesAndMarkTypedLinesUnsaved`; `testLineHistoryIgnoresTimesThatDoNotMatchTheSavedBody`; `testPaginationIsCachedByQueryAndPageSettings`; `testCreateAndArchiveRefreshTheCurrentPage`; `testConflictFetchesLatestVersionAndReplaysDraft`; `testPinAndReorderUseTheWebNoteContracts` |
| `SessionsTests` — [`SessionsTests.swift`](../../ios/KnowTests/SessionsTests.swift) | `testLoadUsesScopedLabelsAndOnlyActiveRecentPaths`; `testIdlePollingPreservesPreparedTimer`; `testStartStopUsesAllSelectionsAndServerSnapshot`; `testFailedStopKeepsTimerAndAllowsRetry`; `testStalePollCannotResurrectStoppedTimer`; `testSocketReadyInvalidatesInflightPollAndCompletedSnapshotsClearTimer`; `testSnapshotPreservesDescriptionBeingEdited`; `testCreationTrimsAndAssignsWithoutDuplicateLabels`; `testInvalidHistoryEditDoesNotWriteAndFailureRetainsDraft`; `testEmptyLastPageFallsBackToExistingPage`; `testDurationsAndClockMatchWebBoundaries`; `testDateGroupsUseLocalDayAndMondayWeek` |
| `LogsTests` — [`LogsTests.swift`](../../ios/KnowTests/LogsTests.swift) | `testTimestampParsingAndSorting`; `testDeviceTimestampFollowsLocalMinute`; `testLogLabelsRetainColorAndScope`; `testGroupsRespectLocalMondayAndHourBoundaries`; `testEveryLogCalendarGroupBoundary`; `testCreateTrimsAndKeepsChangedDraftDuringRequest`; `testConflictFetchesLatestVersionAndRetriesSnapshot`; `testFailedEditRetainsDraftForRetry`; `testLabelReplacementAndDelete`; `testFailedDeleteKeepsLogAvailableForRetry`; `testUnauthorizedLoadExpiresSessionThroughRecoveryCallback` |
| `PathsTests` — [`PathsTests.swift`](../../ios/KnowTests/PathsTests.swift) | `testLoadCreateAndUpdatePreservePathFields`; `testRemoveOffersUndoAndMergeUsesServerTransport`; `testBlankNameAndOfflineLoadAreRecoverable`; `testHistoryFormattingUsesLocalGroupsAndFiltersTimerBookkeeping`; `testUnauthorizedExpiresSessionAndServerFailurePreservesRetryState` |
| `LabelsTests` — [`LabelsTests.swift`](../../ios/KnowTests/LabelsTests.swift) | `testCodableAndLocalizedSorting`; `testNewLabelUsesFirstSharedPaletteColorAndHidesCalendarByDefault`; `testCreateTrimsAndRetainsDraftOnFailure`; `testValidationRequiresNameButAllowsAHiddenEverywhereLabel`; `testEditFailureRetainsDraftAndDeleteUsesSecondConfirmationPath`; `testUnauthorizedCallsSignOutAndMutationsInvalidateReports` |
| `CalendarTests` — [`CalendarTests.swift`](../../ios/KnowTests/CalendarTests.swift) | `testMondayFirstGridHasSixWeeksAndAdjacentDays`; `testLocalDateRoundTripDoesNotUseUTCInstant`; `testCodablePreservesNullableNoteColorAndPortions`; `testLoadHydratesDraftAndReusesCachedRange`; `testRefreshPreservesDirtyDraftAndEmptyResponseClearsLoadedMonth`; `testLoadFailureOffersRetryAndDoesNotLoseCredentialsState`; `testBlankNoteTrimsToNullAndPortionToggleSaves`; `testSaveCapsLongNoteAndCreateLabelRejectsInvalidColorAndDuplicates`; `testRangeNormalizesSameDayFallsBackAndRetainsDraftOnFailure`; `testLabelCreateTrimsAndColorUpdateUsesFixedPalette`; `testUnauthorizedLoadCallsSignOutAndMutationInvalidatesReports`; `testMonthChangeSelectsFirstDayAndCachedReturnHydratesIt`; `testNewerMonthSuppressesStaleLoadAndConcurrentSaveIsRejected`; `testLoadingStateIsObservableUntilBothCalendarRequestsSettle` |
| `ReportsTests` — [`ReportsTests.swift`](../../ios/KnowTests/ReportsTests.swift) | `testDurationFormattingUsesTheRequestedLocale`; `testDefaultAndAllPresetsUseInclusiveLocalDates`; `testQueryDeduplicatesDeterministicallyAndRepeatsFilters`; `testReportsAPIUsesBearerAndReadOnlyScopedContracts`; `testShiftPreservesPresentationIndependentQueryValues`; `testShiftPreservesFiltersAndPresentationState`; `testRangeValidationRejectsIncompleteReversedAndOverlongWithoutLoading`; `testUnchangedRangeAndAggregationDoNotStartRedundantLoads`; `testPresentationOnlyChangesDoNotStartReportLoads`; `testAggregationPresetsResetExpectedRangesAndYearKeepsCurrentRange`; `testTrendlineUsesNonEmptyPointsAndQuadraticFallback`; `testBucketsRetainZeroDaysAndGroupMondayWeeks`; `testBucketsUseNaturalMonthQuarterAndYearBoundaries`; `testPartialBoundaryBucketsRetainSemanticLabelsAndCategoryTotals`; `testLocalDateShiftsAcrossDaylightSavingByCalendarDays`; `testDisplayedActiveDaysUseFilteredPathDurationsNotCalendarOrRawDayTotal`; `testModelCachesSuccessRetainsQueryOnFailureAndSignsOutClearsCache`; `testReferenceOptionsUseTimeEntryScopeAndFallBackToReportCategories`; `testMalformedReportIsRejectedAsRecoverableError`; `testTimeoutUsesRecoverableTimeoutCopyWithoutSigningOut`; `testCurrentReportUnauthorizedResponseUsesRecoveryCallback`; `testDelayedUnauthorizedFromSupersededLoadCannotSignOutNewAccount`; `testNonAuthHTTPFailuresRemainRecoverableWithoutSignOut`; `testAllNamedPresetsReturnCompleteExpectedRanges`; `testReportCodableRoundTripPreservesCalendarAndSankeyDetails`; `testFixtureCalendarNoteOnlyAndFractionalPortionsRemainDistinct`; `testFixtureLongZeroAndSparseIntervalsRemainStructurallyValid`; `testDenseFixturePreservesLargeCategoryCollections`; `testBucketCollectionsAreCachedForUnchangedPresentationQuery`; `testNormalizedServerBoundariesBecomeTheDisplayedQuery`; `testEquivalentLoadsDoNotStartDuplicateInFlightRequests`; `testFirstActivationLoadsReportAndReferencesOnce`; `testOlderRangeCompletionCannotReplaceNewerReport`; `testRefreshRetainsVisibleReportWhileFailureIsInFlightAndAfterwards`; `testFilterChangeRetainsVisibleReportDuringMatchingRefresh`; `testFixtureHonorsRepeatedPathAndLabelFiltersWithoutAccountAccess` |

## Named gaps from this inventory

- Model tests exercise API contracts with stubs; they do not verify a deployed
  API, persistence after app navigation/relaunch, or account isolation against
  a real service.
- Native UI fixtures currently do not run create/edit/archive/restore against
  a disposable backend account. Only the opt-in Reports test is live API.
- Screens with incomplete UI journeys include label edit/delete; note save,
  conflict and restore persistence; path server CRUD/undo; logs persistence;
  calendar server date-key persistence; and timer server invariant and
  two-client WebSocket delivery.
- The UI suite pins English, `en_US_POSIX`, and UTC at launch; the calendar UI
  fixture pins a reference date; and UI test mode disables SwiftUI animations.
  Largest Dynamic Type is covered only by selected auth, reports, paths, logs,
  and notes flows. Systematic VoiceOver traversal, keyboard behavior beyond
  the session label picker, rotation/device matrix, and systematic light/dark
  coverage for every screen remain deferred.
- Manual device verification and deferred flows need explicit release-record
  entries before they can be counted as evidence.
