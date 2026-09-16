import Foundation

actor PathsFixture: PathsTransport {
  static let pathID = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
  static let otherID = UUID(uuidString: "00000000-0000-4000-8000-000000000003")!
  static let sessionID = UUID(uuidString: "00000000-0000-4000-8000-000000000004")!
  static let labelID = UUID(uuidString: "00000000-0000-4000-8000-000000000002")!
  private var values: [Path]
  private let empty: Bool
  private let offline: Bool

  init(arguments: [String] = ProcessInfo.processInfo.arguments) {
    empty = arguments.contains("-paths-empty")
    offline = arguments.contains("-paths-offline")
    values = [
      Path(
        id: Self.pathID, name: "Distributed systems",
        description: "Replication and consistency models", status: "ACTIVE", color: "#2188FF",
        activityLabel: "today"),
      Path(
        id: Self.otherID, name: "Writing", description: nil, status: "ACTIVE", color: "#8B5CF6",
        activityLabel: "passive"),
    ]
  }

  private func check() throws { if offline { throw APIError.offline } }
  func paths() async throws -> [Path] {
    try check()
    return empty ? [] : values
  }
  func summary(id: UUID) async throws -> PathSummary {
    try check()
    let path = values.first { $0.id == id }!
    let activity = Activity(
      id: Self.sessionID, type: "TIME_TRACKED", title: "Tracked 3600 seconds",
      detail: "Replication and consistency models",
      occurredAt: SessionFormatting.iso(Date().addingTimeInterval(-1800)),
      timeEntryId: Self.sessionID, labelIds: [Self.labelID, UUID()])
    return PathSummary(path: path, trackedSeconds: 3600, recentActivity: empty ? [] : [activity])
  }
  func create(name: String, description: String?, color: String) async throws -> Path {
    try check()
    let path = Path(
      id: UUID(), name: name, description: description, status: "ACTIVE", color: color,
      activityLabel: "passive")
    values.insert(path, at: 0)
    return path
  }
  func update(id: UUID, name: String, description: String?, color: String) async throws -> Path {
    try check()
    let old = values.first { $0.id == id }!
    let path = Path(
      id: id, name: name, description: description, status: old.status, color: color,
      activityLabel: old.activityLabel)
    values = values.map { $0.id == id ? path : $0 }
    return path
  }
  func remove(id: UUID) async throws {
    try check()
    values.removeAll { $0.id == id }
  }
  func restore(id: UUID) async throws { try check() }
  func merge(source: UUID, target: UUID) async throws {
    try check()
    values.removeAll { $0.id == source }
  }
  func session(id: UUID) async throws -> TrackedSession {
    try check()
    return TrackedSession(
      id: id, pathId: Self.pathID, labelIds: [],
      startedAt: SessionFormatting.iso(Date().addingTimeInterval(-3600)),
      endedAt: SessionFormatting.iso(Date()), durationSeconds: 3600,
      description: "Replication and consistency models", source: "IOS", running: false)
  }
}
