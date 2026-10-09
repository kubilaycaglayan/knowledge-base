import Foundation

actor NotesFixture: NotesTransport {
  let arguments: [String]
  private var notes: [UUID: Note]
  private var nextID = 0x23
  private var failUpdateContaining: String?

  private static let savedLine = "Keep the API contract close to the client."
  private static let fixtureDate = "2026-09-14T09:30:00.123456Z"

  init(arguments: [String]) {
    self.arguments = arguments
    failUpdateContaining = arguments.contains("-notes-save-error") ? "R" : nil
    let seeded: [Note] = arguments.contains("-notes-empty")
      ? []
      : [Self.designNote(id: UUID(uuidString: "00000000-0000-4000-8000-000000000020")!)]
    let archived = arguments.contains("-notes-empty") ? [] : [Self.archivedNote]
    notes = Dictionary(uniqueKeysWithValues: (seeded + archived).map { ($0.id, $0) })
  }

  private static func designNote(id: UUID) -> Note {
    Note(
      id: id, pathId: nil, activityId: nil, timeEntryId: nil, title: "Design notes",
      content: NoteDocument.json(body: savedLine), contentText: savedLine,
      createdAt: "2026-09-10T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z", deletedAt: nil,
      version: 1, tags: ["Work"], lineEdits: ["2026-09-13T10:00:00Z"])
  }

  private static var archivedNote: Note {
    Note(
      id: UUID(uuidString: "00000000-0000-4000-8000-000000000021")!, pathId: nil,
      activityId: nil, timeEntryId: nil, title: "Archived idea",
      content: NoteDocument.json(body: "An old thought."), contentText: "An old thought.",
      createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-02T10:00:00Z",
      deletedAt: "2026-09-03T10:00:00Z", version: 1, tags: [])
  }

  func page(page: Int, size: Int, query: String, archived: Bool) async throws -> NotePage {
    if arguments.contains("-notes-offline") { throw APIError.offline }
    let matching = notes.values
      .filter { ($0.deletedAt != nil) == archived }
      .filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }
      .sorted { $0.createdAt > $1.createdAt }
    let start = min(max(page, 0) * size, matching.count)
    let end = min(start + size, matching.count)
    let totalPages = matching.isEmpty ? 0 : (matching.count + size - 1) / size
    return NotePage(
      items: Array(matching[start..<end]), page: page, size: size,
      totalItems: matching.count, totalPages: totalPages)
  }

  func labels() async throws -> [NoteLabel] {
    [
      NoteLabel(id: UUID(uuidString: "00000000-0000-4000-8000-000000000022")!, name: "Work"),
      NoteLabel(id: UUID(uuidString: "00000000-0000-4000-8000-000000000024")!, name: "Reading"),
    ]
  }

  func fetch(id: UUID) async throws -> Note {
    guard let note = notes[id] else { throw APIError.http(status: 404, message: "Note not found") }
    return note
  }

  func create(_ draft: NoteDraft) async throws -> Note {
    let number = nextID
    nextID += 1
    let id = UUID(uuidString: String(format: "00000000-0000-4000-8000-%012x", number))!
    let note = Note(
      id: id, pathId: nil, activityId: nil, timeEntryId: nil, title: draft.title,
      content: NoteDocument.json(body: draft.body), contentText: draft.body,
      createdAt: Self.fixtureDate, updatedAt: Self.fixtureDate, deletedAt: nil, version: 1,
      tags: draft.tags,
      lineEdits: draft.body.components(separatedBy: "\n").map { _ in Self.fixtureDate })
    notes[id] = note
    return note
  }

  func update(id: UUID, draft: NoteDraft, version: Int) async throws -> Note {
    if let marker = failUpdateContaining, draft.body.contains(marker) {
      failUpdateContaining = nil
      throw APIError.http(status: 500, message: "Temporary fixture failure")
    }
    guard let existing = notes[id] else {
      throw APIError.http(status: 404, message: "Note not found")
    }
    let note = Note(
      id: id, pathId: existing.pathId, activityId: existing.activityId,
      timeEntryId: existing.timeEntryId, title: draft.title,
      content: NoteDocument.json(body: draft.body), contentText: draft.body,
      createdAt: existing.createdAt, updatedAt: Self.fixtureDate,
      deletedAt: existing.deletedAt, version: version + 1, tags: draft.tags,
      lineEdits: draft.body.components(separatedBy: "\n").map {
        $0 == Self.savedLine ? "2026-09-13T10:00:00Z" : Self.fixtureDate
      })
    notes[id] = note
    return note
  }

  func archive(id: UUID) async throws {
    guard let note = notes[id] else {
      throw APIError.http(status: 404, message: "Note not found")
    }
    notes[id] = Note(
      id: note.id, pathId: note.pathId, activityId: note.activityId,
      timeEntryId: note.timeEntryId, title: note.title, content: note.content,
      contentText: note.contentText, createdAt: note.createdAt, updatedAt: Self.fixtureDate,
      deletedAt: Self.fixtureDate, version: note.version + 1, tags: note.tags,
      pinned: note.pinned, lineEdits: note.lineEdits)
  }

  func restore(id: UUID) async throws {
    guard let note = notes[id] else {
      throw APIError.http(status: 404, message: "Note not found")
    }
    notes[id] = Note(
      id: note.id, pathId: note.pathId, activityId: note.activityId,
      timeEntryId: note.timeEntryId, title: note.title, content: note.content,
      contentText: note.contentText, createdAt: note.createdAt, updatedAt: Self.fixtureDate,
      deletedAt: nil, version: note.version + 1, tags: note.tags,
      pinned: note.pinned, lineEdits: note.lineEdits)
  }

  func pin(id: UUID, pinned: Bool) async throws -> Note {
    guard let note = notes[id] else {
      throw APIError.http(status: 404, message: "Note not found")
    }
    var updated = note
    updated.pinned = pinned
    notes[id] = updated
    return updated
  }

  func order(ids: [UUID]) async throws {}
}
