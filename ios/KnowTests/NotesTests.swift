import XCTest

@testable import Know

@MainActor
final class NotesTests: XCTestCase {
  func testDocumentRoundTripsRichTextToPlainTextAndJSON() {
    let json = NoteDocument.json(body: "First line\nSecond line")
    XCTAssertEqual(NoteDocument.plainText(content: json), "First line\nSecond line")
    XCTAssertTrue(json.contains("\"type\":\"doc\""))
  }

  // Lines match the web editor and the server's line times, so an iOS save of an
  // untouched rich note keeps every line (and its edit time).
  func testPlainTextKeepsEachRichLineSeparate() {
    let rich = #"""
      {"type":"doc","content":[
        {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Plan"}]},
        {"type":"paragraph","content":[{"type":"text","text":"Alpha"}]},
        {"type":"paragraph"},
        {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Item"}]}]}]},
        {"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"Done"}]}]}]},
        {"type":"paragraph","content":[{"type":"text","text":"First"},{"type":"hardBreak"},{"type":"text","text":"Second"}]},
        {"type":"codeBlock","content":[{"type":"text","text":"a = 1\nb = 2"}]}
      ]}
      """#
    XCTAssertEqual(
      NoteDocument.plainText(content: rich), "Plan\nAlpha\n\nItem\nDone\nFirst\nSecond\na = 1\nb = 2")
  }

  func testPlainTextRoundTripsBlankLinesAndFallsBackForNonDocuments() {
    let body = "One\n\nThree\n"
    XCTAssertEqual(NoteDocument.plainText(content: NoteDocument.json(body: body)), body)
    XCTAssertEqual(NoteDocument.plainText(content: NoteDocument.empty), "")
    XCTAssertEqual(NoteDocument.plainText(content: "legacy text", fallback: "fallback"), "fallback")
    XCTAssertEqual(NoteDocument.plainText(content: "legacy text"), "legacy text")
  }

  func testPaginationIsCachedByQueryAndPageSettings() async {
    let stub = NotesStub()
    let model = NotesModel(transport: stub)
    await model.load()
    await model.load()
    XCTAssertEqual(stub.pageCalls, 1)
    model.query = "other"
    await model.load()
    XCTAssertEqual(stub.pageCalls, 2)
  }

  func testCreateAndArchiveRefreshTheCurrentPage() async {
    let stub = NotesStub()
    let model = NotesModel(transport: stub)
    await model.load()
    let created = await model.create()
    XCTAssertNotNil(created)
    XCTAssertEqual(stub.createCalls, 1)
    let archived = await model.archive(model.notes[0])
    XCTAssertTrue(archived)
    XCTAssertEqual(stub.archiveCalls, 1)
    XCTAssertEqual(stub.pageCalls, 2)
  }

  func testConflictFetchesLatestVersionAndReplaysDraft() async {
    let stub = NotesStub()
    let model = NotesModel(transport: stub)
    await model.load()
    await model.open(model.notes[0])
    var draft = NoteDraft(model.selected!)
    draft.title = "Local title"
    let saved = await model.save(draft)
    XCTAssertTrue(saved)
    XCTAssertEqual(stub.updateCalls, 2)
    XCTAssertEqual(model.selected?.title, "Local title")
    XCTAssertEqual(model.selected?.version, 2)
  }

  func testPinAndReorderUseTheWebNoteContracts() async {
    let stub = NotesStub()
    let model = NotesModel(transport: stub)
    await model.load()

    let pinned = await model.pin(model.notes[0])
    XCTAssertTrue(pinned)
    XCTAssertEqual(stub.pinCalls, 1)
    XCTAssertTrue(model.notes[0].pinned)

    let reordered = await model.reorder(from: model.notes[1], before: model.notes[0])
    XCTAssertTrue(reordered)
    XCTAssertEqual(stub.orderCalls, 1)
    XCTAssertEqual(model.notes[0].id, stub.otherID)
  }
}

private final class NotesStub: NotesTransport {
  var pageCalls = 0
  var createCalls = 0
  var archiveCalls = 0
  var updateCalls = 0
  var pinCalls = 0
  var orderCalls = 0
  var pinnedState = false
  var conflict = true
  let id = UUID(uuidString: "00000000-0000-4000-8000-000000000030")!
  let otherID = UUID(uuidString: "00000000-0000-4000-8000-000000000031")!

  var note: Note {
    var value = Note(
      id: id, pathId: nil, activityId: nil, timeEntryId: nil, title: "Original",
      content: NoteDocument.json(body: "Body"), contentText: "Body",
      createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", deletedAt: nil,
      version: 1, tags: [])
    value.pinned = pinnedState
    return value
  }
  var other: Note {
    Note(
      id: otherID, pathId: nil, activityId: nil, timeEntryId: nil, title: "Other",
      content: NoteDocument.json(body: "Other body"), contentText: "Other body",
      createdAt: note.createdAt, updatedAt: note.updatedAt, deletedAt: nil, version: 1, tags: [])
  }
  func page(page: Int, size: Int, query: String, archived: Bool) async throws -> NotePage {
    pageCalls += 1
    return NotePage(items: [note, other], page: page, size: size, totalItems: 2, totalPages: 1)
  }
  func labels() async throws -> [NoteLabel] { [] }
  func fetch(id: UUID) async throws -> Note {
    Note(
      id: self.id, pathId: nil, activityId: nil, timeEntryId: nil, title: "Remote",
      content: NoteDocument.json(body: "Body"), contentText: "Body", createdAt: note.createdAt,
      updatedAt: note.updatedAt, deletedAt: nil, version: 1, tags: [])
  }
  func create(_ draft: NoteDraft) async throws -> Note {
    createCalls += 1
    return note
  }
  func update(id: UUID, draft: NoteDraft, version: Int) async throws -> Note {
    updateCalls += 1
    if conflict {
      conflict = false
      throw APIError.http(status: 409, message: nil)
    }
    return Note(
      id: id, pathId: nil, activityId: nil, timeEntryId: nil, title: draft.title,
      content: NoteDocument.json(body: draft.body), contentText: draft.body,
      createdAt: note.createdAt, updatedAt: note.updatedAt, deletedAt: nil, version: version + 1,
      tags: draft.tags)
  }
  func archive(id: UUID) async throws { archiveCalls += 1 }
  func restore(id: UUID) async throws {}
  func pin(id: UUID, pinned: Bool) async throws -> Note {
    pinCalls += 1
    pinnedState = pinned
    var updated = id == otherID ? other : note
    updated.pinned = pinned
    return updated
  }
  func order(ids: [UUID]) async throws { orderCalls += 1 }
}
