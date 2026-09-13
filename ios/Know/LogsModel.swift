import Foundation

@MainActor final class LogsModel: ObservableObject {
    @Published private(set) var logs: [Log] = []
    @Published private(set) var labels: [LogLabel] = []
    @Published var draft = LogDraft()
    @Published var editing: Log?
    @Published var editDraft = LogDraft()
    @Published private(set) var loading = false
    @Published private(set) var busy = false
    @Published private(set) var labelBusyID: UUID?
    @Published var error: String?
    @Published var savedAnnouncement = false
    private let transport: LogsTransport; private let unauthorized: () -> Void
    private var active = false; private var refreshTask: Task<Void, Never>?
    init(transport: LogsTransport, unauthorized: @escaping () -> Void = {}) { self.transport = transport; self.unauthorized = unauthorized }
    var hasUnsavedDraft: Bool { !draft.body.isEmpty || editing != nil }
    func load() async {
        guard !loading else { return }; loading = true; error = nil
        async let logResult = transport.logs(); async let labelResult = transport.labels()
        do { logs = try await logResult.sorted(by: Self.newestFirst) } catch { fail(error, "Unable to load logs. Please try again.") }
        do { labels = try await labelResult.filter { $0.scopes.contains("LOG") } } catch { fail(error, "Unable to load log labels. Please try again.") }
        loading = false
    }
    func create() async {
        guard !busy, !draft.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        busy = true; error = nil; savedAnnouncement = false; let snapshot = draft
        defer { busy = false }
        do { let result = try await transport.create(snapshot); upsert(result); if draft == snapshot { draft = LogDraft() }; savedAnnouncement = true }
        catch { fail(error, "Unable to save log. Please try again.") }
    }
    func beginEdit(_ log: Log) { editing = log; editDraft = LogDraft(log); error = nil }
    func cancelEdit() { editing = nil }
    func saveEdit() async {
        guard !busy, let original = editing, !editDraft.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        busy = true; error = nil; let snapshot = editDraft
        defer { busy = false }
        do {
            var saved: Log
            do { saved = try await transport.update(id: original.id, draft: snapshot, version: original.version) }
            catch let APIError.http(status, _) where status == 409 {
                let latest = try await transport.fetch(id: original.id)
                saved = try await transport.update(id: original.id, draft: snapshot, version: latest.version)
            }
            upsert(saved); if editDraft == snapshot { editing = nil }
        } catch { fail(error, "Unable to save this log. Your text is still here; try again.") }
    }
    func remove(_ log: Log) async { guard !busy else { return }; busy = true; error = nil; defer { busy = false }; do { try await transport.remove(id: log.id); logs.removeAll { $0.id == log.id } } catch { fail(error, "Unable to remove this log. Please try again.") } }
    func toggleLabel(_ id: UUID, for log: Log) async { guard labelBusyID == nil else { return }; labelBusyID = log.id; error = nil; defer { labelBusyID = nil }; var ids = log.labelIds; if ids.contains(id) { ids.removeAll { $0 == id } } else { ids.append(id) }; do { let saved = try await transport.updateLabels(id: log.id, ids: ids); upsert(saved) } catch { fail(error, "Unable to update this log’s labels. Please try again.") } }
    func upsert(_ log: Log) { logs = (logs.filter { $0.id != log.id } + [log]).sorted(by: Self.newestFirst) }
    func resume() { guard !active else { return }; active = true; refreshTask = Task { [weak self] in guard let self else { return }; await load(); while !Task.isCancelled { try? await Task.sleep(for: .seconds(15)); if !Task.isCancelled, editing == nil { await load() } } } }
    func suspend() { active = false; refreshTask?.cancel(); refreshTask = nil }
    private static func newestFirst(_ a: Log, _ b: Log) -> Bool { (LogFormatting.date(a.occurredAt) ?? .distantPast) > (LogFormatting.date(b.occurredAt) ?? .distantPast) || (a.occurredAt == b.occurredAt && a.id.uuidString > b.id.uuidString) }
    private func fail(_ failure: Error, _ message: String) { if failure is CancellationError { return }; if case APIError.unauthorized = failure { suspend(); unauthorized() } else if case APIError.offline = failure { error = "No network connection. Reconnect and try again." } else { error = message } }
}
