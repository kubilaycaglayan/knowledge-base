import Foundation

struct LogLabel: Codable, Identifiable, Equatable {
    let id: UUID
    let name: String
    let color: String?
    let scopes: [String]
}

struct Log: Codable, Identifiable, Equatable {
    let id: UUID
    var body: String
    var occurredAt: String
    let labelIds: [UUID]
    let createdAt: String
    let updatedAt: String
    let version: Int
}

struct LogDraft: Equatable {
    var body = ""
    var occurredAt: Date
    init() { occurredAt = LogFormatting.deviceMinute(Date()) }
    init(_ log: Log) { body = log.body; occurredAt = LogFormatting.date(log.occurredAt) ?? Date() }
}

enum LogFormatting {
    static func deviceMinute(_ value: Date, calendar: Calendar = .current) -> Date {
        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: value)
        return calendar.date(from: components) ?? value
    }
    static func date(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? {
            formatter.formatOptions = [.withInternetDateTime]
            return formatter.date(from: value)
        }()
    }
    static func iso(_ value: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: value)
    }
    static func localInput(_ value: Date, calendar: Calendar = .current) -> Date { value }
    static func display(_ value: String, group: String, calendar: Calendar = .current) -> String {
        guard let date = date(value) else { return value }
        let formatter = DateFormatter(); formatter.calendar = calendar; formatter.locale = Locale.current; formatter.timeZone = calendar.timeZone
        formatter.dateFormat = group == "Last hour" || group == "Today" ? "HH:mm" : "MMM d HH:mm"
        return formatter.string(from: date)
    }
    static func group(_ value: String, now: Date = Date(), calendar: Calendar = .current) -> String {
        guard let date = date(value) else { return "Unknown date" }
        let today = calendar.startOfDay(for: now)
        if date >= now.addingTimeInterval(-3600) { return "Last hour" }
        if calendar.isDate(date, inSameDayAs: today) { return "Today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: today), calendar.isDate(date, inSameDayAs: yesterday) { return "Yesterday" }
        let offset = (calendar.component(.weekday, from: today) + 5) % 7
        let week = calendar.date(byAdding: .day, value: -offset, to: today)!
        if date >= week { return "This week" }
        if date >= calendar.date(byAdding: .day, value: -7, to: week)! { return "Last week" }
        let month = calendar.date(from: calendar.dateComponents([.year, .month], from: today))!
        if date >= month && date < calendar.date(byAdding: .month, value: 1, to: month)! { return "This month" }
        if date >= calendar.date(byAdding: .month, value: -1, to: month)! && date < month { return "Last month" }
        let formatter = DateFormatter(); formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.dateFormat = "LLLL yyyy"
        return formatter.string(from: date)
    }
    static func sameDay(_ a: String, _ b: String, calendar: Calendar = .current) -> Bool { guard let a = date(a), let b = date(b) else { return false }; return calendar.isDate(a, inSameDayAs: b) }
    static func sameHour(_ a: String, _ b: String, calendar: Calendar = .current) -> Bool { guard let a = date(a), let b = date(b) else { return false }; return sameDay(a: a, b: b, calendar: calendar) && calendar.component(.hour, from: a) == calendar.component(.hour, from: b) }
    private static func sameDay(a: Date, b: Date, calendar: Calendar) -> Bool { calendar.isDate(a, inSameDayAs: b) }
}

protocol LogsTransport {
    func logs() async throws -> [Log]
    func labels() async throws -> [LogLabel]
    func create(_ draft: LogDraft) async throws -> Log
    func fetch(id: UUID) async throws -> Log
    func update(id: UUID, draft: LogDraft, version: Int) async throws -> Log
    func updateLabels(id: UUID, ids: [UUID]) async throws -> Log
    func remove(id: UUID) async throws
}

struct LogsAPI: LogsTransport {
    let client: APIClient; let token: String
    func logs() async throws -> [Log] { try await client.request("/logs", token: token) }
    func labels() async throws -> [LogLabel] { try await client.request("/labels?scope=LOG", token: token) }
    private func body(_ draft: LogDraft, version: Int? = nil) throws -> Data {
        var fields: [String: Any] = ["body": draft.body, "occurredAt": LogFormatting.iso(draft.occurredAt)]
        if let version { fields["version"] = version }
        return try JSONSerialization.data(withJSONObject: fields)
    }
    func create(_ draft: LogDraft) async throws -> Log { try await client.request("/logs", method: "POST", body: body(draft), token: token) }
    func fetch(id: UUID) async throws -> Log { try await client.request("/logs/\(id)", token: token) }
    func update(id: UUID, draft: LogDraft, version: Int) async throws -> Log { try await client.request("/logs/\(id)", method: "PUT", body: body(draft, version: version), token: token) }
    func updateLabels(id: UUID, ids: [UUID]) async throws -> Log { try await client.request("/logs/\(id)/labels", method: "PUT", body: JSONSerialization.data(withJSONObject: ["labelIds": ids.map(\.uuidString)]), token: token) }
    func remove(id: UUID) async throws { try await client.empty("/logs/\(id)", method: "DELETE", token: token) }
}
