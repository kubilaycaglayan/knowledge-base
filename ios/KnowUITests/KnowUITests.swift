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
}
