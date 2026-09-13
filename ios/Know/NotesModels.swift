import Foundation

struct NotePage: Codable, Equatable {
    let items: [Note]
    let page: Int
    let size: Int
    let totalItems: Int
    let totalPages: Int
}

struct NoteDraft: Equatable {
    var title = "Untitled note"
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
        func collect(_ value: Any) -> String {
            guard let node = value as? [String: Any] else { return "" }
            let text = node["text"] as? String ?? ""
            let children = (node["content"] as? [Any] ?? []).map(collect).joined()
            return text + children + (node["type"] as? String == "paragraph" ? "\n" : "")
        }
        return collect(document).trimmingCharacters(in: .newlines)
            .replacingOccurrences(of: "\n\n", with: "\n")
    }

    static func json(body: String) -> String {
        let paragraphs = body.components(separatedBy: .newlines).map { line -> [String: Any] in
            var paragraph: [String: Any] = ["type": "paragraph"]
            if !line.isEmpty { paragraph["content"] = [["type": "text", "text": line]] }
            return paragraph
        }
        let document: [String: Any] = ["type": "doc", "content": paragraphs]
        guard let data = try? JSONSerialization.data(withJSONObject: document, options: [.sortedKeys]),
              let value = String(data: data, encoding: .utf8) else { return empty }
        return value
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
    func labels() async throws -> [NoteLabel] { try await client.request("/notes/labels", token: token) }
    func fetch(id: UUID) async throws -> Note { try await client.request("/notes/\(id)", token: token) }
    func create(_ draft: NoteDraft) async throws -> Note { try await client.request("/notes", method: "POST", body: body(draft), token: token) }
    func update(id: UUID, draft: NoteDraft, version: Int) async throws -> Note { try await client.request("/notes/\(id)", method: "PUT", body: body(draft, version: version), token: token) }
    func archive(id: UUID) async throws { try await client.empty("/notes/\(id)", method: "DELETE", token: token) }
    func restore(id: UUID) async throws { try await client.empty("/notes/\(id)/restore", method: "POST", token: token) }

    private func body(_ draft: NoteDraft, version: Int? = nil) throws -> Data {
        var fields: [String: Any] = [
            "title": draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Untitled note" : draft.title.trimmingCharacters(in: .whitespacesAndNewlines),
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
