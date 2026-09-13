import Foundation

struct PathSummary: Codable {
    let path: Path
    let trackedSeconds: Int64
    let recentActivity: [Activity]
}

struct MergePathRequest: Codable {
    let targetPathId: UUID
}

protocol PathsTransport {
    func paths() async throws -> [Path]
    func summary(id: UUID) async throws -> PathSummary
    func create(name: String, description: String?, color: String) async throws -> Path
    func update(id: UUID, name: String, description: String?, color: String) async throws -> Path
    func remove(id: UUID) async throws
    func restore(id: UUID) async throws
    func merge(source: UUID, target: UUID) async throws
    func session(id: UUID) async throws -> TrackedSession
}

struct PathsAPI: PathsTransport {
    let client: APIClient
    let token: String

    func paths() async throws -> [Path] { try await client.request("/paths", token: token) }
    func summary(id: UUID) async throws -> PathSummary { try await client.request("/paths/\(id)/summary", token: token) }

    func create(name: String, description: String?, color: String) async throws -> Path {
        let body = try JSONEncoder().encode(PathRequest(name: name, description: description, color: color))
        return try await client.request("/paths", method: "POST", body: body, token: token)
    }

    func update(id: UUID, name: String, description: String?, color: String) async throws -> Path {
        let body = try JSONEncoder().encode(PathRequest(name: name, description: description, color: color))
        return try await client.request("/paths/\(id)", method: "PUT", body: body, token: token)
    }

    func remove(id: UUID) async throws { try await client.empty("/paths/\(id)", method: "DELETE", token: token) }
    func restore(id: UUID) async throws { try await client.empty("/paths/\(id)/restore", method: "POST", token: token) }

    func merge(source: UUID, target: UUID) async throws {
        let body = try JSONEncoder().encode(MergePathRequest(targetPathId: target))
        try await client.empty("/paths/\(source)/merge", method: "POST", body: body, token: token)
    }

    func session(id: UUID) async throws -> TrackedSession {
        try await client.request("/time-entries/\(id)", token: token)
    }
}

@MainActor final class PathsModel: ObservableObject {
    @Published private(set) var paths: [Path] = []
    @Published private(set) var summaries: [UUID: PathSummary] = [:]
    @Published private(set) var pendingRemoval: Path?
    @Published private(set) var isLoading = false
    @Published private(set) var busy = false
    @Published var error: String?

    private let transport: PathsTransport
    private let unauthorized: () -> Void
    private let invalidateReports: () -> Void
    private var removalTask: Task<Void, Never>?
    private var loadRevision = 0
    private var summaryRevisions: [UUID: Int] = [:]

    init(transport: PathsTransport, unauthorized: @escaping () -> Void = {}, invalidateReports: @escaping () -> Void = {}) {
        self.transport = transport
        self.unauthorized = unauthorized
        self.invalidateReports = invalidateReports
    }

    deinit { removalTask?.cancel() }

    func load(force: Bool = false) async {
        guard !isLoading || force else { return }
        loadRevision += 1
        let revision = loadRevision
        isLoading = true
        error = nil
        do {
            let values = try await transport.paths()
            guard revision == loadRevision else { return }
            paths = values
        }
        catch { fail(error, "Unable to load paths.") }
        isLoading = false
    }

    func loadSummary(for path: Path) async {
        let revision = (summaryRevisions[path.id] ?? 0) + 1
        summaryRevisions[path.id] = revision
        error = nil
        do {
            let value = try await transport.summary(id: path.id)
            guard summaryRevisions[path.id] == revision else { return }
            summaries[path.id] = value
        }
        catch { fail(error, "Could not load path history.") }
    }

    func create(name: String, description: String, color: String) async -> Bool {
        guard !busy else { return false }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { error = "Path name is required."; return false }
        busy = true; error = nil
        defer { busy = false }
        do {
            let value = try await transport.create(name: cleanName, description: clean(description), color: color)
            paths.insert(value, at: 0)
            invalidateReports()
            return true
        } catch { fail(error, "Could not create the path."); return false }
    }

