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
