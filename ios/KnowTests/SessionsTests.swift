import XCTest

@testable import Know

private actor SessionsStub: SessionsTransport {
  private var trackerSelection = TrackerSelection()
  func selection() async throws -> TrackerSelection { trackerSelection }
  func saveSelection(_ draft: SessionDraft) async throws -> TrackerSelection {
    trackerSelection = TrackerSelection(
      pathId: draft.pathId, labelIds: draft.labelIds, description: draft.description)
    return trackerSelection
  }
  var running: TrackedSession?
  var failWrites = false
  var stopCount = 0
  var saveCount = 0
  var pages: [Int] = []
  var heldCurrent: CheckedContinuation<TrackedSession?, Error>?
  var holdCurrent = false
  var lastDraft: SessionDraft?
  var lastPathName: String?
  var lastLabelName: String?
  let path = Path(id: UUID(), name: "Active", description: nil, status: "ACTIVE", color: "#2188FF")
  let archived = Path(id: UUID(), name: "Archived", description: nil, status: "ARCHIVED")
  let label = SessionLabel(id: UUID(), name: "Focus", color: nil, scopes: ["TIME_ENTRY"])
  let otherLabel = SessionLabel(id: UUID(), name: "Calendar", color: nil, scopes: ["CALENDAR"])
  func paths() async throws -> [Path] { [path, archived] }
  func labels() async throws -> [SessionLabel] { [label, otherLabel] }
  func history(page: Int) async throws -> SessionPage {
    pages.append(page)
    return SessionPage(
      sessions: page == 0 ? [sample()] : [], page: page, totalPages: 1, totalSessions: 1)
  }
  func current() async throws -> TrackedSession? {
    if holdCurrent { return try await withCheckedThrowingContinuation { heldCurrent = $0 } }
    return running
  }
  func setHeld(_ value: Bool) { holdCurrent = value }
  func releaseCurrent(_ value: TrackedSession?) {
    heldCurrent?.resume(returning: value)
    heldCurrent = nil
  }
  func isHeld() -> Bool { heldCurrent != nil }
  func setFailure(_ value: Bool) { failWrites = value }
  func start(_ draft: SessionDraft) async throws -> TrackedSession {
    if failWrites { throw APIError.offline }
    lastDraft = draft
    var result = sample()
    result.running = true
    result.endedAt = nil
    result.pathId = draft.pathId
    result.labelIds = draft.labelIds
    result.description = draft.description
    running = result
    return result
  }
  func updateTimer(id: UUID, draft: SessionDraft) async throws -> TrackedSession {
    try await start(draft)
  }
  func stop(id: UUID) async throws {
    if failWrites { throw APIError.offline }
    stopCount += 1
    if let running {
      trackerSelection = TrackerSelection(
        pathId: running.pathId, labelIds: running.labelIds ?? [], description: running.description)
    }
    running = nil
  }
  func save(id: UUID, draft: SessionDraft) async throws {
    if failWrites { throw APIError.offline }
    saveCount += 1
    lastDraft = draft
  }
  func remove(id: UUID) async throws { if failWrites { throw APIError.offline } }
  func createPath(name: String) async throws -> Path {
    lastPathName = name
    return path
  }
  func createLabel(name: String) async throws -> SessionLabel {
    lastLabelName = name
    return label
  }
  func sample() -> TrackedSession {
    TrackedSession(
      id: UUID(uuidString: "00000000-0000-4000-8000-000000000009")!, pathId: path.id,
      labelIds: [label.id], startedAt: "2026-09-12T10:00:00Z", endedAt: "2026-09-12T11:00:00Z",
      durationSeconds: 3600, description: "Original", source: "WEB", running: false)
  }
}