    func update(_ path: Path, name: String, description: String, color: String) async -> Bool {
        guard !busy else { return false }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { error = "Path name is required."; return false }
        busy = true; error = nil
        defer { busy = false }
        do {
            let value = try await transport.update(id: path.id, name: cleanName, description: clean(description), color: color)
            replace(value)
            if summaries[path.id] != nil { await loadSummary(for: value) }
            invalidateReports()
            return true
        } catch { fail(error, "Could not update path."); return false }
    }

    func remove(_ path: Path) async -> Bool {
        guard !busy else { return false }
        busy = true; error = nil
        defer { busy = false }
        do {
            try await transport.remove(id: path.id)
            paths.removeAll { $0.id == path.id }
            summaries[path.id] = nil
            invalidateReports()
            pendingRemoval = path
            removalTask?.cancel()
            removalTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(8))
                guard !Task.isCancelled else { return }
                await self?.expireRemoval()
            }
            return true
        } catch { fail(error, "Could not remove path."); return false }
    }

    func undoRemoval() async -> Bool {
        guard let path = pendingRemoval else { return false }
        busy = true; error = nil
        defer { busy = false }
        do {
            try await transport.restore(id: path.id)
            paths.insert(path, at: 0)
            pendingRemoval = nil
            removalTask?.cancel()
            invalidateReports()
            return true
        } catch { fail(error, "Could not undo path removal."); return false }
    }

    func merge(source: Path, into target: Path) async -> Bool {
        guard source.id != target.id, !busy else { return false }
        busy = true; error = nil
        defer { busy = false }
        do {
            try await transport.merge(source: source.id, target: target.id)
            summaries[source.id] = nil
            await load(force: true)
            invalidateReports()
            return true
        } catch { fail(error, "Could not merge paths. Try again."); return false }
    }

    func session(id: UUID) async -> TrackedSession? {
        do { return try await transport.session(id: id) }
        catch { fail(error, "Could not load this session."); return nil }
    }

    private func clean(_ value: String) -> String? {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    private func replace(_ path: Path) {
        if let index = paths.firstIndex(where: { $0.id == path.id }) { paths[index] = path }
        else { paths.insert(path, at: 0) }
    }

    private func expireRemoval() { pendingRemoval = nil; removalTask = nil }

    private func fail(_ failure: Error, _ message: String) {
        if let failure = failure as? APIError, case .unauthorized = failure { unauthorized(); return }
        if let failure = failure as? APIError, case .offline = failure {
            error = "No network connection. Reconnect and try again."
        } else { error = message }
    }
}

enum PathHistoryFormatting {
    static func date(_ value: String?) -> Date? { SessionFormatting.date(value) }

    static func group(_ value: String, now: Date = Date(), calendar: Calendar = .current) -> String {
        guard let date = date(value) else { return "Unknown date" }
        let today = calendar.startOfDay(for: now)
        if calendar.isDate(date, inSameDayAs: today) { return "Today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: today), calendar.isDate(date, inSameDayAs: yesterday) { return "Yesterday" }
        let offset = (calendar.component(.weekday, from: today) + 5) % 7
        let week = calendar.date(byAdding: .day, value: -offset, to: today)!
        if date >= week { return "This week" }
        if date >= calendar.date(byAdding: .day, value: -7, to: week)! { return "Last week" }
        let month = calendar.date(from: calendar.dateComponents([.year, .month], from: today))!
        if calendar.isDate(date, equalTo: calendar.date(byAdding: .month, value: -1, to: month)!, toGranularity: .month) { return "Last month" }
        let formatter = DateFormatter(); formatter.calendar = calendar; formatter.locale = .current; formatter.timeZone = calendar.timeZone; formatter.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        return formatter.string(from: date)
    }

    static func display(_ value: String, calendar: Calendar = .current) -> String {
        guard let date = date(value) else { return value }
        let formatter = DateFormatter(); formatter.calendar = calendar; formatter.locale = .current; formatter.timeZone = calendar.timeZone; formatter.setLocalizedDateFormatFromTemplate("d MMM yyyy, HH:mm")
        return formatter.string(from: date)
    }

    static func visible(_ events: [Activity]) -> [Activity] {
        let stopped = events.filter { $0.type == "TIMER_STOPPED" }
        return events.filter { event in
            if event.type == "TIMER_STOPPED" { return false }
            if event.type == "TIME_TRACKED" { return true }
            guard event.type == "TIMER_STARTED" else { return true }
            return !stopped.contains { $0.detail == event.detail }
        }
    }
}
