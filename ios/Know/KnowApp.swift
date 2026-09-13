import SwiftUI
import Combine
import Foundation
import Security
import GoogleSignIn

struct Path: Codable, Identifiable {
    let id: UUID
    let name: String
    let description: String?
    let status: String
    var color: String? = nil
}

struct DailyLabel: Codable, Identifiable {
    let id: UUID
    let name: String
    let color: String?
}

struct Note: Codable, Identifiable {
    let id: UUID
    let pathId: UUID?
    let activityId: UUID?
    let timeEntryId: UUID?
    let title: String
    let content: String
}

struct Activity: Codable, Identifiable {
    let id: UUID
    let type: String
    let title: String
    let detail: String?
    let occurredAt: String
    let timeEntryId: UUID?
}

struct TimerState: Codable, Identifiable {
    let id: UUID
    let pathId: UUID?
    let labelIds: [UUID]
    let startedAt: String
    let endedAt: String?
    let description: String?
    let running: Bool
}

struct TimerRequest: Codable {
    let pathId: String?
    let labelIds: [String]
    let description: String
    let source: String
}

struct TimerUpdateRequest: Codable {
    let pathId: String?
    let labelIds: [String]
    let startedAt: String
    let description: String?
}

struct PathRequest: Codable {
    let name: String
    let description: String?
}

struct LabelRequest: Codable {
    let name: String
    let color: String?
}

struct Statistics: Codable {
    let todaySeconds: Int64
    let weekSeconds: Int64
    let monthSeconds: Int64
    let todayByPath: [String: Int64]
    let todayByLabel: [String: Int64]
    let weekByPath: [String: Int64]
    let weekByLabel: [String: Int64]
}

struct AuthResponse: Codable {
    let token: String
    let userId: UUID
    let email: String
    let displayName: String
}

func isUITesting(arguments: [String] = ProcessInfo.processInfo.arguments) -> Bool {
    arguments.contains("-ui-testing")
}

enum KeychainTokenStore {
    private static let account = "session"

    static func read(service: String = "com.know.ios") -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String, service: String = "com.know.ios") throws {
        delete(service: service)
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
            throw SessionError.storage
        }
    }

    static func delete(service: String = "com.know.ios") {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum APIError: Error { case unauthorized; case offline }
enum AuthPhase: Equatable {
    case idle
    case authenticating
    case failed
}
struct APIClient {
    let base: URL
    let session: URLSession

    init(base: URL? = nil, session: URLSession = .shared) {
        self.base = base ?? URL(
            string: ProcessInfo.processInfo.environment["KNOW_API_URL"]
                ?? Bundle.main.object(forInfoDictionaryKey: "KnowledgeBaseAPIURL") as? String
                ?? "http://localhost:8080/api/v1"
        )!
        self.session = session
    }

    private func makeRequest(
        _ path: String,
        method: String,
        body: Data?,
        token: String?
    ) -> URLRequest {
        // Resolve query parameters separately: appendingPathComponent percent-encodes '?'.
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)!
        let relative = URLComponents(string: path)!
        components.path = base.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            .isEmpty ? relative.path : base.path + (relative.path.hasPrefix("/") ? "" : "/") + relative.path
        components.queryItems = relative.queryItems
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let attempts = request.httpMethod == "GET" || request.httpMethod == "HEAD" ? 2 : 1
        for attempt in 0..<attempts {
            do {
                let (data, response) = try await session.data(for: request)
                guard let http = response as? HTTPURLResponse else {
                    throw URLError(.badServerResponse)
                }
                if http.statusCode == 401 {
                    throw APIError.unauthorized
                }
                guard 200..<300 ~= http.statusCode else {
                    throw URLError(.badServerResponse)
                }
                return data
            } catch let error as APIError { throw error }
              catch let error as URLError where Self.isTransient(error) {
                if attempt + 1 < attempts { continue }
                throw APIError.offline
            }
        }
        throw APIError.offline
    }

    private static func isTransient(_ error: URLError) -> Bool {
        [
            .notConnectedToInternet,
            .networkConnectionLost,
            .timedOut,
            .cannotConnectToHost,
            .cannotFindHost,
        ].contains(error.code)
    }

    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Data? = nil,
        token: String? = nil
    ) async throws -> T {
        let data = try await send(makeRequest(path, method: method, body: body, token: token))
        return try JSONDecoder().decode(T.self, from: data)
    }

    func optional<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Data? = nil,
        token: String? = nil
    ) async throws -> T? {
        let data = try await send(makeRequest(path, method: method, body: body, token: token))
        return data.isEmpty ? nil : try JSONDecoder().decode(T?.self, from: data)
    }

    func empty(_ path: String, method: String, token: String) async throws {
        _ = try await send(makeRequest(path, method: method, body: Data("{}".utf8), token: token))
    }
}

