import Foundation

struct SessionLabel: Codable, Identifiable, Equatable {
    let id: UUID
    let name: String
    let color: String?
    let scopes: [String]
}

struct TrackedSession: Codable, Identifiable, Equatable {
    let id: UUID
    var pathId: UUID?
    var labelIds: [UUID]?
    var startedAt: String
    var endedAt: String?
    var durationSeconds: Int64?
    var description: String?
    var source: String
    var running: Bool?
}

struct SessionPage: Codable {
    var sessions: [TrackedSession]
    let page: Int
    let totalPages: Int
    let totalSessions: Int
}

struct TrackerSelection: Codable, Equatable {
    var pathId: UUID?
    var labelIds: [UUID] = []
    var description: String?
}

struct SessionDraft: Equatable {
    var pathId: UUID?
    var labelIds: [UUID] = []
    var description = ""
    var startedAt = Date()
    var endedAt = Date()
    var source = "IOS"

    init() {}
    init(_ session: TrackedSession) {
        pathId = session.pathId
        labelIds = session.labelIds ?? []
        description = session.description ?? ""
        startedAt = SessionFormatting.date(session.startedAt) ?? Date()
        endedAt = SessionFormatting.date(session.endedAt) ?? Date()
        source = session.source
    }

    func body(completed: Bool) throws -> Data {
        var fields: [String: Any] = [
            "pathId": pathId?.uuidString as Any? ?? NSNull(),
            "labelIds": labelIds.map(\.uuidString),
            "description": description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? NSNull() : description.trimmingCharacters(in: .whitespacesAndNewlines) as Any,
            "startedAt": SessionFormatting.iso(startedAt),
        ]
        if completed {
            fields["endedAt"] = SessionFormatting.iso(endedAt)
            fields["source"] = source
        }
        return try JSONSerialization.data(withJSONObject: fields)
    }
}

enum SessionFormatting {
    private static let fractionalISO8601Formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let internetISO8601Formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func date(_ value: String?) -> Date? {
        guard let value else { return nil }
        if let date = fractionalISO8601Formatter.date(from: value) { return date }
        return internetISO8601Formatter.date(from: value)
    }

    static func iso(_ date: Date) -> String { internetISO8601Formatter.string(from: date) }

    static func duration(_ seconds: Int64) -> String {
        let seconds = max(0, seconds)
        if seconds < 60 { return "\(seconds.formatted()) \(seconds == 1 ? "second" : "seconds")" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes.formatted()) \(minutes == 1 ? "minute" : "minutes")" }
        let hours = minutes / 60, remainder = minutes % 60
        if hours >= 100 || remainder == 0 { return "\(hours.formatted())h" }
        return "\(hours.formatted())h \(remainder.formatted()) \(remainder == 1 ? "minute" : "minutes")"
    }

    static func clock(start: String?, now: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(date(start) ?? now)))
        return String(format: "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60)
    }

    static func groupDuration(_ sessions: [TrackedSession]) -> String {
        let minutes = max(0, sessions.reduce(0) { $0 + ($1.durationSeconds ?? 0) }) / 60
        return String(format: "%02lld:%02lld", minutes / 60, minutes % 60)
    }

    static func group(_ timestamp: String, now: Date = Date(), calendar: Calendar = .current) -> String {
        guard let date = date(timestamp) else { return "Unknown date" }
        let today = calendar.startOfDay(for: now)
        if calendar.isDate(date, inSameDayAs: today) { return "Today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: today), calendar.isDate(date, inSameDayAs: yesterday) { return "Yesterday" }
        // Match the web's Monday-based week independently of the locale's first weekday.
        let offset = (calendar.component(.weekday, from: today) + 5) % 7
        let week = calendar.date(byAdding: .day, value: -offset, to: today)!
        if date >= week { return "This week" }
        if date >= calendar.date(byAdding: .day, value: -7, to: week)! { return "Last week" }
        let month = calendar.date(from: calendar.dateComponents([.year, .month], from: today))!
        if calendar.isDate(date, equalTo: calendar.date(byAdding: .month, value: -1, to: month)!, toGranularity: .month) { return "Last month" }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        return formatter.string(from: date)
    }
}

protocol SessionsTransport {
    func paths() async throws -> [Path]
    func labels() async throws -> [SessionLabel]
    func history(page: Int) async throws -> SessionPage
    func current() async throws -> TrackedSession?
    func selection() async throws -> TrackerSelection
    func saveSelection(_ draft: SessionDraft) async throws -> TrackerSelection
    func start(_ draft: SessionDraft) async throws -> TrackedSession
    func updateTimer(id: UUID, draft: SessionDraft) async throws -> TrackedSession
    func stop(id: UUID) async throws
    func save(id: UUID, draft: SessionDraft) async throws
    func remove(id: UUID) async throws
    func createPath(name: String) async throws -> Path
    func createLabel(name: String) async throws -> SessionLabel
}

struct SessionsAPI: SessionsTransport {
    let client: APIClient
    let token: String
    func paths() async throws -> [Path] { try await client.request("/paths", token: token) }
    func labels() async throws -> [SessionLabel] { try await client.request("/labels?scope=TIME_ENTRY", token: token) }
    func history(page: Int) async throws -> SessionPage { try await client.request("/time-entries?page=\(page)&size=50", token: token) }
    func current() async throws -> TrackedSession? { try await client.optional("/timers/current", token: token) }
    func selection() async throws -> TrackerSelection { try await client.request("/timers/draft", token: token) }
    func saveSelection(_ draft: SessionDraft) async throws -> TrackerSelection {
        let selection = TrackerSelection(pathId: draft.pathId, labelIds: draft.labelIds, description: draft.description)
        return try await client.request("/timers/draft", method: "PUT", body: JSONEncoder().encode(selection), token: token)
    }
    func start(_ draft: SessionDraft) async throws -> TrackedSession {
        var fields = try JSONSerialization.jsonObject(with: draft.body(completed: false)) as! [String: Any]
        fields.removeValue(forKey: "startedAt")
        fields["source"] = "IOS"
        return try await client.request("/timers", method: "POST", body: JSONSerialization.data(withJSONObject: fields), token: token)
    }
    func updateTimer(id: UUID, draft: SessionDraft) async throws -> TrackedSession {
        try await client.request("/timers/\(id)", method: "PUT", body: draft.body(completed: false), token: token)
    }
    func stop(id: UUID) async throws { try await client.empty("/timers/\(id)/stop", method: "POST", token: token) }
    func save(id: UUID, draft: SessionDraft) async throws {
        let _: TrackedSession = try await client.request("/time-entries/\(id)", method: "PUT", body: draft.body(completed: true), token: token)
    }
    func remove(id: UUID) async throws { try await client.empty("/time-entries/\(id)", method: "DELETE", token: token) }
    func createPath(name: String) async throws -> Path {
        try await client.request("/paths", method: "POST", body: JSONSerialization.data(withJSONObject: ["name": name, "description": NSNull(), "color": "#EF4444"]), token: token)
    }
    func createLabel(name: String) async throws -> SessionLabel {
        try await client.request("/labels", method: "POST", body: JSONSerialization.data(withJSONObject: ["name": name, "scopes": ["TIME_ENTRY"], "color": NSNull()]), token: token)
    }
}
