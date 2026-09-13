import Foundation

actor LogsFixture: LogsTransport {
    static let id = UUID(uuidString: "00000000-0000-4000-8000-000000000101")!
    static let labelID = UUID(uuidString: "00000000-0000-4000-8000-000000000102")!
    private var values: [Log]
    private let label = LogLabel(id: labelID, name: "Important", color: "#2878D5", scopes: ["LOG"])
    private let offline: Bool
    init(arguments: [String] = []) { let timestamp = LogFormatting.iso(Date().addingTimeInterval(-1800)); offline = arguments.contains("-logs-offline"); values = arguments.contains("-logs-empty") ? [] : [Log(id: Self.id, body: "Fixture thought", occurredAt: timestamp, labelIds: [], createdAt: timestamp, updatedAt: timestamp, version: 0)] }
    private func check() throws { if offline { throw APIError.offline } }
    func logs() async throws -> [Log] { try check(); return values }
    func labels() async throws -> [LogLabel] { try check(); return [label] }
    func create(_ draft: LogDraft) async throws -> Log { try check(); let log = Log(id: UUID(), body: draft.body.trimmingCharacters(in: .whitespacesAndNewlines), occurredAt: LogFormatting.iso(draft.occurredAt), labelIds: [], createdAt: LogFormatting.iso(Date()), updatedAt: LogFormatting.iso(Date()), version: 0); values.append(log); return log }
    func fetch(id: UUID) async throws -> Log { try check(); return values.first { $0.id == id }! }
    func update(id: UUID, draft: LogDraft, version: Int) async throws -> Log { try check(); let old = try await fetch(id: id); let value = Log(id: id, body: draft.body, occurredAt: LogFormatting.iso(draft.occurredAt), labelIds: old.labelIds, createdAt: old.createdAt, updatedAt: LogFormatting.iso(Date()), version: version + 1); values[values.firstIndex { $0.id == id }!] = value; return value }
    func updateLabels(id: UUID, ids: [UUID]) async throws -> Log { try check(); let old = try await fetch(id: id); let value = Log(id: id, body: old.body, occurredAt: old.occurredAt, labelIds: ids, createdAt: old.createdAt, updatedAt: old.updatedAt, version: old.version + 1); values[values.firstIndex { $0.id == id }!] = value; return value }
    func remove(id: UUID) async throws { try check(); values.removeAll { $0.id == id } }
}
