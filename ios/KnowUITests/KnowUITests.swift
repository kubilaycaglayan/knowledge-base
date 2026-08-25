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

        XCTAssertTrue(app.buttons["tab.paths"].waitForExistence(timeout: 5))
        app.buttons["tab.paths"].tap()
        XCTAssertTrue(app.buttons["paths.add"].waitForExistence(timeout: 5))
        app.buttons["paths.add"].tap()
        XCTAssertTrue(app.textFields["paths.name"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textViews["paths.description"].exists)
        XCTAssertTrue(app.buttons["paths.save"].exists)

        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["tab.items"].waitForExistence(timeout: 5))
        app.buttons["tab.items"].tap()
        XCTAssertTrue(app.buttons["items.add"].waitForExistence(timeout: 5))
        app.buttons["items.add"].tap()
        XCTAssertTrue(app.textFields["items.title"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["items.type"].exists)
        XCTAssertTrue(app.buttons["items.save"].exists)

        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["tab.items"].waitForExistence(timeout: 5))
        app.buttons["tab.items"].tap()
        XCTAssertTrue(app.staticTexts["UI Test Item"].waitForExistence(timeout: 5))
        app.staticTexts["UI Test Item"].tap()
        XCTAssertTrue(app.buttons["item.note.add"].waitForExistence(timeout: 5))
        app.buttons["item.note.add"].tap()
        XCTAssertTrue(app.textFields["item.note.title"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["item.note.save"].exists)

        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["tab.today"].waitForExistence(timeout: 5))
        app.buttons["tab.today"].tap()
        XCTAssertTrue(app.buttons["timer.path"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["timer.item"].exists)
    }
}
