import Foundation

struct NotesFixture: NotesTransport {
  let arguments: [String]
  private let noteID = UUID(uuidString: "00000000-0000-4000-8000-000000000020")!
  private let archivedID = UUID(uuidString: "00000000-0000-4000-8000-000000000021")!
  private var value: Note {
    Note(
      id: noteID, pathId: nil, activityId: nil, timeEntryId: nil, title: "Design notes",
      content: NoteDocument.json(body: "Keep the API contract close to the client."),
      contentText: "Keep the API contract close to the client.", createdAt: "2026-09-10T10:00:00Z",
      updatedAt: "2026-09-13T10:00:00Z", deletedAt: nil, version: 1, tags: ["Work"])
  }
  func page(page: Int, size: Int, query: String, archived: Bool) async throws -> NotePage {
    if arguments.contains("-notes-offline") { throw APIError.offline }
    if arguments.contains("-notes-empty") {
      return NotePage(items: [], page: 0, size: size, totalItems: 0, totalPages: 0)
    }
    if archived {
      let archivedNote = Note(
        id: archivedID, pathId: nil, activityId: nil, timeEntryId: nil, title: "Archived idea",
        content: NoteDocument.json(body: "An old thought."), contentText: "An old thought.",
        createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-02T10:00:00Z",
        deletedAt: "2026-09-03T10:00:00Z", version: 1, tags: [])
      return NotePage(items: [archivedNote], page: 0, size: size, totalItems: 1, totalPages: 1)
    }
    return NotePage(
      items: query.isEmpty || value.title.localizedCaseInsensitiveContains(query) ? [value] : [],
      page: 0, size: size,
      totalItems: query.isEmpty ? 1 : (value.title.localizedCaseInsensitiveContains(query) ? 1 : 0),
      totalPages: query.isEmpty || value.title.localizedCaseInsensitiveContains(query) ? 1 : 0)
  }
  func labels() async throws -> [NoteLabel] {
    [
      NoteLabel(id: UUID(uuidString: "00000000-0000-4000-8000-000000000022")!, name: "Work"),
      NoteLabel(id: UUID(), name: "Reading"),
    ]
  }
  func fetch(id: UUID) async throws -> Note { value }
  func create(_ draft: NoteDraft) async throws -> Note { value }
  func update(id: UUID, draft: NoteDraft, version: Int) async throws -> Note {
    Note(
      id: id, pathId: nil, activityId: nil, timeEntryId: nil, title: draft.title,
      content: NoteDocument.json(body: draft.body), contentText: draft.body,
      createdAt: value.createdAt, updatedAt: "2026-09-13T10:00:00Z", deletedAt: nil,
      version: version + 1, tags: draft.tags)
  }
  func archive(id: UUID) async throws {}
  func restore(id: UUID) async throws {}
}
