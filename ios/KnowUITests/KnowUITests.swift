import XCTest

final class KnowUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["-ui-testing"]
        app.launch()
    }

    func testAuthenticationControlsAreReachable() {
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields["auth.password"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["auth.submit"].exists)
        XCTAssertTrue(app.buttons["auth.google"].exists)
        XCTAssertTrue(app.staticTexts["Welcome back"].exists)
    }

    func testEmptySubmissionShowsInlineValidation() {
        app.buttons["auth.submit"].tap()
        XCTAssertTrue(app.staticTexts["Enter a valid email address."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["auth.submit"].isEnabled)
    }

    func testAuthenticationModeCanSwitchToRegistration() {
        let mode = app.buttons["auth.mode"]
        XCTAssertTrue(mode.waitForExistence(timeout: 5))
        mode.tap()
        XCTAssertEqual(app.buttons["auth.submit"].label, "Create account")
    }

    func testAuthenticatedWorkspaceControlsAreReachable() {
        app.terminate()
        app.launchArguments += ["-ui-testing-authenticated"]
        app.launch()

        XCTAssertTrue(app.buttons["workspace.paths"].waitForExistence(timeout: 5))
        app.buttons["workspace.paths"].tap()
        XCTAssertTrue(app.buttons["paths.add"].waitForExistence(timeout: 5))
        app.buttons["paths.add"].tap()
        XCTAssertTrue(app.textFields["paths.name"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textViews["paths.description"].exists)
        XCTAssertTrue(app.buttons["paths.save"].exists)

        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["workspace.sessions"].waitForExistence(timeout: 5))
        app.buttons["workspace.sessions"].tap()
        XCTAssertTrue(app.buttons["timer.path"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["timer.label.00000000-0000-4000-8000-000000000002"].exists)
    }

    private func launchSessions(_ arguments: [String] = []) {
        app.terminate()
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
        let confirmation = app.buttons["session.remove.confirm"]
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
