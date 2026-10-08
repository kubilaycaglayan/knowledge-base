import Foundation

struct NotePage: Codable, Equatable {
  let items: [Note]
  let page: Int
  let size: Int
  let totalItems: Int
  let totalPages: Int
}

struct NoteDraft: Equatable {
  var title = ""
  var body = ""
  var tags: [String] = []

  init() {}
  init(_ note: Note) {
    title = note.title
    body = NoteDocument.plainText(content: note.content, fallback: note.contentText)
    tags = note.tags
  }
}

enum NoteDocument {
  static let empty = #"{"type":"doc","content":[{"type":"paragraph"}]}"#

  static func plainText(content: String, fallback: String? = nil) -> String {
    guard let data = content.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data),
      let document = object as? [String: Any], document["type"] as? String == "doc"
    else { return fallback ?? content }
    // One line per paragraph, heading, or code-block line, split at hard breaks,
    // matching the line rules of the web editor and the server's line times.
    var lines: [String] = []
    func collect(_ value: Any) {
      guard let node = value as? [String: Any] else { return }
      let children = node["content"] as? [Any] ?? []
      switch node["type"] as? String {
      case "paragraph", "heading", "codeBlock":
        let text = children.map { child -> String in
          guard let child = child as? [String: Any] else { return "" }
          if child["type"] as? String == "hardBreak" { return "\n" }
          return child["text"] as? String ?? ""
        }.joined()
        lines.append(contentsOf: text.components(separatedBy: "\n"))
      default:
        children.forEach(collect)
      }
    }
    collect(document)
    return lines.joined(separator: "\n")
  }

  static func json(body: String) -> String {
    let paragraphs = body.components(separatedBy: .newlines).map { line -> [String: Any] in
      var paragraph: [String: Any] = ["type": "paragraph"]
      if !line.isEmpty { paragraph["content"] = [["type": "text", "text": line]] }
      return paragraph
    }
    let document: [String: Any] = ["type": "doc", "content": paragraphs]
    guard let data = try? JSONSerialization.data(withJSONObject: document, options: [.sortedKeys]),
      let value = String(data: data, encoding: .utf8)
    else { return empty }
    return value
  }
}

/// Per-line edit times for the note editor's Line history list. The server stamps
/// each body line on save and returns `lineEdits`, one per line of the saved body;
/// the line rules match `frontend/src/lib/line-history.ts` and the server's
/// `LineAttribution`. Lines typed since the last save have no time yet.
enum NoteLineHistory {
  struct Row: Equatable {
    let number: Int
    let text: String
    let edited: Date?
  }

  /// The saved body's lines, with task checkboxes as "[x] " or "[ ] ".
  static func savedLines(content: String) -> [String] {
    guard let data = content.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data)
    else { return content.components(separatedBy: "\n") }
    guard let document = object as? [String: Any] else { return content.components(separatedBy: "\n") }
    guard document["type"] as? String == "doc" else { return [] }
    var lines: [String] = []
    func collect(_ value: Any, prefix: String) {
      guard let node = value as? [String: Any] else { return }
      let type = node["type"] as? String
      let children = node["content"] as? [Any] ?? []
      if type == "paragraph" || type == "heading" || type == "codeBlock" {
        let text = children.map { child -> String in
          guard let child = child as? [String: Any] else { return "" }
          if child["type"] as? String == "hardBreak" { return "\n" }
          return child["type"] as? String == "text" ? child["text"] as? String ?? "" : ""
        }.joined()
        lines.append(contentsOf: (prefix + text).components(separatedBy: "\n"))
        return
      }
      let checked = (node["attrs"] as? [String: Any])?["checked"] as? Bool ?? false
      let childPrefix = type == "taskItem" ? (checked ? "[x] " : "[ ] ") : ""
      children.forEach { collect($0, prefix: childPrefix) }
    }
    collect(document, prefix: "")
    return lines
  }

  /// Whether two lines are the same line: a line also matches itself without its task
  /// checkbox, which plain-text editing drops, but not with the other checkbox.
  static func same(_ a: String, _ b: String) -> Bool {
    if a == b { return true }
    func task(_ line: String) -> Bool { line.hasPrefix("[x] ") || line.hasPrefix("[ ] ") }
    let taskA = task(a)
    let taskB = task(b)
    return taskA != taskB && (taskA ? String(a.dropFirst(4)) : a) == (taskB ? String(b.dropFirst(4)) : b)
  }

  static func date(_ value: String) -> Date? {
    let precise = ISO8601DateFormatter()
    precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = precise.date(from: value) { return date }
    return ISO8601DateFormatter().date(from: value)
  }

  /// One row per line of the editor's body, with the edit time of the saved line it
  /// matches, or nil for lines not saved yet.
  static func rows(body: String, content: String, lineEdits: [String]) -> [Row] {
    let saved = savedLines(content: content)
    let current = body.components(separatedBy: "\n")
    var times = [Date?](repeating: nil, count: current.count)
    if saved.count == lineEdits.count {
      let lcs = alignment(saved, current)
      for (savedIndex, currentIndex) in lcs { times[currentIndex] = date(lineEdits[savedIndex]) }
    }
    return current.enumerated().map { Row(number: $0.offset + 1, text: $0.element, edited: times[$0.offset]) }
  }

  // Longest common subsequence of the two line lists, as matched index pairs.
  private static func alignment(_ a: [String], _ b: [String]) -> [(Int, Int)] {
    let n = a.count
    let m = b.count
    if n == 0 || m == 0 || n * m > 2_000_000 { return [] }
    var lengths = [[Int]](repeating: [Int](repeating: 0, count: m + 1), count: n + 1)
    for i in stride(from: n - 1, through: 0, by: -1) {
      for j in stride(from: m - 1, through: 0, by: -1) {
        lengths[i][j] = same(a[i], b[j]) ? lengths[i + 1][j + 1] + 1 : max(lengths[i + 1][j], lengths[i][j + 1])
      }
    }
    var pairs: [(Int, Int)] = []
    var i = 0
    var j = 0
    while i < n && j < m {
      if same(a[i], b[j]) {
        pairs.append((i, j))
        i += 1
        j += 1
      } else if lengths[i + 1][j] >= lengths[i][j + 1] {
        i += 1
      } else {
        j += 1
      }
    }
    return pairs
  }
}