@MainActor final class SessionsTests: XCTestCase {
  func testLoadUsesScopedLabelsAndOnlyActiveRecentPaths() async {
    let stub = SessionsStub()
    let model = SessionsModel(transport: stub, defaults: nil)
    await model.load()
    let path = await stub.path
    let archived = await stub.archived
    model.remember(archived.id)
    model.remember(path.id)
    XCTAssertEqual(model.labels.map(\.name), ["Focus"])
    XCTAssertEqual(model.activePaths.map(\.name), ["Active"])
    XCTAssertEqual(model.recentPaths.map(\.name), ["Active"])
    XCTAssertEqual(model.history.sessions.count, 1)
    XCTAssertTrue(model.loaded)
  }

  func testIdlePollingPreservesPreparedTimer() async {
    let model = SessionsModel(transport: SessionsStub(), defaults: nil)
    model.draft.description = "My draft"
    model.draft.labelIds = [UUID(), UUID()]
    let original = model.draft
    await model.sync()
    XCTAssertEqual(model.draft, original)
  }

  func testStartStopUsesAllSelectionsAndServerSnapshot() async {
    let stub = SessionsStub()
    let model = SessionsModel(transport: stub, defaults: nil)
    let path = await stub.path
    let label = await stub.label
    model.draft.pathId = path.id
    model.draft.labelIds = [label.id]
    model.draft.description = "Reading"
    let selected = model.draft.labelIds
    await model.toggleTimer()
    XCTAssertEqual(model.timer?.labelIds, selected)
    XCTAssertEqual(model.timer?.description, "Reading")
    await model.toggleTimer()
    XCTAssertNil(model.timer)
    XCTAssertNil(model.draft.pathId)
    XCTAssertEqual(model.draft.labelIds, [])
    XCTAssertEqual(model.draft.description, "")
    let count = await stub.stopCount
    XCTAssertEqual(count, 1)
  }

  func testFailedStopKeepsTimerAndAllowsRetry() async {
    let stub = SessionsStub()
    let model = SessionsModel(transport: stub, defaults: nil)
    await model.toggleTimer()
    await stub.setFailure(true)
    await model.toggleTimer()
    XCTAssertNotNil(model.timer)
    XCTAssertNotNil(model.error)
    XCTAssertFalse(model.busy)
    await stub.setFailure(false)
    await model.toggleTimer()
    XCTAssertNil(model.timer)
    XCTAssertNil(model.error)
  }

  func testStalePollCannotResurrectStoppedTimer() async {
    let stub = SessionsStub()
    let model = SessionsModel(transport: stub, defaults: nil)
    await model.toggleTimer()
    let snapshot = model.timer
    await stub.setHeld(true)
    let sync = Task { await model.sync() }
    while !(await stub.isHeld()) { await Task.yield() }
    await model.toggleTimer()
    await stub.releaseCurrent(snapshot)
    await sync.value
    XCTAssertNil(model.timer)
  }

  func testSocketReadyInvalidatesInflightPollAndCompletedSnapshotsClearTimer() async throws {
    let stub = SessionsStub()
    let model = SessionsModel(transport: stub, defaults: nil)
    await stub.setHeld(true)
    let sync = Task { await model.sync() }
    while !(await stub.isHeld()) { await Task.yield() }
    model.receiveSnapshot(Data("{\"type\":\"READY\"}".utf8))
    var current = await stub.sample()
    current.running = true
    let data = try JSONSerialization.data(withJSONObject: [
      "type": "TIMER_STATE",
      "timer": JSONSerialization.jsonObject(with: JSONEncoder().encode(current)),
    ])
    model.receiveSnapshot(data)
    await stub.releaseCurrent(nil)
    await sync.value
    XCTAssertNotNil(model.timer)
    current.running = false
    model.apply(current)
    XCTAssertNil(model.timer)
    model.suspend()
  }

  func testSnapshotPreservesDescriptionBeingEdited() async {
    let stub = SessionsStub()
    let model = SessionsModel(transport: stub, defaults: nil)
    await model.toggleTimer()
    model.descriptionFocused = true
    model.draft.description = "Unsaved typing"
    model.apply(model.timer)
    XCTAssertEqual(model.draft.description, "Unsaved typing")
  }

