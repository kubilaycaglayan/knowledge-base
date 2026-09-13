import XCTest
@testable import Know

private actor LogsStub: LogsTransport {
    let id = UUID(uuidString: "00000000-0000-4000-8000-000000000201")!
    let labelID = UUID(uuidString: "00000000-0000-4000-8000-000000000202")!
    var values: [Log]
    var updateCount = 0
    var conflict = false
    var updateFailure: APIError?
    var labelsSaved: [UUID] = []
    init() {
        values = [Log(id: id, body: "Original", occurredAt: "2026-09-11T11:30:00Z", labelIds: [], createdAt: "2026-09-11T11:30:00Z", updatedAt: "2026-09-11T11:30:00Z", version: 2)]
    }
    func logs() async throws -> [Log] { values }
    func labels() async throws -> [LogLabel] { [LogLabel(id: labelID, name: "Important", color: "#2878D5", scopes: ["LOG"])] }
    func create(_ draft: LogDraft) async throws -> Log { let log = Log(id: UUID(), body: draft.body.trimmingCharacters(in: .whitespacesAndNewlines), occurredAt: LogFormatting.iso(draft.occurredAt), labelIds: [], createdAt: LogFormatting.iso(Date()), updatedAt: LogFormatting.iso(Date()), version: 0); values.append(log); return log }
    func fetch(id: UUID) async throws -> Log { values.first { $0.id == id }! }
    func update(id: UUID, draft: LogDraft, version: Int) async throws -> Log {
        updateCount += 1
        if let updateFailure { throw updateFailure }
        if conflict && updateCount == 1 { throw APIError.http(status: 409, message: "Log changed in another window") }
        let old = try await fetch(id: id)
        let result = Log(id: id, body: draft.body, occurredAt: LogFormatting.iso(draft.occurredAt), labelIds: old.labelIds, createdAt: old.createdAt, updatedAt: old.updatedAt, version: version + 1)
        values[values.firstIndex { $0.id == id }!] = result
        return result
    }
    func updateLabels(id: UUID, ids: [UUID]) async throws -> Log { labelsSaved = ids; let old = try await fetch(id: id); return Log(id: id, body: old.body, occurredAt: old.occurredAt, labelIds: ids, createdAt: old.createdAt, updatedAt: old.updatedAt, version: old.version + 1) }
    func remove(id: UUID) async throws { values.removeAll { $0.id == id } }
    func updateCalls() -> Int { updateCount }
    func savedLabelCount() -> Int { labelsSaved.count }
}

@MainActor final class LogsTests: XCTestCase {
    func testTimestampParsingAndSorting() async {
        XCTAssertNotNil(LogFormatting.date("2026-09-11T11:30:00.123Z"))
        XCTAssertNotNil(LogFormatting.date("2026-09-11T11:30:00Z"))
        let stub = LogsStub(); let model = LogsModel(transport: stub); await model.load()
        XCTAssertEqual(model.logs.first?.body, "Original")
    }

    func testGroupsRespectLocalMondayAndHourBoundaries() {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 3 * 3600)!
        let now = LogFormatting.date("2026-09-14T12:30:00+03:00")!
        XCTAssertEqual(LogFormatting.group("2026-09-14T07:00:00Z", now: now, calendar: calendar), "Today")
        XCTAssertEqual(LogFormatting.group("2026-09-13T10:00:00Z", now: now, calendar: calendar), "Yesterday")
        XCTAssertEqual(LogFormatting.group("2026-09-08T10:00:00Z", now: now, calendar: calendar), "Last week")
        XCTAssertTrue(LogFormatting.sameHour("2026-09-11T11:10:00Z", "2026-09-11T11:50:00Z", calendar: calendar))
        XCTAssertFalse(LogFormatting.sameHour("2026-09-11T11:10:00Z", "2026-09-11T12:00:00Z", calendar: calendar))
    }

    func testCreateTrimsAndKeepsChangedDraftDuringRequest() async {
        let stub = LogsStub(); let model = LogsModel(transport: stub); model.draft.body = "  Thought  "
        await model.create()
        XCTAssertEqual(model.logs.count, 1)
        XCTAssertEqual(model.logs.first?.body, "Thought")
        XCTAssertTrue(model.savedAnnouncement)
    }

    func testConflictFetchesLatestVersionAndRetriesSnapshot() async {
        let stub = LogsStub(); await stub.setConflict(true)
        let model = LogsModel(transport: stub); await model.load(); model.beginEdit(model.logs[0]); model.editDraft.body = "Local draft"
        await model.saveEdit()
        let updateCalls = await stub.updateCalls()
        XCTAssertEqual(updateCalls, 2)
        XCTAssertNil(model.editing)
        XCTAssertEqual(model.logs.first?.body, "Local draft")
    }

    func testFailedEditRetainsDraftForRetry() async {
        let stub = LogsStub(); let model = LogsModel(transport: stub); await model.load()
        model.beginEdit(model.logs[0]); model.editDraft.body = "Keep this text"
        await stub.setUpdateFailure(.http(status: 503, message: "Unavailable"))
        await model.saveEdit()
        XCTAssertEqual(model.editing?.id, stub.id)
        XCTAssertEqual(model.editDraft.body, "Keep this text")
        XCTAssertEqual(model.error, "Unable to save this log. Your text is still here; try again.")
    }

    func testLabelReplacementAndDelete() async {
        let stub = LogsStub(); let model = LogsModel(transport: stub); await model.load()
        await model.toggleLabel(await stub.labelID, for: model.logs[0])
        let savedLabelCount = await stub.savedLabelCount()
        XCTAssertEqual(savedLabelCount, 1)
        await model.remove(model.logs[0])
        XCTAssertTrue(model.logs.isEmpty)
    }
}

private extension LogsStub {
    func setConflict(_ value: Bool) { conflict = value }
    func setUpdateFailure(_ value: APIError) { updateFailure = value }
}
