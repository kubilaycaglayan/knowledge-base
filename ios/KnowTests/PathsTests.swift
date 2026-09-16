import XCTest

@testable import Know

private actor PathsStub: PathsTransport {
  var values: [Path] = [
    Path(
      id: UUID(), name: "Algorithms", description: "Study", status: "ACTIVE", color: "#3B82F6",
      activityLabel: "today")
  ]
  var fail = false
  var failure: APIError?
  var removed: UUID?
  var restored: UUID?
  var merged: (UUID, UUID)?

  func paths() async throws -> [Path] {
    try checkFailure()
    if fail { throw APIError.offline }
    return values
  }
  func summary(id: UUID) async throws -> PathSummary {
    try checkFailure()
    return PathSummary(path: values[0], trackedSeconds: 120, recentActivity: [])
  }
  func create(name: String, description: String?, color: String) async throws -> Path {
    try checkFailure()
    let value = Path(
      id: UUID(), name: name, description: description, status: "ACTIVE", color: color,
      activityLabel: "passive")
    values.insert(value, at: 0)
    return value
  }
  func update(id: UUID, name: String, description: String?, color: String) async throws -> Path {
    try checkFailure()
    let value = Path(id: id, name: name, description: description, status: "ACTIVE", color: color)
    values = values.map { $0.id == id ? value : $0 }
    return value
  }
  func remove(id: UUID) async throws {
    try checkFailure()
    removed = id
    values.removeAll { $0.id == id }
  }
  func restore(id: UUID) async throws {
    try checkFailure()
    restored = id
  }
  func merge(source: UUID, target: UUID) async throws {
    try checkFailure()
    merged = (source, target)
  }
  func session(id: UUID) async throws -> TrackedSession { fatalError("not used") }

  private func checkFailure() throws { if let failure { throw failure } }
}

@MainActor final class PathsTests: XCTestCase {
  func testLoadCreateAndUpdatePreservePathFields() async {
    let stub = PathsStub()
    let model = PathsModel(transport: stub)
    await model.load()
    XCTAssertEqual(model.paths.first?.activityLabel, "today")
    let created = await model.create(name: " New path ", description: " Notes ", color: "#EF4444")
    XCTAssertTrue(created)
    XCTAssertEqual(model.paths.first?.name, "New path")
    let updated = await model.update(
      model.paths[0], name: " Renamed ", description: " Updated ", color: "#06B6D4")
    XCTAssertTrue(updated)
    XCTAssertEqual(model.paths.first?.color, "#06B6D4")
  }

  func testRemoveOffersUndoAndMergeUsesServerTransport() async {
    let stub = PathsStub()
    let model = PathsModel(transport: stub)
    await model.load()
    let source = model.paths[0]
    let removed = await model.remove(source)
    XCTAssertTrue(removed)
    XCTAssertEqual(model.pendingRemoval?.id, source.id)
    let restored = await model.undoRemoval()
    XCTAssertTrue(restored)
    let restoredID = await stub.restored
    XCTAssertEqual(restoredID, source.id)
    let target = Path(id: UUID(), name: "Target", description: nil, status: "ACTIVE")
    let mergedResult = await model.merge(source: source, into: target)
    XCTAssertTrue(mergedResult)
    let merged = await stub.merged
    XCTAssertEqual(merged?.0, source.id)
    XCTAssertEqual(merged?.1, target.id)
  }

  func testBlankNameAndOfflineLoadAreRecoverable() async {
    let stub = PathsStub()
    let model = PathsModel(transport: stub)
    let created = await model.create(name: "  ", description: "", color: "#3B82F6")
    XCTAssertFalse(created)
    XCTAssertEqual(model.error, "Path name is required.")
    await stub.setFail()
    await model.load(force: true)
    XCTAssertEqual(model.error, "No network connection. Reconnect and try again.")
  }

  func testHistoryFormattingUsesLocalGroupsAndFiltersTimerBookkeeping() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 3 * 3600)!
    let now = SessionFormatting.date("2026-09-13T12:00:00Z")!
    XCTAssertEqual(
      PathHistoryFormatting.group("2026-09-13T10:00:00Z", now: now, calendar: calendar), "Today")
    XCTAssertEqual(
      PathHistoryFormatting.group("2026-09-05T10:00:00Z", now: now, calendar: calendar), "Last week"
    )

    let started = Activity(
      id: UUID(), type: "TIMER_STARTED", title: "Started", detail: "Focus",
      occurredAt: "2026-09-13T10:00:00Z", timeEntryId: nil)
    let stopped = Activity(
      id: UUID(), type: "TIMER_STOPPED", title: "Stopped", detail: "Focus",
      occurredAt: "2026-09-13T11:00:00Z", timeEntryId: nil)
    let session = Activity(
      id: UUID(), type: "TIME_TRACKED", title: "Tracked 3600 seconds", detail: "Focus",
      occurredAt: "2026-09-13T11:00:00Z", timeEntryId: UUID())
    XCTAssertEqual(
      PathHistoryFormatting.visible([started, stopped, session]).map(\.id), [session.id])
  }

  func testUnauthorizedExpiresSessionAndServerFailurePreservesRetryState() async {
    let stub = PathsStub()
    var unauthorizedCalls = 0
    var invalidations = 0
    let model = PathsModel(
      transport: stub, unauthorized: { unauthorizedCalls += 1 },
      invalidateReports: { invalidations += 1 })

    let created = await model.create(name: "New", description: "", color: "#3B82F6")
    XCTAssertTrue(created)
    XCTAssertEqual(invalidations, 1)

    await stub.setFailure(.http(status: 503, message: "Unavailable"))
    let updated = await model.update(
      model.paths[0], name: "Retry", description: "", color: "#3B82F6")
    XCTAssertFalse(updated)
    XCTAssertEqual(model.error, "Could not update path.")
    XCTAssertEqual(unauthorizedCalls, 0)

    await stub.setFailure(.unauthorized)
    let removed = await model.remove(model.paths[0])
    XCTAssertFalse(removed)
    XCTAssertEqual(unauthorizedCalls, 1)
    XCTAssertNil(model.error)
  }
}

extension PathsStub {
  fileprivate func setFail() { fail = true }
  fileprivate func setFailure(_ value: APIError) { failure = value }
}