protocol NotesTransport {
  func page(page: Int, size: Int, query: String, archived: Bool) async throws -> NotePage
  func labels() async throws -> [NoteLabel]
  func fetch(id: UUID) async throws -> Note
  func create(_ draft: NoteDraft) async throws -> Note
  func update(id: UUID, draft: NoteDraft, version: Int) async throws -> Note
  func archive(id: UUID) async throws
  func restore(id: UUID) async throws
  func pin(id: UUID, pinned: Bool) async throws -> Note
  func order(ids: [UUID]) async throws
}

struct NotesAPI: NotesTransport {
  let client: APIClient
  let token: String

  func page(page: Int, size: Int, query: String, archived: Bool) async throws -> NotePage {
    var path = "/notes?page=\(page)&size=\(size)&archived=\(archived)"
    if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      path += "&q=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query)"
    }
    return try await client.request(path, token: token)
  }
  func labels() async throws -> [NoteLabel] {
    try await client.request("/notes/labels", token: token)
  }
  func fetch(id: UUID) async throws -> Note {
    try await client.request("/notes/\(id)", token: token)
  }
  func create(_ draft: NoteDraft) async throws -> Note {
    try await client.request("/notes", method: "POST", body: body(draft), token: token)
  }
  func update(id: UUID, draft: NoteDraft, version: Int) async throws -> Note {
    try await client.request(
      "/notes/\(id)", method: "PUT", body: body(draft, version: version), token: token)
  }
  func archive(id: UUID) async throws {
    try await client.empty("/notes/\(id)", method: "DELETE", token: token)
  }
  func restore(id: UUID) async throws {
    try await client.empty("/notes/\(id)/restore", method: "POST", token: token)
  }
  func pin(id: UUID, pinned: Bool) async throws -> Note {
    let body = try JSONSerialization.data(withJSONObject: ["pinned": pinned])
    return try await client.request("/notes/\(id)/pin", method: "POST", body: body, token: token)
  }
  func order(ids: [UUID]) async throws {
    let body = try JSONSerialization.data(withJSONObject: ["noteIds": ids.map(\.uuidString)])
    try await client.empty("/notes/order", method: "PUT", body: body, token: token)
  }

  private func body(_ draft: NoteDraft, version: Int? = nil) throws -> Data {
    var fields: [String: Any] = [
      "title": draft.title.trimmingCharacters(in: .whitespacesAndNewlines),
      "content": NoteDocument.json(body: draft.body),
      "contentText": draft.body,
      "tags": draft.tags,
    ]
    if let version { fields["version"] = version }
    return try JSONSerialization.data(withJSONObject: fields)
  }
}

struct NoteLabel: Codable, Identifiable, Equatable {
  let id: UUID
  let name: String
}
