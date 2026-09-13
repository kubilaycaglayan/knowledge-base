import XCTest
import Foundation
import GoogleSignIn
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
    func testAPIClientPreservesQueryItemsAndDecodesNullTimer() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let api = APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration))
        URLProtocolStub.responseData = Data("{\"sessions\":[],\"page\":1,\"totalPages\":2,\"totalSessions\":51}".utf8)
        let page = try await SessionsAPI(client: api, token: "session").history(page: 1)
        XCTAssertEqual(page.page, 1)
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/time-entries")
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.query, "page=1&size=50")
        URLProtocolStub.responseData = Data("null".utf8)
        let timer = try await SessionsAPI(client: api, token: "session").current()
        XCTAssertNil(timer)
    }

    func testSessionDraftEncodesExplicitClearsAndMultipleLabels() throws {
        var draft = SessionDraft()
        draft.labelIds = [UUID(), UUID()]
        draft.description = "   "
        draft.source = "IMPORT"
        let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: draft.body(completed: true)) as? [String: Any])
        XCTAssertTrue(fields["pathId"] is NSNull)
        XCTAssertTrue(fields["description"] is NSNull)
        XCTAssertEqual(fields["labelIds"] as? [String], draft.labelIds.map(\.uuidString))
        XCTAssertEqual(fields["source"] as? String, "IMPORT")
        XCTAssertNotNil(fields["endedAt"])
        let running = try XCTUnwrap(JSONSerialization.jsonObject(with: draft.body(completed: false)) as? [String: Any])
        XCTAssertNil(running["endedAt"])
        XCTAssertNil(running["source"])
    }
    func testKeychainPersistsReplacesAndDeletesSession() throws {
        let service = "knowledge-base.tests.\(UUID().uuidString)"
        defer { KeychainTokenStore.delete(service: service) }
        XCTAssertNil(KeychainTokenStore.read(service: service))
        try KeychainTokenStore.save("first-session", service: service)
        XCTAssertEqual(KeychainTokenStore.read(service: service), "first-session")
        try KeychainTokenStore.save("replacement-session", service: service)
        XCTAssertEqual(KeychainTokenStore.read(service: service), "replacement-session")
        KeychainTokenStore.delete(service: service)
        XCTAssertNil(KeychainTokenStore.read(service: service))
    }
    @MainActor
    func testPasswordLoginTrimsEmailAndPreservesPassword() async throws {
        let model = authenticationModel()
        URLProtocolStub.responseData = authPayload
        await model.authenticate(email: " person@example.com \n", password: " password123 ", register: false)
        XCTAssertTrue(model.signedIn)
        XCTAssertFalse(model.isAuthenticating)
        XCTAssertNil(model.authError)
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/auth/login")
        let body = try requestBody()
        XCTAssertEqual(body["email"], "person@example.com")
        XCTAssertEqual(body["password"], " password123 ")
    }

    @MainActor
    func testRegistrationUsesSharedEndpoint() async {
        let model = authenticationModel()
        URLProtocolStub.responseData = authPayload
        await model.authenticate(email: "person@example.com", password: "password123", register: true)
        XCTAssertTrue(model.signedIn)
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/auth/register")
    }

    @MainActor
    func testGoogleExchangesIDTokenForBackendSession() async throws {
        let model = authenticationModel()
        URLProtocolStub.responseData = authPayload
        await model.authenticateWithGoogle { "google-id-token" }
        XCTAssertEqual(model.token, "backend-session")
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/auth/google")
        XCTAssertEqual(try requestBody()["idToken"], "google-id-token")
        XCTAssertNil(URLProtocolStub.lastRequest?.value(forHTTPHeaderField: "Authorization"))
    }

    @MainActor
    func testRejectedCredentialsShowErrorAndAllowRetry() async {
        let model = authenticationModel()
        URLProtocolStub.statusCode = 401
        await model.authenticate(email: "person@example.com", password: "password123", register: false)
        XCTAssertFalse(model.signedIn)
        XCTAssertNotNil(model.authError)
        XCTAssertEqual(model.authPhase, .failed)
        XCTAssertFalse(model.isAuthenticating)
        URLProtocolStub.statusCode = 200
        URLProtocolStub.responseData = authPayload
        await model.authenticate(email: "person@example.com", password: "password123", register: false)
        XCTAssertTrue(model.signedIn)
        XCTAssertNil(model.authError)
        XCTAssertEqual(model.authPhase, .idle)
    }

    @MainActor
    func testMalformedAuthResponsePreservesExistingSession() async {
        let model = authenticationModel()
        model.token = "existing-session"
        URLProtocolStub.responseData = Data("{\"token\":null}".utf8)
        await model.authenticate(email: "person@example.com", password: "password123", register: false)
        XCTAssertEqual(model.token, "existing-session")
        XCTAssertFalse(model.isAuthenticating)
        XCTAssertNotNil(model.authError)
    }
    @MainActor
    func testMissingGoogleConfigurationDoesNotContactBackend() async {
        let model = authenticationModel()
        await model.authenticateWithGoogle { throw SessionError.configuration }
        XCTAssertEqual(URLProtocolStub.requestCount, 0)
        XCTAssertFalse(model.signedIn)
        XCTAssertNotNil(model.authError)
        XCTAssertFalse(model.isAuthenticating)
    }

    @MainActor
    func testGoogleCancellationReturnsToIdleWithoutError() async {
        let model = authenticationModel()
        await model.authenticateWithGoogle {
            throw NSError(domain: kGIDSignInErrorDomain, code: GIDSignInError.canceled.rawValue)
        }
        XCTAssertNil(model.authError)
        XCTAssertFalse(model.signedIn)
        XCTAssertFalse(model.isAuthenticating)
    }

    @MainActor
    func testGoogleVerificationFailureUsesGoogleRecoveryCopy() async {
        let model = authenticationModel()
        URLProtocolStub.statusCode = 503
        await model.authenticateWithGoogle { "google-id-token" }
        XCTAssertEqual(model.authError, "Google sign-in could not be completed. Try again.")
        XCTAssertEqual(model.authPhase, .failed)
        XCTAssertFalse(model.isAuthenticating)
    }

    @MainActor
    func testGoogleConfigurationRequiresMatchingIDsAndCallbackScheme() {
        let client = "123.apps.googleusercontent.com"
        let server = "456.apps.googleusercontent.com"
        XCTAssertTrue(GoogleAuthentication.configurationIsValid(clientID: client, serverID: server, urlSchemes: ["com.googleusercontent.apps.123"]))
        XCTAssertFalse(GoogleAuthentication.configurationIsValid(clientID: client, serverID: nil, urlSchemes: ["com.googleusercontent.apps.123"]))
        XCTAssertFalse(GoogleAuthentication.configurationIsValid(clientID: client, serverID: server, urlSchemes: []))
    }

    @MainActor
    func testClearingAuthenticationErrorReturnsPhaseToIdle() async {
        let model = authenticationModel()
        URLProtocolStub.statusCode = 401
        await model.authenticate(email: "person@example.com", password: "password123", register: false)
        XCTAssertEqual(model.authPhase, .failed)
        model.clearAuthError()
        XCTAssertNil(model.authError)
        XCTAssertEqual(model.authPhase, .idle)
    }

    @MainActor private func authenticationModel() -> AppModel {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        return AppModel(api: APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration)), arguments: ["-ui-testing"])
    }

    private var authPayload: Data {
        Data("{\"token\":\"backend-session\",\"userId\":\"00000000-0000-4000-8000-000000000001\",\"email\":\"person@example.com\",\"displayName\":\"Person\"}".utf8)
    }

    private func requestBody() throws -> [String: String] {
        let request = try XCTUnwrap(URLProtocolStub.lastRequest)
        // URLSession may convert httpBody to an input stream before interception.
        if let data = request.httpBody { return try JSONDecoder().decode([String: String].self, from: data) }
        let stream = try XCTUnwrap(request.httpBodyStream)
        stream.open()
        defer { stream.close() }
        var data = Data()
        var bytes = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&bytes, maxLength: bytes.count)
            guard count > 0 else { break }
            data.append(contentsOf: bytes.prefix(count))
        }
        return try JSONDecoder().decode([String: String].self, from: data)
    }

    private func requestJSONObject() throws -> [String: Any] {
        let request = try XCTUnwrap(URLProtocolStub.lastRequest)
        if let data = request.httpBody { return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any]) }
        let stream = try XCTUnwrap(request.httpBodyStream)
        stream.open()
        defer { stream.close() }
        var data = Data()
        var bytes = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&bytes, maxLength: bytes.count)
            guard count > 0 else { break }
            data.append(contentsOf: bytes.prefix(count))
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
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

    func testLogsAPIUsesAuthenticatedContractAndFullLabelReplacement() async throws {
        let id = UUID()
        let labelIDs = [UUID(), UUID()]
        let response = "{\"id\":\"\(id.uuidString)\",\"body\":\"Read\",\"occurredAt\":\"2026-09-13T10:00:00Z\",\"labelIds\":[],\"createdAt\":\"2026-09-13T10:00:00Z\",\"updatedAt\":\"2026-09-13T10:00:00Z\",\"version\":3}"
        URLProtocolStub.responseData = Data(response.utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let api = LogsAPI(client: APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration)), token: "test-token")
        var draft = LogDraft()
        draft.body = "Read"

        let created = try await api.create(draft)
        XCTAssertEqual(created.id, id)
        XCTAssertEqual(URLProtocolStub.lastRequest?.httpMethod, "POST")
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/logs")
        XCTAssertEqual(URLProtocolStub.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
        let createBody = try requestJSONObject()
        XCTAssertEqual(createBody["body"] as? String, "Read")
        XCTAssertNotNil(createBody["occurredAt"] as? String)

        _ = try await api.update(id: id, draft: draft, version: 3)
        XCTAssertEqual(URLProtocolStub.lastRequest?.httpMethod, "PUT")
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/logs/\(id.uuidString)")
        XCTAssertEqual(try requestJSONObject()["version"] as? Int, 3)

        _ = try await api.updateLabels(id: id, ids: labelIDs)
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/logs/\(id.uuidString)/labels")
        XCTAssertEqual(try requestJSONObject()["labelIds"] as? [String], labelIDs.map(\.uuidString))

        URLProtocolStub.statusCode = 204
        URLProtocolStub.responseData = Data()
        try await api.remove(id: id)
        XCTAssertEqual(URLProtocolStub.lastRequest?.httpMethod, "DELETE")
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/logs/\(id.uuidString)")
    }

    func testPathsAPIUsesAuthenticatedMutationContract() async throws {
        let id = UUID()
        let response = "{\"id\":\"\(id.uuidString)\",\"name\":\"Algorithms\",\"description\":\"Study\",\"status\":\"ACTIVE\",\"color\":\"#3B82F6\",\"activityLabel\":\"today\"}"
        URLProtocolStub.responseData = Data(response.utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let api = PathsAPI(client: APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration)), token: "test-token")

        let created = try await api.create(name: "Algorithms", description: "Study", color: "#3B82F6")
        XCTAssertEqual(created.id, id)
        XCTAssertEqual(URLProtocolStub.lastRequest?.httpMethod, "POST")
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/paths")
        XCTAssertEqual(URLProtocolStub.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
        let createBody = try requestJSONObject()
        XCTAssertEqual(createBody["name"] as? String, "Algorithms")
        XCTAssertEqual(createBody["description"] as? String, "Study")
        XCTAssertEqual(createBody["color"] as? String, "#3B82F6")

        _ = try await api.update(id: id, name: "Algorithms", description: nil, color: "#EF4444")
        XCTAssertEqual(URLProtocolStub.lastRequest?.httpMethod, "PUT")
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/paths/\(id.uuidString)")

        URLProtocolStub.statusCode = 204
        URLProtocolStub.responseData = Data()
        try await api.remove(id: id)
        XCTAssertEqual(URLProtocolStub.lastRequest?.httpMethod, "DELETE")
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/paths/\(id.uuidString)")

        try await api.restore(id: id)
        XCTAssertEqual(URLProtocolStub.lastRequest?.httpMethod, "POST")
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/paths/\(id.uuidString)/restore")

        let targetID = UUID()
        try await api.merge(source: id, target: targetID)
        XCTAssertEqual(URLProtocolStub.lastRequest?.url?.path, "/api/v1/paths/\(id.uuidString)/merge")
        XCTAssertEqual(try requestJSONObject()["targetPathId"] as? String, targetID.uuidString)
    }

    func testNativeColorPaletteMatchesWebSharedPalette() {
        XCTAssertEqual(WorkspaceTheme.palette, [
            "#F8FAFC", "#64748B", "#0F172A", "#EAB308", "#F59E0B",
            "#F97316", "#EF4444", "#EC4899", "#A855F7", "#6366F1",
            "#3B82F6", "#06B6D4", "#14B8A6", "#22C55E", "#84CC16",
        ])
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

    @MainActor
    func testRefreshUnauthorizedExpiresCurrentSession() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let model = AppModel(
            api: APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration)),
            arguments: ["Know"]
        )
        model.token = "expired-session"
        URLProtocolStub.statusCode = 401
        await model.refresh()
        XCTAssertNil(model.token)
        XCTAssertFalse(model.signedIn)
    }
}