  func testCreationTrimsAndAssignsWithoutDuplicateLabels() async {
    let stub = SessionsStub()
    let model = SessionsModel(transport: stub, defaults: nil)
    _ = await model.createPath(" New path \n")
    _ = await model.createLabel(" Focus \n")
    _ = await model.createLabel("Focus")
    let pathName = await stub.lastPathName
    let labelName = await stub.lastLabelName
    XCTAssertEqual(pathName, "New path")
    XCTAssertEqual(labelName, "Focus")
    XCTAssertEqual(model.draft.labelIds.count, 1)
    XCTAssertEqual(model.labels.count, 1)
    XCTAssertNotNil(model.draft.pathId)
  }

  func testInvalidHistoryEditDoesNotWriteAndFailureRetainsDraft() async {
    let stub = SessionsStub()
    let model = SessionsModel(transport: stub, defaults: nil)
    let session = await stub.sample()
    var draft = SessionDraft(session)
    draft.endedAt = draft.startedAt
    let saved = await model.save(session, draft: draft)
    XCTAssertFalse(saved)
    let count = await stub.saveCount
    XCTAssertEqual(count, 0)
    draft.endedAt = draft.startedAt.addingTimeInterval(60)
    await stub.setFailure(true)
    let failed = await model.save(session, draft: draft)
    XCTAssertFalse(failed)
    XCTAssertNotNil(model.error)
    XCTAssertFalse(model.busy)
  }

  func testEmptyLastPageFallsBackToExistingPage() async {
    let stub = SessionsStub()
    let model = SessionsModel(transport: stub, defaults: nil)
    await model.loadHistory(page: 4)
    XCTAssertEqual(model.history.page, 0)
    let pages = await stub.pages
    XCTAssertEqual(pages, [4, 0])
  }

  func testDurationsAndClockMatchWebBoundaries() {
    XCTAssertEqual(SessionFormatting.duration(0), "0 seconds")
    XCTAssertEqual(SessionFormatting.duration(1), "1 second")
    XCTAssertEqual(SessionFormatting.duration(59), "59 seconds")
    XCTAssertEqual(SessionFormatting.duration(60), "1 minute")
    XCTAssertEqual(SessionFormatting.duration(3599), "59 minutes")
    XCTAssertEqual(SessionFormatting.duration(3600), "1h")
    XCTAssertEqual(SessionFormatting.duration(3660), "1h 1 minute")
    XCTAssertEqual(SessionFormatting.duration(360060), "100h")
    XCTAssertEqual(
      SessionFormatting.clock(
        start: "2026-09-12T10:00:00.000Z", now: SessionFormatting.date("2026-09-12T11:02:03Z")!),
      "01:02:03")
    let sessions = [
      TrackedSession(
        id: UUID(), pathId: nil, labelIds: nil, startedAt: "2026-09-12T10:00:00Z", endedAt: nil,
        durationSeconds: 3600, description: nil, source: "WEB", running: false),
      TrackedSession(
        id: UUID(), pathId: nil, labelIds: nil, startedAt: "2026-09-12T11:00:00Z", endedAt: nil,
        durationSeconds: 1800, description: nil, source: "WEB", running: false),
    ]
    XCTAssertEqual(SessionFormatting.groupDuration(sessions), "01:30")
  }

  func testDateGroupsUseLocalDayAndMondayWeek() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 3 * 3600)!
    let now = SessionFormatting.date("2026-09-14T00:30:00+03:00")!
    XCTAssertEqual(
      SessionFormatting.group("2026-09-13T22:00:00Z", now: now, calendar: calendar), "Today")
    XCTAssertEqual(
      SessionFormatting.group("2026-09-13T10:00:00Z", now: now, calendar: calendar), "Yesterday")
    XCTAssertEqual(
      SessionFormatting.group("2026-09-08T10:00:00Z", now: now, calendar: calendar), "Last week")
    XCTAssertEqual(
      SessionFormatting.group("2026-08-20T10:00:00Z", now: now, calendar: calendar), "Last month")
  }
}
