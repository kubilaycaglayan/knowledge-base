import Foundation

// In-memory transport used only for explicitly launched UI tests and previews.
// All UI actions traverse the real model; no test launch can mutate account data.
actor SessionsFixture: SessionsTransport {
  private var trackerSelection = TrackerSelection()
  func selection() async throws -> TrackerSelection { trackerSelection }
  func saveSelection(_ draft: SessionDraft) async throws -> TrackerSelection {
    trackerSelection = TrackerSelection(
      pathId: draft.pathId, labelIds: draft.labelIds, description: draft.description)
    return trackerSelection
  }
  static let pathID = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
  static let labelID = UUID(uuidString: "00000000-0000-4000-8000-000000000002")!
  static let sessionID = UUID(uuidString: "00000000-0000-4000-8000-000000000003")!
  private var allPaths = [
    Path(
      id: pathID, name: "Distributed systems", description: nil, status: "ACTIVE", color: "#2188FF")
  ]
  private var allLabels = [
    SessionLabel(id: labelID, name: "Study day", color: "#2878D5", scopes: ["TIME_ENTRY"])
  ]
  private var entries: [TrackedSession]
  private var timer: TrackedSession?
  private var fails: Bool

  init(arguments: [String] = []) {
    fails = arguments.contains("-sessions-error")
    if arguments.contains("-sessions-empty-labels") { allLabels = [] }
    if arguments.contains("-sessions-many-labels") {
      allLabels += (0..<7).map { index in
        SessionLabel(
          id: UUID(uuidString: String(format: "00000000-0000-4000-8000-%012d", index + 10))!,
          name: index == 6
            ? String(repeating: "Long label ", count: 8) : "Session label \(index + 2)",
          color: nil,
          scopes: ["TIME_ENTRY"]
        )
      }
    }
    let now = Date()
    entries =
      arguments.contains("-sessions-empty")
      ? []
      : [
        TrackedSession(
          id: Self.sessionID, pathId: Self.pathID, labelIds: [Self.labelID],
          startedAt: SessionFormatting.iso(now.addingTimeInterval(-3600)),
          endedAt: SessionFormatting.iso(now), durationSeconds: 3600,
          description: "Replication and consistency models", source: "WEB", running: false)
      ]
  }
  func paths() async throws -> [Path] {
    if fails {
      fails = false
      throw APIError.offline
    }
    return allPaths
  }
  func labels() async throws -> [SessionLabel] { allLabels }
  func history(page: Int) async throws -> SessionPage {
    SessionPage(
      sessions: entries, page: 0, totalPages: entries.isEmpty ? 0 : 1, totalSessions: entries.count)
  }
  func current() async throws -> TrackedSession? { timer }
  func start(_ draft: SessionDraft) async throws -> TrackedSession {
    let session = TrackedSession(
      id: UUID(), pathId: draft.pathId, labelIds: draft.labelIds,
      startedAt: SessionFormatting.iso(Date()), description: draft.description, source: "IOS",
      running: true)
    timer = session
    return session
  }
  func updateTimer(id: UUID, draft: SessionDraft) async throws -> TrackedSession {
    let session = TrackedSession(
      id: id, pathId: draft.pathId, labelIds: draft.labelIds,
      startedAt: SessionFormatting.iso(draft.startedAt), description: draft.description,
      source: "IOS", running: true)
    timer = session
    return session
  }
  func stop(id: UUID) async throws {
    if var session = timer {
      trackerSelection = TrackerSelection(
        pathId: session.pathId, labelIds: session.labelIds ?? [], description: session.description)
      session.running = false
      session.endedAt = SessionFormatting.iso(Date())
      session.durationSeconds = Int64(
        Date().timeIntervalSince(SessionFormatting.date(session.startedAt)!))
      if session.durationSeconds! >= 2 { entries.insert(session, at: 0) }
    }
    timer = nil
  }
  func save(id: UUID, draft: SessionDraft) async throws {
    guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
    entries[index] = TrackedSession(
      id: id, pathId: draft.pathId, labelIds: draft.labelIds,
      startedAt: SessionFormatting.iso(draft.startedAt),
      endedAt: SessionFormatting.iso(draft.endedAt),
      durationSeconds: Int64(draft.endedAt.timeIntervalSince(draft.startedAt)),
      description: draft.description, source: draft.source, running: false)
  }
  func remove(id: UUID) async throws { entries.removeAll { $0.id == id } }
  func createPath(name: String) async throws -> Path {
    let path = Path(id: UUID(), name: name, description: nil, status: "ACTIVE", color: "#EF4444")
    allPaths.append(path)
    return path
  }
  func createLabel(name: String) async throws -> SessionLabel {
    let label = SessionLabel(id: UUID(), name: name, color: nil, scopes: ["TIME_ENTRY"])
    allLabels.append(label)
    return label
  }
}
