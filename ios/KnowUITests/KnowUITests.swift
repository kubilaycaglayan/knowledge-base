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

        XCTAssertTrue(app.tabBars.buttons["Paths"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Paths"].tap()
        XCTAssertTrue(app.buttons["paths.add"].waitForExistence(timeout: 5))
        app.buttons["paths.add"].tap()
        XCTAssertTrue(app.textFields["paths.name"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textViews["paths.description"].exists)
        XCTAssertTrue(app.buttons["paths.save"].exists)

        app.terminate()
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Today"].tap()
        XCTAssertTrue(app.buttons["timer.path"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["timer.label"].exists)
    }
}