@MainActor final class AppModel: ObservableObject {
    @Published var token = KeychainTokenStore.read()
    @Published var paths: [Path] = []
    @Published var labels: [DailyLabel] = []
    @Published var notes: [Note] = []
    @Published var activities: [Activity] = []
    @Published var timer: TimerState?
    @Published var stats: Statistics?
    @Published var error: String?
    @Published var isLoading = false
    @Published var isAuthenticating = false
    @Published var authError: String?
    @Published private(set) var authPhase: AuthPhase = .idle

    let api: APIClient
    private let uiTesting: Bool
    // Invalidates completions from requests started before sign-out or a newer
    // authentication attempt. This prevents an old response from replacing a
    // newly accepted session.
    private var authGeneration = 0

    init(api: APIClient = APIClient(), arguments: [String] = ProcessInfo.processInfo.arguments) {
        self.api = api
        uiTesting = isUITesting(arguments: arguments)
        if uiTesting {
            token = nil
        }
        if arguments.contains("-ui-testing-authenticated") {
            let pathId = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
            token = "ui-test-token"
            paths = [
                Path(id: pathId, name: "UI Test Path", description: "Fixture path", status: "ACTIVE")
            ]
            labels = [
                DailyLabel(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000002")!,
                    name: "UI Test Label",
                    color: "#2878D5"
                )
            ]
        }
    }

    var signedIn: Bool { token != nil }

    func clearAuthError() {
        authError = nil
        if authPhase == .failed { authPhase = .idle }
    }

    func handle(_ failure: Error, _ message: String, expectedToken: String? = nil) {
        if let failure = failure as? APIError {
            switch failure {
            case .unauthorized:
                if expectedToken == nil || expectedToken == token { signOut() }
            case .offline:
                error = "No network connection. Reconnect and try again."
            }
        } else {
            error = message
        }
    }

