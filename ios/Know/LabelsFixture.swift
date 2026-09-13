import Foundation

struct LabelsFixture: LabelsTransport {
    var values: [KBLabel] = [KBLabel(id: UUID(uuidString: "00000000-0000-4000-8000-000000000010")!, name: "Reading", color: "#2878D5", scopes: [.note, .timeEntry])]
    let arguments: [String]
    func list() async throws -> [KBLabel] { if arguments.contains("-labels-error") || arguments.contains("-labels-offline") { throw APIError.offline }; return arguments.contains("-labels-empty") ? [] : values }
    func create(_ draft: LabelDraft) async throws -> KBLabel { KBLabel(id: UUID(), name: draft.name, color: draft.color, scopes: draft.scopes.sorted { $0.rawValue < $1.rawValue }) }
    func update(id: UUID, draft: LabelDraft) async throws -> KBLabel { KBLabel(id: id, name: draft.name, color: draft.color, scopes: draft.scopes.sorted { $0.rawValue < $1.rawValue }) }
    func remove(id: UUID, removeAssignments: Bool) async throws { if arguments.contains("-labels-blocked-delete") && !removeAssignments { throw APIError.http(status: 409, message: nil) } }
}
