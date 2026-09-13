import XCTest

final class KnowUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["-ui-testing"]
    }

    override func tearDownWithError() throws {
        // Sessions starts foreground/socket tasks; terminate explicitly so the
        // next case gets a clean launch argument set and no stale task tree.
        app?.terminate()
        app = nil
        try super.tearDownWithError()
    }

    func testAuthenticationControlsAreReachable() {
        app.launch()
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields["auth.password"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["auth.password.visibility"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["auth.submit"].exists)
        // Public test builds leave OAuth IDs blank, matching the web's hidden
        // Google control until a local/production client is configured.
        XCTAssertTrue(app.staticTexts["Sign in"].exists)
    }

    func testPasswordVisibilityCanBeToggled() {
        app.launch()
        let password = app.secureTextFields["auth.password"]
        let visibility = app.buttons["auth.password.visibility"]
        XCTAssertTrue(password.waitForExistence(timeout: 5))
        XCTAssertEqual(visibility.label, "Show password")
        password.tap()
        password.typeText("password123")
        visibility.tap()
        XCTAssertTrue(app.textFields["auth.password"].exists)
        XCTAssertEqual(app.textFields["auth.password"].value as? String, "password123")
        XCTAssertEqual(visibility.label, "Hide password")
        visibility.tap()
        XCTAssertTrue(app.secureTextFields["auth.password"].exists)
        XCTAssertEqual((app.secureTextFields["auth.password"].value as? String)?.count, "password123".count)
        XCTAssertEqual(visibility.label, "Show password")
    }

    func testEmptySubmissionShowsInlineValidation() {
        app.launch()
        app.buttons["auth.submit"].tap()
        XCTAssertTrue(app.staticTexts["Enter a valid email address."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["auth.submit"].isEnabled)
    }

    func testMalformedEmailShowsInlineValidationWithoutSubmitting() {
        app.launch()
        let email = app.textFields["auth.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        email.tap()
        email.typeText("person@@example.com")
        app.buttons["auth.submit"].tap()
        XCTAssertTrue(app.staticTexts["Enter a valid email address."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["auth.submit"].isEnabled)
    }

    func testAuthenticationModeCanSwitchToRegistration() {
        app.launch()
        let mode = app.buttons["auth.mode"]
        XCTAssertTrue(mode.waitForExistence(timeout: 5))
        mode.tap()
        XCTAssertEqual(app.buttons["auth.submit"].label, "Create account")
        XCTAssertTrue(app.secureTextFields["auth.passwordConfirmation"].exists)
    }

    func testAuthenticationModeSwitchPreservesDraftFields() {
        app.launch()
        let email = app.textFields["auth.email"]
        let password = app.secureTextFields["auth.password"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        email.tap()
        email.typeText("learner@example.com")
        password.tap()
        password.typeText("password123")
        app.buttons["auth.mode"].tap()
        XCTAssertEqual(email.value as? String, "learner@example.com")
        // XCTest exposes secure-field values as masking bullets, while the
        // field itself retains the entered credential.
        XCTAssertEqual((password.value as? String)?.count, "password123".count)
        XCTAssertEqual(app.buttons["auth.submit"].label, "Create account")
    }

    func testRegistrationRequiresMatchingPasswordConfirmation() {
        app.launch()
        app.buttons["auth.mode"].tap()
        let email = app.textFields["auth.email"]
        let password = app.secureTextFields["auth.password"]
        let confirmation = app.secureTextFields["auth.passwordConfirmation"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 5))
        email.tap()
        email.typeText("learner@example.com")
        password.tap()
        password.typeText("password123")
        confirmation.tap()
        confirmation.typeText("password321")
        app.buttons["auth.submit"].tap()
        XCTAssertTrue(app.staticTexts["Passwords do not match."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["auth.submit"].isEnabled)
    }

    func testAuthenticationControlsRemainReachableAtAccessibilityTextSize() {
        app.launchArguments += [
            "-UIPreferredContentSizeCategory",
            "UICTContentSizeCategoryAccessibilityXXXL",
        ]
        app.launch()
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields["auth.password"].exists)
        app.swipeUp()
        XCTAssertTrue(app.buttons["auth.submit"].exists)
        XCTAssertTrue(app.buttons["auth.mode"].exists)
    }

    func testAuthenticationAppearanceScreenshots() {
        for mode in ["Light", "Dark", "System"] {
            app.launchArguments = mode == "System"
                ? ["-ui-testing"]
                : ["-ui-testing", "-AppleInterfaceStyle", mode]
            app.launch()
            XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 5))
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "Authentication-\(mode)"
            screenshot.lifetime = .keepAlways
            add(screenshot)
            app.terminate()
        }
    }

    func testAuthenticatedWorkspaceControlsAreReachable() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()

        XCTAssertTrue(app.buttons["workspace.paths"].waitForExistence(timeout: 5))
        app.buttons["workspace.paths"].tap()
        XCTAssertTrue(app.buttons["paths.add"].waitForExistence(timeout: 5))
        app.buttons["paths.add"].tap()
        XCTAssertTrue(app.textFields["paths.name"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textViews["paths.description"].exists)
        XCTAssertTrue(app.buttons["paths.save"].exists)
        app.buttons["Cancel"].firstMatch.tap()

        app.buttons["workspace.sessions"].tap()
        XCTAssertTrue(app.buttons["workspace.sessions"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["timer.path"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["timer.label.00000000-0000-4000-8000-000000000002"].exists)
    }

    func testReportsDestinationAndAccessibleSummaryAreReachable() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        let reports = app.buttons["workspace.reports"]
        XCTAssertTrue(reports.waitForExistence(timeout: 5))
        XCTAssertFalse(reports.isSelected)
        reports.tap()
        XCTAssertTrue(reports.isSelected)
        XCTAssertTrue(app.descendants(matching: .any)["reports.page"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Reports"].exists)
        XCTAssertTrue(app.staticTexts["SUMMARY"].exists)
        XCTAssertTrue(app.staticTexts["Tracked time"].exists)
        XCTAssertTrue(app.staticTexts["3h 40m"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["reports.aggregation"].exists || app.segmentedControls["reports.aggregation"].exists)
        let previous = app.buttons["Previous"]
        let next = app.buttons["Next"]
        XCTAssertTrue(previous.exists); XCTAssertTrue(next.exists)
        XCTAssertGreaterThanOrEqual(previous.frame.height, 44)
        XCTAssertGreaterThanOrEqual(next.frame.height, 44)
        let bucket = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'reports.bucket.'")).firstMatch
        XCTAssertTrue(bucket.waitForExistence(timeout: 5)); XCTAssertTrue(bucket.label.contains("Research"))
        let breakdown = app.buttons["reports.breakdown"]
        XCTAssertTrue(breakdown.waitForExistence(timeout: 5)); breakdown.tap()
        let labelChoices = app.buttons.matching(NSPredicate(format: "label == 'Labels'"))
        XCTAssertTrue(labelChoices.count > 1); labelChoices.element(boundBy: labelChoices.count - 1).tap()
        XCTAssertTrue(app.staticTexts["Deep work"].exists)
    }

    func testReportsEmptyStateAndRecoverableErrorFixtures() {
        app.launchArguments += ["-ui-testing-authenticated", "-reports-empty"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.staticTexts["No report data for this period."].waitForExistence(timeout: 5))

        app.terminate(); app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-authenticated", "-reports-error"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.staticTexts["Unable to load the report. Please try again."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["reports.retry"].exists)
        XCTAssertTrue(app.buttons["workspace.signOut"].exists)
    }

    func testReportsCalendarAndSankeyFixturesExposeTextualDetails() {
        app.launchArguments += ["-ui-testing-authenticated", "-reports-calendar", "-reports-sankey"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.buttons["reports.calendar.toggle"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["DAILY RECORDS"].exists)
        XCTAssertTrue(app.staticTexts["Calendar log"].exists)
        XCTAssertTrue(app.staticTexts["Calendar totals"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'marked day'" )).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Planning'")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Deep focus'")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Marked'")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Calendar input'")).firstMatch.exists)
        app.buttons["reports.calendar.toggle"].tap()
        XCTAssertTrue(app.buttons["reports.calendar.toggle"].label.contains("Show calendar inputs"))
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Calendar input'")).firstMatch.exists)
        app.buttons["reports.calendar.toggle"].tap()
        app.buttons["Show Sankey"].tap()
        XCTAssertTrue(app.staticTexts["TIME FLOW"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Path timing by day"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Flow from Research to Deep work'")).firstMatch.exists)
        XCTAssertTrue(app.buttons["Show bar chart"].exists)
    }

    func testReportsCalendarNoteOnlyAndFractionFixturesExposeDistinctDetails() {
        app.launchArguments += ["-ui-testing-authenticated", "-reports-calendar-fractions"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.buttons["reports.calendar.toggle"].waitForExistence(timeout: 5))
        for portion in ["0.25 days", "0.5 days", "0.75 days", "1 day"] { XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", portion)).firstMatch.exists) }
        app.terminate(); app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-authenticated", "-reports-calendar-note-only"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.buttons["reports.calendar.toggle"].waitForExistence(timeout: 5)); XCTAssertTrue(app.staticTexts["Planning day\nReview the weekly priorities."].exists); XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Calendar input'")).firstMatch.exists)
    }

    func testReportsReferenceFailureFallsBackToReportCategories() {
        app.launchArguments += ["-ui-testing-authenticated", "-reports-paths-error", "-reports-labels-error"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.buttons["Choose paths"].waitForExistence(timeout: 5))
        app.buttons["Choose paths"].tap()
        XCTAssertTrue(app.buttons["Research"].waitForExistence(timeout: 3))
        app.buttons["Research"].tap()
        XCTAssertTrue(app.staticTexts["Research"].exists)
    }

    func testReportsLongFilterOptionsKeepAccessibleRemovalControls() {
        app.launchArguments += ["-ui-testing-authenticated", "-reports-long"]
        app.launch(); app.buttons["workspace.reports"].tap()
        app.buttons["reports.paths.filter"].tap(); let pathOption = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Research and planning with a very long path name'")).firstMatch
        XCTAssertTrue(pathOption.waitForExistence(timeout: 5)); pathOption.tap()
        XCTAssertTrue(app.buttons["reports.paths.remove.00000000-0000-0000-0000-000000000001"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["reports.paths.remove.00000000-0000-0000-0000-000000000001"].isHittable)
        app.buttons["reports.labels.filter"].tap(); let labelOption = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Deep work label with a long accessible name'")).firstMatch
        XCTAssertTrue(labelOption.waitForExistence(timeout: 5)); labelOption.tap()
        XCTAssertTrue(app.buttons["reports.labels.remove.00000000-0000-0000-0000-000000000011"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["reports.labels.remove.00000000-0000-0000-0000-000000000011"].isHittable)
        app.buttons["reports.breakdown"].tap(); let labelChoices = app.buttons.matching(NSPredicate(format: "label == 'Labels'")); XCTAssertTrue(labelChoices.count > 1); labelChoices.element(boundBy: labelChoices.count - 1).tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Deep work label with a long accessible name'")).firstMatch.exists)
    }

    func testReportsZeroAndLongRangeFixturesRemainNavigable() {
        app.launchArguments += ["-ui-testing-authenticated", "-reports-zero"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.staticTexts["0 active days"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["No tracked time in this period."].exists)
        app.terminate(); app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-authenticated", "-reports-long-range"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.staticTexts["Activity"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["SUMMARY"].exists)
    }

    func testReportsDenseFixtureKeepsLargeCategoryCollectionsReadable() {
        app.launchArguments += ["-ui-testing-authenticated", "-reports-dense"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.staticTexts["Dense path 12"].waitForExistence(timeout: 5))
        app.buttons["reports.breakdown"].tap(); let choices = app.buttons.matching(NSPredicate(format: "label == 'Labels'")); XCTAssertTrue(choices.count > 1); choices.element(boundBy: choices.count - 1).tap()
        XCTAssertTrue(app.staticTexts["Dense label 12"].waitForExistence(timeout: 5))
    }

    func testReportsGeneratedContentRemainsLiteralText() {
        app.launchArguments += ["-ui-testing-authenticated", "-reports-unsafe", "-reports-calendar"]
        app.launch(); app.buttons["workspace.reports"].tap()
        app.buttons["reports.paths.filter"].tap(); let unsafePath = app.buttons.matching(NSPredicate(format: "label CONTAINS '<script>alert(1)</script>'")).firstMatch
        XCTAssertTrue(unsafePath.waitForExistence(timeout: 5)); XCTAssertTrue(unsafePath.label.contains("<script>alert(1)</script>")); unsafePath.tap()
        app.buttons["reports.breakdown"].tap(); let labelChoices = app.buttons.matching(NSPredicate(format: "label == 'Labels'")); XCTAssertTrue(labelChoices.count > 1); labelChoices.element(boundBy: labelChoices.count - 1).tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS '<b>Deep work</b>'")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Calendar log"].waitForExistence(timeout: 5)); XCTAssertTrue(app.staticTexts["<em>Planning</em>"].exists)
    }

    func testReportsLoadingSkeletonAndEmptySankeyRemainRecoverable() {
        app.launchArguments += ["-ui-testing-authenticated", "-reports-loading"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.staticTexts["Loading report…"].waitForExistence(timeout: 1))

        app.terminate(); app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-authenticated", "-reports-empty", "-reports-sankey"]
        app.launch(); app.buttons["workspace.reports"].tap()
        XCTAssertTrue(app.staticTexts["No report data for this period."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Show Sankey"].exists)
        app.buttons["Show Sankey"].tap()
        XCTAssertTrue(app.staticTexts["No tracked time to show in this flow."].exists)
        XCTAssertTrue(app.buttons["Show bar chart"].exists)
    }

    func testReportsFiltersAndPresentationRestoreAcrossWorkspaceSections() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch(); app.buttons["workspace.reports"].tap()
        let pathsFilter = app.buttons["reports.paths.filter"]
        XCTAssertTrue(pathsFilter.waitForExistence(timeout: 5)); pathsFilter.tap()
        XCTAssertTrue(app.buttons["Research"].waitForExistence(timeout: 3)); app.buttons["Research"].tap()
        pathsFilter.tap(); XCTAssertTrue(app.buttons["Writing"].waitForExistence(timeout: 3)); app.buttons["Writing"].tap()
        let remove = app.buttons["reports.paths.remove.00000000-0000-0000-0000-000000000001"]
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["reports.paths.remove.00000000-0000-0000-0000-000000000002"].exists)
        app.buttons["reports.trendline"].tap()
        XCTAssertTrue(app.buttons["reports.trendline"].label.contains("Linear"))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Linear trend'")).firstMatch.exists)
        let labelsFilter = app.buttons["reports.labels.filter"]
        labelsFilter.tap(); XCTAssertTrue(app.buttons["Deep work"].waitForExistence(timeout: 3)); app.buttons["Deep work"].tap()
        labelsFilter.tap(); XCTAssertTrue(app.buttons["Planning"].waitForExistence(timeout: 3)); app.buttons["Planning"].tap()
        XCTAssertTrue(app.buttons["reports.labels.remove.00000000-0000-0000-0000-000000000011"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["reports.labels.remove.00000000-0000-0000-0000-000000000012"].exists)
        app.buttons["reports.labels.remove.00000000-0000-0000-0000-000000000011"].tap()
        XCTAssertFalse(app.buttons["reports.labels.remove.00000000-0000-0000-0000-000000000011"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["reports.labels.remove.00000000-0000-0000-0000-000000000012"].exists)
        app.buttons["workspace.paths"].tap(); XCTAssertTrue(app.buttons["workspace.paths"].isSelected)
        app.buttons["workspace.reports"].tap()
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["reports.trendline"].label.contains("Linear"))
        app.buttons["reports.labels.clear"].tap()
        XCTAssertFalse(app.buttons["reports.labels.remove.00000000-0000-0000-0000-000000000011"].waitForExistence(timeout: 2))
        XCTAssertTrue(remove.exists)
        app.buttons["reports.paths.clear"].tap()
        XCTAssertFalse(remove.waitForExistence(timeout: 2))
    }

    func testCalendarNavigationGridAndEditorAreReachable() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        let calendar = app.buttons["workspace.calendar"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 5))
        calendar.tap()
        XCTAssertTrue(calendar.isSelected)
        XCTAssertTrue(app.descendants(matching: .any)["calendar.grid"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["calendar.editor"].exists)
        XCTAssertTrue(app.buttons["Previous month"].exists)
        XCTAssertTrue(app.buttons["Next month"].exists)
        XCTAssertTrue(app.buttons["Select range"].exists)
    }

    func testCalendarSavedFixtureShowsAccessibleDayAndRangeControls() {
        app.launchArguments += ["-ui-testing-authenticated", "-calendar-saved-day"]
        app.launch()
        app.buttons["workspace.calendar"].tap()
        XCTAssertTrue(app.buttons["calendar.day.2026-09-03"].waitForExistence(timeout: 5))
        let dayLabel = app.buttons["calendar.day.2026-09-03"].label
        XCTAssertTrue(dayLabel.contains("2026")); XCTAssertTrue(dayLabel.contains("note")); XCTAssertTrue(dayLabel.contains("1 label"))
        app.buttons["Select range"].tap()
        XCTAssertTrue(app.buttons["Cancel range"].waitForExistence(timeout: 5))
    }

    func testCalendarOfflineFixtureOffersRetryWithoutSigningOut() {
        app.launchArguments += ["-ui-testing-authenticated", "-calendar-offline"]
        app.launch()
        app.buttons["workspace.calendar"].tap()
        XCTAssertTrue(app.staticTexts["Unable to load calendar records."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Retry"].exists)
        XCTAssertTrue(app.buttons["workspace.signOut"].exists)
    }

    func testCalendarLoadingAndExpiredSessionFixtures() {
        app.launchArguments += ["-ui-testing-authenticated", "-calendar-loading"]
        app.launch(); app.buttons["workspace.calendar"].tap()
        XCTAssertTrue(app.buttons["calendar.day.2026-09-13"].waitForExistence(timeout: 8))

        app.terminate(); app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-authenticated", "-calendar-unauthorized"]
        app.launch()
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["workspace.signOut"].exists)
    }

    func testCalendarPortionsRangeAlternativeAndFailedSaveRetainDraft() {
        app.launchArguments += ["-ui-testing-authenticated", "-calendar-mutation-error"]
        app.launch(); app.buttons["workspace.calendar"].tap(); app.swipeUp()
        let note = app.textViews["What happened today?"]
        XCTAssertTrue(note.waitForExistence(timeout: 5)); note.tap(); note.typeText("Retained draft")
        app.buttons["Select Milestone"].tap()
        let portion = app.buttons["calendar.portion.00000000-0000-4000-8000-000000000020"]
        XCTAssertTrue(portion.waitForExistence(timeout: 3)); portion.tap()
        for option in ["Marker only", "¼ day", "½ day", "¾ day", "Full day"] { XCTAssertTrue(app.buttons[option].exists) }
        app.buttons["Full day"].tap()
        app.buttons["Save day"].tap()
        XCTAssertTrue(app.staticTexts["Unable to save this day."].waitForExistence(timeout: 5))
        XCTAssertTrue((note.value as? String)?.contains("Retained draft") == true)
        app.buttons["Select range"].tap(); XCTAssertTrue(app.staticTexts["Release on another day to select a range."].exists)
        app.buttons["Cancel range"].tap()
    }

    func testCalendarCreatesLabelWithCustomPaletteColor() {
        app.launchArguments += ["-ui-testing-authenticated", "-calendar-empty-labels"]
        app.launch(); app.buttons["workspace.calendar"].tap(); app.swipeUp()
        XCTAssertTrue(app.staticTexts["Create a label below to begin."].waitForExistence(timeout: 5))
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Choose new label color'")).firstMatch.tap()
        XCTAssertTrue(app.buttons["Choose new label color: #F97316"].waitForExistence(timeout: 3)); app.buttons["Choose new label color: #F97316"].tap()
        let field = app.textFields["New calendar label"]; field.tap(); field.typeText("Vacation"); app.buttons["Add"].tap()
        XCTAssertTrue(app.staticTexts["Vacation"].waitForExistence(timeout: 5))
    }

    func testCalendarLongPressAndTapCompleteInclusiveRange() {
        app.launchArguments += ["-ui-testing-authenticated", "-calendar-range"]
        app.launch(); app.buttons["workspace.calendar"].tap()
        let start = app.buttons["calendar.day.2026-09-13"]
        let end = app.buttons["calendar.day.2026-09-15"]
        XCTAssertTrue(start.waitForExistence(timeout: 5)); XCTAssertTrue(end.waitForExistence(timeout: 5))
        start.press(forDuration: 0.5); end.tap()
        XCTAssertTrue(app.buttons["Apply to range"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Sep 13 – Sep 15, 2026"].exists)
        app.buttons["Apply to range"].tap()
        XCTAssertTrue(app.buttons["Save day"].waitForExistence(timeout: 5))
    }

    func testCalendarControlsRemainReachableInDarkAccessibilityAppearance() {
        app.launchArguments += ["-ui-testing", "-ui-testing-authenticated", "-AppleInterfaceStyle", "Dark", "-UIPreferredContentSizeCategory", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch(); app.buttons["workspace.calendar"].tap()
        XCTAssertTrue(app.buttons["workspace.calendar"].isSelected)
        XCTAssertTrue(app.descendants(matching: .any)["calendar.grid"].waitForExistence(timeout: 5))
        app.swipeUp()
        XCTAssertTrue(app.descendants(matching: .any)["calendar.editor"].exists)
        XCTAssertTrue(app.buttons["Save day"].exists)
    }

    func testCalendarLightSystemAndReducedMotionAppearances() {
        for arguments in [["-ui-testing", "-ui-testing-authenticated", "-AppleInterfaceStyle", "Light"], ["-ui-testing", "-ui-testing-authenticated"], ["-ui-testing", "-ui-testing-authenticated", "-UIAccessibilityReduceMotionEnabled", "YES"]] {
            app.launchArguments = arguments; app.launch(); app.buttons["workspace.calendar"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["calendar.grid"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["Previous month"].exists); app.terminate(); app = XCUIApplication()
        }
    }

    func testNewPathDraftRequiresDiscardConfirmation() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        app.buttons["workspace.paths"].tap()
        app.buttons["paths.add"].tap()

        let name = app.textFields["paths.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap()
        name.typeText("Draft path")
        app.buttons["Cancel"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Discard new path?"].waitForExistence(timeout: 3))
        app.buttons["Discard changes"].tap()
        XCTAssertFalse(name.waitForExistence(timeout: 1))
    }

    func testPathsHistoryAndEditControlsAreReachable() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        app.buttons["workspace.paths"].tap()
        XCTAssertTrue(app.staticTexts["Distributed systems"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["paths.history.00000000-0000-4000-8000-000000000001"].exists)
        app.buttons["paths.history.00000000-0000-4000-8000-000000000001"].tap()
        XCTAssertTrue(app.staticTexts["Distributed systems"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["paths.history.close"].exists)
        app.buttons["paths.history.close"].tap()
        XCTAssertTrue(app.buttons["paths.edit.00000000-0000-4000-8000-000000000001"].exists)
    }

    func testPathsEmptyAndOfflineFixturesOfferRecovery() {
        app.launchArguments += ["-ui-testing-authenticated", "-paths-empty"]
        app.launch()
        app.buttons["workspace.paths"].tap()
        XCTAssertTrue(app.staticTexts["Your first path is waiting to be named."].waitForExistence(timeout: 5))

        app.terminate()
        app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-authenticated", "-paths-offline"]
        app.launch()
        app.buttons["workspace.paths"].tap()
        XCTAssertTrue(app.staticTexts["No network connection. Reconnect and try again."].waitForExistence(timeout: 5))
    }

    func testPathsMergeRequiresConfirmationAndRemoveOffersUndo() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        app.buttons["workspace.paths"].tap()
        app.buttons["paths.edit.00000000-0000-4000-8000-000000000001"].tap()
        XCTAssertTrue(app.buttons["paths.merge"].waitForExistence(timeout: 5))
        app.buttons["paths.merge"].tap()
        XCTAssertTrue(app.buttons["paths.merge.target.00000000-0000-4000-8000-000000000003"].waitForExistence(timeout: 5))
        app.buttons["paths.merge.target.00000000-0000-4000-8000-000000000003"].tap()
        XCTAssertTrue(app.buttons["Merge"].waitForExistence(timeout: 5))
        app.buttons["Merge"].tap()
        XCTAssertTrue(app.staticTexts["Writing"].waitForExistence(timeout: 5))

        app.buttons["paths.remove.00000000-0000-4000-8000-000000000003"].tap()
        XCTAssertTrue(app.buttons["Remove"].waitForExistence(timeout: 5))
        app.buttons.matching(identifier: "Remove").element(boundBy: 1).tap()
        XCTAssertTrue(app.buttons["paths.undo"].waitForExistence(timeout: 5))
        app.buttons["paths.undo"].tap()
    }

    func testPathsControlsRemainReachableAtAccessibilityTextSize() {
        app.launchArguments += ["-ui-testing-authenticated", "-UIPreferredContentSizeCategory", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        app.buttons["workspace.paths"].tap()
        XCTAssertTrue(app.buttons["paths.add"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["paths.history.00000000-0000-4000-8000-000000000001"].exists)
        app.buttons["paths.history.00000000-0000-4000-8000-000000000001"].tap()
        XCTAssertTrue(app.buttons["paths.history.close"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["1h"].waitForExistence(timeout: 5))
    }

    func testPathsAccessibilityNamesAndRemovalRecoveryAnnouncement() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        let pathsTab = app.buttons["workspace.paths"]
        XCTAssertTrue(pathsTab.waitForExistence(timeout: 5))
        pathsTab.tap()
        XCTAssertTrue(pathsTab.isSelected)
        let add = app.buttons["paths.add"]
        XCTAssertEqual(add.label, "Add path")
        XCTAssertTrue(app.buttons["History"].firstMatch.exists)
        XCTAssertTrue(app.buttons["Edit"].firstMatch.exists)
        let remove = app.buttons["Remove"].firstMatch
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        XCTAssertTrue(remove.isHittable)
    }

    func testLogsComposerEditDeleteAndLabelsAreReachable() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        app.buttons["workspace.logs"].tap()
        XCTAssertTrue(app.textViews["logs.composer"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["logs.save"].exists)
        XCTAssertTrue(app.buttons["Edit log"].firstMatch.exists)
        app.buttons["Choose labels for log"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Important"].waitForExistence(timeout: 3))
        app.buttons["Important"].tap()
        app.buttons["logs.labels.close"].tap()
        app.buttons["Edit log"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Save"].waitForExistence(timeout: 3))
        app.buttons["Cancel"].tap()
        app.buttons["Remove log"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Remove log"].waitForExistence(timeout: 3))
        app.buttons.matching(identifier: "Remove log").element(boundBy: 1).tap()
        XCTAssertTrue(app.staticTexts["No logs yet. Capture a thought above."].waitForExistence(timeout: 3))
    }

    func testLogsCreateAnnouncesSuccess() {
        app.launchArguments += ["-ui-testing-authenticated", "-logs-empty"]
        app.launch()
        app.buttons["workspace.logs"].tap()
        let composer = app.textViews["logs.composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        composer.tap()
        composer.typeText("A captured thought")
        app.buttons["logs.save"].tap()
        XCTAssertTrue(app.staticTexts["Log saved."].waitForExistence(timeout: 5))
    }

    func testLogsEmptyAndOfflineFixturesOfferRecovery() {
        app.launchArguments += ["-ui-testing-authenticated", "-logs-empty"]
        app.launch()
        app.buttons["workspace.logs"].tap()
        XCTAssertTrue(app.staticTexts["No logs yet. Capture a thought above."].waitForExistence(timeout: 5))
        app.terminate()
        app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-authenticated", "-logs-offline"]
        app.launch()
        app.buttons["workspace.logs"].tap()
        XCTAssertTrue(app.staticTexts["No network connection. Reconnect and try again."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Retry"].exists)
    }

    func testLogsControlsRemainReachableAtAccessibilityTextSize() {
        app.launchArguments += ["-ui-testing-authenticated", "-UIPreferredContentSizeCategory", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        app.buttons["workspace.logs"].tap()
        XCTAssertTrue(app.textViews["logs.composer"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["logs.save"].exists)
        XCTAssertTrue(app.buttons["Remove log"].firstMatch.exists)
    }

    func testLogsAppearanceScreenshots() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        app.buttons["workspace.logs"].tap()
        XCTAssertTrue(app.staticTexts["Logs"].waitForExistence(timeout: 5))
        for mode in ["Light", "Dark"] {
            app.buttons["workspace.appearance"].tap()
            app.buttons[mode].tap()
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "Logs-\(mode)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }

    func testLabelsListAndCreateControlsAreReachable() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        let labelsTab = app.buttons["workspace.labels"]
        XCTAssertTrue(labelsTab.waitForExistence(timeout: 5))
        labelsTab.tap()
        XCTAssertTrue(app.staticTexts["Labels"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["labels.add"].exists)
        app.buttons["labels.add"].tap()
        XCTAssertTrue(app.textFields["labels.name"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Add label"].exists)
        XCTAssertTrue(app.switches["Notes"].exists)
        app.buttons["Cancel"].firstMatch.tap()
    }

    func testLabelsEmptyAndOfflineFixturesOfferRecovery() {
        app.launchArguments += ["-ui-testing-authenticated", "-labels-empty"]
        app.launch()
        app.buttons["workspace.labels"].tap()
        XCTAssertTrue(app.staticTexts["No labels yet. Add one above to get started."].waitForExistence(timeout: 5))
        app.terminate()
        app.launchArguments = ["-ui-testing", "-ui-testing-authenticated", "-labels-offline"]
        app.launch()
        app.buttons["workspace.labels"].tap()
        XCTAssertTrue(app.staticTexts["No network connection. Reconnect and try again."].waitForExistence(timeout: 5))
    }

    func testNotesListEditorAndArchiveControlsAreReachable() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        app.buttons["workspace.notes"].tap()
        XCTAssertTrue(app.staticTexts["Notes"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["notes.add"].exists)
        XCTAssertTrue(app.buttons["Open Design notes"].exists)
        app.buttons["Open Design notes"].tap()
        XCTAssertTrue(app.textFields["notes.title"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textViews["notes.body"].exists)
        XCTAssertTrue(app.buttons["Undo"].exists)
        app.buttons["notes.back"].tap()
        XCTAssertTrue(app.staticTexts["Notes"].waitForExistence(timeout: 5))
        app.buttons["Archive Design notes"].tap()
        XCTAssertTrue(app.buttons["Archive note"].waitForExistence(timeout: 3))
        app.buttons["Archive note"].tap()
    }

    func testNotesEmptyAndOfflineFixturesOfferRecovery() {
        app.launchArguments += ["-ui-testing-authenticated", "-notes-empty"]
        app.launch()
        app.buttons["workspace.notes"].tap()
        XCTAssertTrue(app.staticTexts["Your notes will appear here."].waitForExistence(timeout: 5))
        app.terminate()
        app.launchArguments = ["-ui-testing", "-ui-testing-authenticated", "-notes-offline"]
        app.launch()
        app.buttons["workspace.notes"].tap()
        XCTAssertTrue(app.staticTexts["No network connection. Reconnect and try again."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Retry"].exists)
    }

    func testArchivedNotesCanBeRestored() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        app.buttons["workspace.notes"].tap()
        app.buttons["notes.archive-toggle"].tap()
        XCTAssertTrue(app.buttons["Restore"].waitForExistence(timeout: 5))
        app.buttons["Restore"].tap()
    }

    func testNotesControlsRemainReachableAtAccessibilityTextSize() {
        app.launchArguments += [
            "-ui-testing-authenticated",
            "-UIPreferredContentSizeCategory",
            "UICTContentSizeCategoryAccessibilityXXXL",
        ]
        app.launch()
        app.buttons["workspace.notes"].tap()
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["notes.archive-toggle"].exists)
        app.swipeUp()
        XCTAssertTrue(app.buttons["notes.archive-toggle"].exists)
    }

    func testNotesAppearanceScreenshots() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        app.buttons["workspace.notes"].tap()
        XCTAssertTrue(app.staticTexts["Notes"].waitForExistence(timeout: 5))
        for mode in ["Light", "Dark"] {
            app.buttons["workspace.appearance"].tap()
            app.buttons[mode].tap()
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "Notes-\(mode)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }

    func testSignOutReturnsToAuthenticationFlow() {
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()
        let signOut = app.buttons["workspace.signOut"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 5))
        signOut.tap()
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields["auth.password"].exists)
    }

    private func launchSessions(_ arguments: [String] = []) {
        app.launchArguments = ["-ui-testing", "-ui-testing-authenticated"] + arguments
        app.launch()
        XCTAssertTrue(app.buttons["timer.toggle"].waitForExistence(timeout: 5))
    }

    func testSessionsTimerAndMultipleLabelCreation() {
        launchSessions()
        app.buttons["timer.path"].tap()
        app.buttons["Distributed systems"].firstMatch.tap()
        app.buttons["timer.label.00000000-0000-4000-8000-000000000002"].tap()
        let name = app.textFields["timer.newLabel"]
        name.tap()
        name.typeText("Reading")
        app.buttons["timer.createLabel"].tap()
        app.swipeDown()
        app.buttons["timer.toggle"].tap()
        XCTAssertEqual(app.buttons["timer.toggle"].label, "Stop timer")
        app.buttons["timer.clock"].tap()
        XCTAssertTrue(app.buttons["Save start time"].waitForExistence(timeout: 3))
        app.buttons["Cancel"].firstMatch.tap()
        app.buttons["timer.toggle"].tap()
        XCTAssertEqual(app.buttons["timer.toggle"].label, "Start timer")
    }

    func testSessionEditPersistsAndDeletionRequiresConfirmation() {
        launchSessions()
        app.swipeUp()
        let edit = app.buttons["session.edit.00000000-0000-4000-8000-000000000003"]
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
        edit.tap()
        let description = app.descendants(matching: .any).matching(identifier: "session.description").firstMatch
        XCTAssertTrue(description.waitForExistence(timeout: 3))
        description.tap()
        description.typeText(" updated")
        app.swipeUp()
        app.buttons["session.save"].tap()
        XCTAssertTrue(app.buttons["session.edit.00000000-0000-4000-8000-000000000003"].waitForExistence(timeout: 5))
        app.buttons["session.remove.00000000-0000-4000-8000-000000000003"].tap()
        let confirmation = app.buttons["session.remove.confirm"].firstMatch
        XCTAssertTrue(confirmation.waitForExistence(timeout: 3))
        confirmation.tap()
        XCTAssertTrue(app.staticTexts["No sessions recorded yet."].waitForExistence(timeout: 5))
    }

    func testSessionUnsavedChangesCanBeKeptOrDiscarded() {
        launchSessions()
        app.swipeUp()
        app.buttons["session.edit.00000000-0000-4000-8000-000000000003"].tap()
        let description = app.descendants(matching: .any).matching(identifier: "session.description").firstMatch
        description.tap()
        description.typeText(" unsaved")
        app.swipeUp()
        app.buttons["session.cancel"].tap()
        XCTAssertTrue(app.buttons["session.cancel"].waitForExistence(timeout: 3))
    }

    func testSessionsOfflineRetryAndEmptyState() {
        launchSessions(["-sessions-error", "-sessions-empty"])
        XCTAssertTrue(app.staticTexts["No network connection. Reconnect and try again."].waitForExistence(timeout: 3))
        app.swipeUp()
        app.buttons["Retry"].tap()
        XCTAssertTrue(app.staticTexts["No sessions recorded yet."].waitForExistence(timeout: 5))
    }

    func testSessionsAppearanceScreenshots() {
        launchSessions()
        for mode in ["Light", "Dark"] {
            app.buttons["workspace.appearance"].tap()
            app.buttons[mode].tap()
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "Sessions-\(mode)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
}
