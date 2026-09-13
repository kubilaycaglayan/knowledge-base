import Foundation

@MainActor final class NotesModel: ObservableObject {
    @Published private(set) var notes: [Note] = []
    @Published private(set) var selected: Note?
    @Published private(set) var labels: [NoteLabel] = []
    @Published var query = ""
    @Published var archived = false
    @Published var page = 0
    @Published var size = 20
    @Published private(set) var totalItems = 0
    @Published private(set) var totalPages = 0
    @Published private(set) var loading = false
    @Published private(set) var busy = false
    @Published var error: String?
    @Published var saveState: SaveState = .saved

    enum SaveState: Equatable { case saved, saving, failed }
    private let transport: NotesTransport
    private let unauthorized: () -> Void
    private var pages: [String: NotePage] = [:]
    private var queuedDraft: NoteDraft?

    init(transport: NotesTransport, unauthorized: @escaping () -> Void = {}) {
        self.transport = transport
        self.unauthorized = unauthorized
    }

    var hasUnsavedDraft: Bool { saveState != .saved }
    var canGoPrevious: Bool { page > 0 }
    var canGoNext: Bool { page + 1 < totalPages }
    var matchingLabels: [NoteLabel] { labels.filter { label in
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return needle.isEmpty || label.name.lowercased().contains(needle)
    }}

    func load(force: Bool = false) async {
        guard !loading else { return }
        loading = true; error = nil
        let key = cacheKey
        if !force, let cached = pages[key] { apply(cached); loading = false; return }
        do { let result = try await transport.page(page: page, size: size, query: query, archived: archived); pages[key] = result; apply(result) }
        catch { fail(error, "Unable to load notes. Please try again.") }
        loading = false
    }

    func loadLabels() async {
        do { labels = try await transport.labels() }
        catch { if case APIError.unauthorized = error { unauthorized() } }
    }

    func open(_ note: Note) async {
        error = nil
        do { selected = try await transport.fetch(id: note.id) }
        catch { fail(error, "Unable to open this note. Please try again.") }
    }

    func create() async -> Note? {
        guard !busy else { return nil }
        busy = true; error = nil
        defer { busy = false }
        do { let note = try await transport.create(NoteDraft()); pages.removeAll(); return note }
        catch { fail(error, "Unable to create a note. Please try again."); return nil }
    }

    func save(_ draft: NoteDraft) async -> Bool {
        guard selected != nil else { return false }
        if busy { queuedDraft = draft; saveState = .saving; return false }
        guard let original = selected else { return false }
        busy = true; saveState = .saving; error = nil
        do {
            let saved: Note
            do { saved = try await transport.update(id: original.id, draft: draft, version: original.version) }
            catch let APIError.http(status, _) where status == 409 {
                let latest = try await transport.fetch(id: original.id)
                saved = try await transport.update(id: original.id, draft: draft, version: latest.version)
            }
            selected = saved; pages.removeAll(); saveState = .saved
            busy = false
            if let next = queuedDraft { queuedDraft = nil; Task { await self.save(next) } }
            return true
        } catch {
            busy = false; saveState = .failed; fail(error, "Unable to save this note. Your draft is still here; try again.")
            if let next = queuedDraft { queuedDraft = nil; Task { await self.save(next) } }
            return false
        }
    }

    func archive(_ note: Note) async -> Bool { await mutate { try await self.transport.archive(id: note.id) } }
    func restore(_ note: Note) async -> Bool { await mutate { try await self.transport.restore(id: note.id) } }

    func setArchive(_ value: Bool) { archived = value; page = 0; pages.removeAll() }
    func setPageSize(_ value: Int) { size = value; page = 0; pages.removeAll() }
    func nextPage() { if canGoNext { page += 1; Task { await load() } } }
    func previousPage() { if canGoPrevious { page -= 1; Task { await load() } } }
    func clearError() { error = nil }

    private var cacheKey: String { "\(page):\(size):\(archived):\(query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())" }
    private func apply(_ value: NotePage) { notes = value.items; page = value.page; totalItems = value.totalItems; totalPages = value.totalPages }
    private func mutate(_ request: () async throws -> Void) async -> Bool {
        guard !busy else { return false }; busy = true; error = nil
        defer { busy = false }
        do { try await request(); pages.removeAll(); await load(force: true); return true }
        catch { fail(error, "Unable to update this note. Please try again."); return false }
    }
    private func fail(_ failure: Error, _ message: String) {
        if failure is CancellationError { return }
        if case APIError.unauthorized = failure { unauthorized() }
        else if case APIError.offline = failure { error = "No network connection. Reconnect and try again." }
        else { error = message }
    }
}