    func authenticate(email: String, password: String, register: Bool) async {
        guard !isAuthenticating else { return }
        authGeneration += 1
        let generation = authGeneration
        isAuthenticating = true
        authPhase = .authenticating
        authError = nil
        defer {
            isAuthenticating = false
            if authPhase == .authenticating { authPhase = .idle }
        }
        do {
            let body = try JSONEncoder().encode(["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password])
            let result: AuthResponse = try await api.request(
                register ? "/auth/register" : "/auth/login",
                method: "POST",
                body: body
            )
            guard generation == authGeneration else { return }
            try acceptSession(result)
        } catch {
            if generation == authGeneration {
                authError = authenticationMessage(error)
                authPhase = .failed
            }
        }
    }

    func authenticateWithGoogle(idToken: () async throws -> String) async {
        guard !isAuthenticating else { return }
        authGeneration += 1
        let generation = authGeneration
        isAuthenticating = true
        authPhase = .authenticating
        authError = nil
        defer {
            isAuthenticating = false
            if authPhase == .authenticating { authPhase = .idle }
        }
        do {
            let credential = try await idToken()
            guard !credential.isEmpty else { throw SessionError.google }
            let result: AuthResponse = try await api.request("/auth/google", method: "POST",
                body: JSONEncoder().encode(["idToken": credential]))
            guard generation == authGeneration else { return }
            try acceptSession(result)
        } catch {
            if (error as NSError).domain == kGIDSignInErrorDomain,
               (error as NSError).code == GIDSignInError.canceled.rawValue { return }
            if generation == authGeneration {
                authError = authenticationMessage(error)
                authPhase = .failed
            }
        }
    }

    private func acceptSession(_ result: AuthResponse) throws {
        guard !result.token.isEmpty else { throw SessionError.google }
        if !uiTesting { try KeychainTokenStore.save(result.token) }
        token = result.token
    }

    private func authenticationMessage(_ error: Error) -> String {
        if case APIError.offline = error { return "No network connection. Reconnect and try again." }
        if case SessionError.storage = error { return "Could not securely save your session. Please try again." }
        if let error = error as? SessionError { return error.localizedDescription }
        // Keep public password auth aligned with the web's intentionally
        // non-disclosing error (including invalid credentials and duplicates).
        return "Could not authenticate. Use a valid email and a password of at least 9 characters."
    }

    func refresh() async {
        guard let token else { return }
        if uiTesting { return }
        isLoading = true
        defer { isLoading = false }
        do {
            async let p: [Path] = api.request("/paths", token: token)
            async let l: [DailyLabel] = api.request("/calendar/labels", token: token)
            async let n: [Note] = api.request("/notes", token: token)
            async let a: [Activity] = api.request("/activities", token: token)
            async let s: Statistics = api.request("/statistics", token: token)
            paths = try await p
            labels = try await l
            notes = try await n
            activities = try await a
            stats = try await s
            timer = try await api.optional("/timers/current", token: token)
        } catch {
            handle(error, "Could not refresh your workspace.", expectedToken: token)
        }
    }

    func toggleTimer(pathId: UUID? = nil, labelId: UUID? = nil) async {
        guard let token else { return }
        do {
            if timer != nil {
                try await api.empty("/timers/stop", method: "POST", token: token)
                timer = nil
            } else {
                let data = try JSONEncoder().encode(
                    TimerRequest(
                        pathId: pathId?.uuidString,
                        labelIds: labelId.map { [$0.uuidString] } ?? [],
                        description: "iOS session",
                        source: "IOS"
                    )
                )
                timer = try await api.request("/timers", method: "POST", body: data, token: token)
            }
        } catch {
            handle(error, "Could not update the timer.")
        }
    }

    func configureTimer(
        pathId: UUID?,
        labelId: UUID?,
        startedAt: Date,
        description: String?
    ) async {
        guard let token, let current = timer else { return }
        do {
            let formatter = ISO8601DateFormatter()
            let data = try JSONEncoder().encode(
                TimerUpdateRequest(
                    pathId: pathId?.uuidString,
                    labelIds: labelId.map { [$0.uuidString] } ?? [],
                    startedAt: formatter.string(from: startedAt),
                    description: description
                )
            )
            timer = try await api.request(
                "/timers/\(current.id)",
                method: "PUT",
                body: data,
                token: token
            )
        } catch {
            handle(error, "Could not save the active timer settings.")
        }
    }

    func cancelTimer() async {
        guard let token else { return }
        do {
            try await api.empty("/timers/cancel", method: "POST", token: token)
            timer = nil
        } catch {
            handle(error, "Could not cancel the timer.")
        }
    }

    func createPath(name: String, description: String) async {
        guard let token else { return }
        do {
            let body = try JSONEncoder().encode(
                PathRequest(name: name, description: description.isEmpty ? nil : description)
            )
            let _: Path = try await api.request("/paths", method: "POST", body: body, token: token)
            await refresh()
        } catch {
            handle(error, "Could not create the path.")
        }
    }

    func createLabel(name: String) async {
        guard let token else { return }
        do {
            let body = try JSONEncoder().encode(
                LabelRequest(name: name.trimmingCharacters(in: .whitespacesAndNewlines), color: nil)
            )
            let _: DailyLabel = try await api.request("/calendar/labels", method: "POST", body: body, token: token)
            await refresh()
        } catch {
            handle(error, "Could not create the label.")
        }
    }

    func signOut() {
        authGeneration += 1
        token = nil
        authError = nil
        authPhase = .idle
        if !uiTesting {
            KeychainTokenStore.delete()
            // Keep Google's saved session so the next explicit Google login
            // can restore silently instead of starting a new OAuth flow.
        }
        paths = []
        labels = []
        notes = []
        activities = []
        timer = nil
        stats = nil
    }
}

func formatSeconds(_ value: Int64) -> String {
    let hours = value / 3600
    let minutes = (value % 3600) / 60
    return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
}

@main
struct KnowApp: App {
    @StateObject private var model = AppModel()
    var body: some Scene { WindowGroup { RootView().environmentObject(model)
        .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
    } }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        Group { if model.signedIn { WorkspaceView(app: model) } else { LoginView() } }
            .alert("Knowledge Base", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) { Button("OK") {} } message: { Text(model.error ?? "") }
    }
}

struct PathsView: View {
    @EnvironmentObject var model: AppModel
    @State private var adding = false
    @State private var name = ""
    @State private var description = ""
    var body: some View {
        NavigationStack {
            List {
                if model.paths.isEmpty && !model.isLoading {
                    ContentUnavailableView("No paths yet", systemImage: "folder", description: Text("Create a path to organize your learning."))
                }
                ForEach(model.paths) { path in
                    VStack(alignment: .leading) {
                        Text(path.name).font(.headline)
                        if let description = path.description {
                            Text(description).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Paths")
            .toolbar { Button("Add path") { adding = true }.accessibilityIdentifier("paths.add") }
            .sheet(isPresented: $adding) {
                NavigationStack {
                    Form {
                        TextField("Name", text: $name).accessibilityIdentifier("paths.name")
                        TextEditor(text: $description)
                            .frame(minHeight: 100)
                            .accessibilityIdentifier("paths.description")
                    }
                        .navigationTitle("New path")
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { adding = false } }
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Save") {
                                    Task {
                                        await model.createPath(name: name, description: description)
                                        name = ""
                                        description = ""
                                        adding = false
                                    }
                                }
                                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                .accessibilityIdentifier("paths.save")
                            }
                        }
                }
            }
        }
    }
}

struct TimelineView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        NavigationStack {
            List {
                if model.activities.isEmpty && !model.isLoading {
                    ContentUnavailableView("No activity yet", systemImage: "clock", description: Text("Your learning history will appear here."))
                }
                ForEach(model.activities) { activity in
                    VStack(alignment: .leading) {
                        Text(activity.title).font(.headline)
                        Text(activity.type.replacingOccurrences(of: "_", with: " "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let detail = activity.detail {
                            Text(detail).font(.subheadline)
                        }
                    }
                }
            }.navigationTitle("Timeline")
        }
    }
}
