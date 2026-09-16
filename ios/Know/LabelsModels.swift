import Foundation
import Observation

enum LabelScope: String, Codable, CaseIterable, Identifiable {
  case note = "NOTE"
  case calendar = "CALENDAR"
  case timeEntry = "TIME_ENTRY"
  case log = "LOG"

  var id: String { rawValue }
  var title: String {
    switch self {
    case .note: return "Notes"
    case .calendar: return "Calendar"
    case .timeEntry: return "Sessions"
    case .log: return "Logs"
    }
  }
}

struct KBLabel: Codable, Identifiable, Equatable {
  let id: UUID
  var name: String
  var color: String?
  var scopes: [LabelScope]
  var system: Bool = false

  enum CodingKeys: String, CodingKey { case id, name, color, scopes, system }
  init(id: UUID, name: String, color: String?, scopes: [LabelScope], system: Bool = false) {
    self.id = id
    self.name = name
    self.color = color
    self.scopes = scopes
    self.system = system
  }
  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(UUID.self, forKey: .id)
    name = try container.decode(String.self, forKey: .name)
    color = try container.decodeIfPresent(String.self, forKey: .color)
    scopes = try container.decode([LabelScope].self, forKey: .scopes)
    system = try container.decodeIfPresent(Bool.self, forKey: .system) ?? false
  }
}

struct LabelDraft: Equatable {
  var name = ""
  var color: String? = WorkspaceTheme.palette[0]
  // Scopes are persisted as places where the label is available. Label
  // management presents the inverse, so new labels are hidden from Calendar.
  var scopes: Set<LabelScope> = Set(LabelScope.allCases.filter { $0 != .calendar })

  init() {}
  init(_ label: KBLabel) {
    name = label.name
    color = label.color
    scopes = Set(label.scopes)
  }
}

protocol LabelsTransport {
  func list() async throws -> [KBLabel]
  func create(_ draft: LabelDraft) async throws -> KBLabel
  func update(id: UUID, draft: LabelDraft) async throws -> KBLabel
  func remove(id: UUID, removeAssignments: Bool) async throws
}

struct LabelsAPI: LabelsTransport {
  let client: APIClient
  let token: String
  private func body(_ draft: LabelDraft) throws -> Data {
    let color: Any = draft.color.map { $0 as Any } ?? NSNull()
    return try JSONSerialization.data(withJSONObject: [
      "name": draft.name,
      "color": color,
      "scopes": draft.scopes.map(\.rawValue).sorted(),
    ])
  }
  func list() async throws -> [KBLabel] { try await client.request("/labels", token: token) }
  func create(_ draft: LabelDraft) async throws -> KBLabel {
    try await client.request("/labels", method: "POST", body: body(draft), token: token)
  }
  func update(id: UUID, draft: LabelDraft) async throws -> KBLabel {
    try await client.request("/labels/\(id)", method: "PUT", body: body(draft), token: token)
  }
  func remove(id: UUID, removeAssignments: Bool) async throws {
    let suffix = removeAssignments ? "?removeAssignments=true" : ""
    try await client.empty("/labels/\(id)\(suffix)", method: "DELETE", token: token)
  }
}

@MainActor @Observable final class LabelsModel {
  private(set) var labels: [KBLabel] = []
  private(set) var loading = false
  private(set) var loaded = false
  private(set) var busy = false
  var error: String?
  var draft = LabelDraft()
  private(set) var editingID: UUID?
  var editingDraft: LabelDraft?
  private(set) var deleteCandidate: KBLabel?
  private(set) var deleteAssignmentsCandidate: KBLabel?
  private let transport: LabelsTransport
  private let unauthorized: () -> Void
  private let invalidateReports: () -> Void

  init(
    transport: LabelsTransport, unauthorized: @escaping () -> Void = {},
    invalidateReports: @escaping () -> Void = {}
  ) {
    self.transport = transport
    self.unauthorized = unauthorized
    self.invalidateReports = invalidateReports
  }

  var sortedLabels: [KBLabel] {
    labels.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }
  var hasUnsavedDraft: Bool { editingDraft != nil || !draft.name.isEmpty }

  func load() async {
    loading = true
    error = nil
    do {
      labels = try await transport.list()
      loaded = true
    } catch { fail(error, "Could not load labels.") }
    loading = false
  }
  func beginCreate() {
    draft = LabelDraft()
    error = nil
  }
  func create() async -> Bool {
    var submitted = draft
    submitted.name = submitted.name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !submitted.name.isEmpty else {
      error = "Enter a name."
      return false
    }
    return await write {
      try await self.transport.create(submitted)
    } success: { label in
      labels.append(label)
      draft = LabelDraft()
      invalidateReports()
    }
  }
  func beginEdit(_ label: KBLabel) {
    editingID = label.id
    editingDraft = LabelDraft(label)
    error = nil
  }
  func cancelEdit() {
    editingID = nil
    editingDraft = nil
    error = nil
  }
  func saveEdit() async -> Bool {
    guard let id = editingID, var submitted = editingDraft else { return false }
    submitted.name = submitted.name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !submitted.name.isEmpty else {
      error = "Enter a name."
      return false
    }
    return await write {
      try await self.transport.update(id: id, draft: submitted)
    } success: { label in
      labels = labels.map { $0.id == label.id ? label : $0 }
      cancelEdit()
      invalidateReports()
    }
  }
  func requestRemove(_ label: KBLabel) { deleteCandidate = label }
  func cancelRemove() {
    deleteCandidate = nil
    deleteAssignmentsCandidate = nil
  }
  func confirmRemove() async {
    guard let label = deleteCandidate else { return }
    deleteCandidate = nil
    do {
      try await transport.remove(id: label.id, removeAssignments: false)
      labels.removeAll { $0.id == label.id }
      invalidateReports()
    } catch {
      if case APIError.http(let status, _) = error, status == 409 {
        deleteAssignmentsCandidate = label
      } else {
        fail(error, "Could not remove this label.")
      }
    }
  }
  func confirmRemoveAssignments() async {
    guard let label = deleteAssignmentsCandidate else { return }
    deleteAssignmentsCandidate = nil
    do {
      try await transport.remove(id: label.id, removeAssignments: true)
      labels.removeAll { $0.id == label.id }
      invalidateReports()
    } catch { fail(error, "Could not remove this label.") }
  }
  private func write(_ request: () async throws -> KBLabel, success: (KBLabel) -> Void) async
    -> Bool
  {
    guard !busy else { return false }
    busy = true
    error = nil
    do {
      let label = try await request()
      success(label)
      busy = false
      return true
    } catch {
      busy = false
      fail(error, "Could not save this label. Remove assignments before removing a scope.")
      return false
    }
  }
  private func fail(_ failure: Error, _ message: String) {
    if failure is CancellationError { return }
    if case APIError.unauthorized = failure {
      unauthorized()
      return
    }
    if case APIError.offline = failure {
      error = "No network connection. Reconnect and try again."
      return
    }
    error = message
  }
}
