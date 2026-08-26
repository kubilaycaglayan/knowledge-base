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
        let itemId = UUID()
        let request = TimerRequest(pathId: nil, itemId: itemId.uuidString, description: "Reading", source: "IOS")
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(json["pathId"] as? String)
        XCTAssertEqual(json["itemId"] as? String, itemId.uuidString)
        XCTAssertEqual(json["description"] as? String, "Reading")
        XCTAssertEqual(json["source"] as? String, "IOS")
    }

    func testItemRequestEncodesSelectedPathMemberships() throws {
        let pathId = UUID()
        let request = ItemRequest(title: "Algorithms", type: "COURSE", description: nil, status: nil, pathIds: [pathId], tags: [])
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let pathIds = try XCTUnwrap(json["pathIds"] as? [String])

        XCTAssertEqual(pathIds, [pathId.uuidString])
    }

    func testTimerItemsAreScopedToSelectedPath() {
        let path = UUID()
        let otherPath = UUID()
        let selected = Item(id: UUID(), title: "Graphs", type: "COURSE", description: nil, source: nil, status: "ACTIVE", progress: 20, pathIds: [path], tags: [])
        let unrelated = Item(id: UUID(), title: "Essays", type: "BOOK", description: nil, source: nil, status: "PLANNED", progress: 0, pathIds: [otherPath], tags: [])

        XCTAssertEqual(itemsForTimerPath(path, from: [selected, unrelated]).map(\.id), [selected.id])
        XCTAssertEqual(itemsForTimerPath(nil, from: [selected, unrelated]).count, 2)
    }

    func testUITestingLaunchArgumentIsRecognized() {
        XCTAssertTrue(isUITesting(arguments: ["Know", "-ui-testing"]))
        XCTAssertFalse(isUITesting(arguments: ["Know"]))
    }

    @MainActor
    func testAuthenticatedUITestingFixtureSkipsNetworkRefresh() async {
        let model = AppModel(api: APIClient(base: URL(string: "https://example.test/api/v1")!), arguments: ["Know", "-ui-testing", "-ui-testing-authenticated"])

        XCTAssertEqual(model.paths.first?.name, "UI Test Path")
        XCTAssertEqual(model.items.first?.title, "UI Test Item")
        await model.refresh()
        XCTAssertNil(model.error)
    }

    func testStatisticsDecodesRecentProgressChanges() throws {
        let itemId = UUID()
        let payload = try JSONSerialization.data(withJSONObject: [
            "todaySeconds": 120,
            "weekSeconds": 120,
            "monthSeconds": 120,
            "todayByPath": [:],
            "todayByItem": [:],
            "weekByPath": ["path-1": 3_600],
            "weekByItem": ["item-1": 1_800],
            "completedItems": 1,
            "activeItems": 2,
            "recentProgressChanges": [
                [
                    "itemId": itemId.uuidString,
                    "previousProgress": 25,
                    "newProgress": 50,
                    "changedAt": "2026-08-25T12:00:00Z",
                ]
            ],
        ])
        let stats = try JSONDecoder().decode(Statistics.self, from: payload)

        XCTAssertEqual(stats.completedItems, 1)
        XCTAssertEqual(stats.weekByPath["path-1"], 3600)
        XCTAssertEqual(stats.weekByItem["item-1"], 1800)
        XCTAssertEqual(stats.recentProgressChanges.first?.itemId, itemId)
        XCTAssertEqual(stats.recentProgressChanges.first?.newProgress, 50)
    }

    func testAPIClientDecodesResponsesAndAddsBearerToken() async throws {
        let itemId = UUID()
        URLProtocolStub.responseData = "{\"id\":\"\(itemId.uuidString)\",\"name\":\"Algorithms\",\"description\":null,\"status\":\"ACTIVE\"}".data(using: .utf8)!
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let client = APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration))

        let path: Path = try await client.request("/paths", token: "test-token")

        XCTAssertEqual(path.id, itemId)
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
            let _: Path = try await client.request("/items", method: "POST", body: Data("{}".utf8))
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
