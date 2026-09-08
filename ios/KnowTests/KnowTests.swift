import XCTest
import Foundation
@testable import Know

private final class URLProtocolStub: URLProtocol {
    static var statusCode = 200
    static var responseData = Data()
    static var failure: URLError.Code?
    static var requestCount = 0
    static var lastRequest: URLRequest?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lastRequest = request
        Self.requestCount += 1
        if let failure = Self.failure {
            client?.urlProtocol(self, didFailWithError: URLError(failure))
            return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.statusCode, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class KnowTests: XCTestCase {
    override func tearDown() {
        URLProtocolStub.statusCode = 200
        URLProtocolStub.responseData = Data()
        URLProtocolStub.failure = nil
        URLProtocolStub.requestCount = 0
        URLProtocolStub.lastRequest = nil
        super.tearDown()
    }

    func testFormatSecondsUsesHoursAndMinutes() {
        XCTAssertEqual(formatSeconds(0), "0m")
        XCTAssertEqual(formatSeconds(3_725), "1h 2m")
    }

    func testIOSTimerRequestEncodesCanonicalSourceAndTargets() throws {
        let labelId = UUID()
        let request = TimerRequest(pathId: nil, labelIds: [labelId.uuidString], description: "Reading", source: "IOS")
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(json["pathId"] as? String)
        XCTAssertEqual(json["labelIds"] as? [String], [labelId.uuidString])
        XCTAssertEqual(json["description"] as? String, "Reading")
        XCTAssertEqual(json["source"] as? String, "IOS")
    }

    func testLabelRequestEncodesSharedLabelFields() throws {
        let request = LabelRequest(name: "Algorithms", color: "#2878D5")
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["name"] as? String, "Algorithms")
        XCTAssertEqual(json["color"] as? String, "#2878D5")
    }

    func testUITestingLaunchArgumentIsRecognized() {
        XCTAssertTrue(isUITesting(arguments: ["Know", "-ui-testing"]))
        XCTAssertFalse(isUITesting(arguments: ["Know"]))
    }

    @MainActor
    func testAuthenticatedUITestingFixtureSkipsNetworkRefresh() async {
        let model = AppModel(api: APIClient(base: URL(string: "https://example.test/api/v1")!), arguments: ["Know", "-ui-testing", "-ui-testing-authenticated"])

        XCTAssertEqual(model.paths.first?.name, "UI Test Path")
        XCTAssertEqual(model.labels.first?.name, "UI Test Label")
        await model.refresh()
        XCTAssertNil(model.error)
    }

    func testStatisticsDecodesLabelBreakdowns() throws {
        let payload = try JSONSerialization.data(withJSONObject: [
            "todaySeconds": 120,
            "weekSeconds": 120,
            "monthSeconds": 120,
            "todayByPath": [:],
            "todayByLabel": [:],
            "weekByPath": ["path-1": 3_600],
            "weekByLabel": ["label-1": 1_800],
        ])
        let stats = try JSONDecoder().decode(Statistics.self, from: payload)

        XCTAssertEqual(stats.weekByPath["path-1"], 3600)
        XCTAssertEqual(stats.weekByLabel["label-1"], 1800)
    }

    func testAPIClientDecodesResponsesAndAddsBearerToken() async throws {
        let entityId = UUID()
        URLProtocolStub.responseData = "{\"id\":\"\(entityId.uuidString)\",\"name\":\"Algorithms\",\"description\":null,\"status\":\"ACTIVE\"}".data(using: .utf8)!
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let client = APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration))

        let path: Path = try await client.request("/paths", token: "test-token")

        XCTAssertEqual(path.id, entityId)
        XCTAssertEqual(path.name, "Algorithms")
        XCTAssertEqual(URLProtocolStub.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
    }

    func testAPIClientMapsUnauthorizedResponses() async throws {
        URLProtocolStub.statusCode = 401
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let client = APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration))

        do {
            let _: Path = try await client.request("/paths")
            XCTFail("Expected an unauthorized error")
        } catch let error as APIError {
            if case .unauthorized = error { } else { XCTFail("Expected unauthorized, got \(error)") }
        }
    }

    func testAPIClientRetriesTransientFailuresAndSurfacesOfflineState() async throws {
        URLProtocolStub.failure = .notConnectedToInternet
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let client = APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration))

        do {
            let _: Path = try await client.request("/paths")
            XCTFail("Expected an offline error")
        } catch let error as APIError {
            if case .offline = error { } else { XCTFail("Expected offline, got \(error)") }
        }
        XCTAssertEqual(URLProtocolStub.requestCount, 2)
    }

    func testAPIClientDoesNotRetryNonIdempotentRequests() async throws {
        URLProtocolStub.failure = .networkConnectionLost
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let client = APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration))

        do {
            let _: Path = try await client.request("/calendar/labels", method: "POST", body: Data("{}".utf8))
            XCTFail("Expected an offline error")
        } catch let error as APIError {
            if case .offline = error { } else { XCTFail("Expected offline, got \(error)") }
        }
        XCTAssertEqual(URLProtocolStub.requestCount, 1)
    }

    @MainActor
    func testAppModelSurfacesOfflineRefreshState() async throws {
        URLProtocolStub.failure = .notConnectedToInternet
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let model = AppModel(api: APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration)))
        model.token = "test-token"

        await model.refresh()

        XCTAssertEqual(model.error, "No network connection. Reconnect and try again.")
        XCTAssertFalse(model.isLoading)
    }
}
