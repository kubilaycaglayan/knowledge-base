import SwiftUI
import Observation

@MainActor @Observable final class SessionsModel {
    private(set) var paths: [Path] = []
    private(set) var labels: [SessionLabel] = []
    private(set) var pathsByID: [UUID: Path] = [:]
    private(set) var labelsByID: [UUID: SessionLabel] = [:]
    private(set) var history = SessionPage(sessions: [], page: 0, totalPages: 0, totalSessions: 0)
    private(set) var timer: TrackedSession?
    var draft = SessionDraft()
    private(set) var busy = false
    private(set) var loading = false
    private(set) var loaded = false
    var error: String?
    private(set) var recentPathIds: [UUID] = []
    private(set) var connected = false
    var descriptionFocused = false
    var editingHistoryDraft = false
    private let transport: SessionsTransport
    private let defaults: UserDefaults?
    private let recentKey: String
    private let unauthorized: () -> Void
    private var revision = 0
    private var historyRevision = 0
    private var syncing = false
    private var socket: URLSessionWebSocketTask?
    private var socketTask: Task<Void, Never>?
    private var pollingTask: Task<Void, Never>?
    private var active = false
    private var selectionBaseline = TrackerSelection()
    private var saveQueued = false

    private func applySelection(_ selection: TrackerSelection, submitted: SessionDraft? = nil) {
        var nextBaseline = selectionBaseline
        let pathBase = submitted == nil ? selectionBaseline.pathId : submitted!.pathId
        if draft.pathId == pathBase { draft.pathId = selection.pathId; nextBaseline.pathId = selection.pathId }
        let labelsBase = submitted?.labelIds ?? selectionBaseline.labelIds
        if draft.labelIds == labelsBase { draft.labelIds = selection.labelIds; nextBaseline.labelIds = selection.labelIds }
        let descriptionBase = submitted?.description ?? selectionBaseline.description ?? ""
        if !descriptionFocused && draft.description == descriptionBase {
            draft.description = selection.description ?? ""
            nextBaseline.description = selection.description
        }
        selectionBaseline = nextBaseline
    }

    private func refreshTargets() async {
        let selectedPath = timer?.pathId ?? draft.pathId
        let selectedLabels = timer?.labelIds ?? draft.labelIds
        do {
            if let selectedPath, pathsByID[selectedPath] == nil {
                paths = try await transport.paths()
                pathsByID = Dictionary(uniqueKeysWithValues: paths.map { ($0.id, $0) })
            }
            if selectedLabels.contains(where: { labelsByID[$0] == nil }) {
                labels = try await transport.labels().filter { $0.scopes.contains("TIME_ENTRY") }
                labelsByID = Dictionary(uniqueKeysWithValues: labels.map { ($0.id, $0) })
            }
        } catch { fail(error, "Unable to refresh timer selections. Try again.") }
    }

    init(transport: SessionsTransport, defaults: UserDefaults? = .standard, account: String = "default", unauthorized: @escaping () -> Void = {}) {
        self.transport = transport
        self.defaults = defaults
        self.recentKey = "knowledge-base.recent-timer-paths.\(account)"
        self.unauthorized = unauthorized
        recentPathIds = (defaults?.stringArray(forKey: recentKey) ?? []).compactMap(UUID.init(uuidString:))
    }

    var activePaths: [Path] { paths.filter { $0.status == "ACTIVE" } }
    var recentPaths: [Path] { recentPathIds.compactMap { id in activePaths.first { $0.id == id } }.prefix(5).map { $0 } }
    var hasUnsavedDraft: Bool {
        if let timer {
            let baseline = SessionDraft(timer)
            return draft.pathId != baseline.pathId || draft.labelIds != baseline.labelIds
                || draft.description != baseline.description || draft.startedAt != baseline.startedAt
        }
        return draft.pathId != selectionBaseline.pathId || draft.labelIds != selectionBaseline.labelIds
            || draft.description != (selectionBaseline.description ?? "")
    }

    var descriptionNeedsSave: Bool {
        draft.description != (timer?.description ?? selectionBaseline.description ?? "")
    }

    func remember(_ id: UUID?) {
        guard let id else { return }
        recentPathIds = Array(([id] + recentPathIds.filter { $0 != id }).prefix(5))
        defaults?.set(recentPathIds.map(\.uuidString), forKey: recentKey)
    }

    func load() async {
        guard !loading else { return }
        loading = true
        error = nil
        defer { loading = false }
        do {
            async let p = transport.paths()
            async let l = transport.labels()
            paths = try await p
            pathsByID = Dictionary(uniqueKeysWithValues: paths.map { ($0.id, $0) })
            labels = try await l.filter { $0.scopes.contains("TIME_ENTRY") }
            labelsByID = Dictionary(uniqueKeysWithValues: labels.map { ($0.id, $0) })
            await loadHistory(page: history.page)
            await sync()
            loaded = true
        } catch { fail(error, "Unable to load the time tracker. Try again.") }
    }

    func loadHistory(page: Int = 0) async {
        historyRevision += 1
        let version = historyRevision
        do {
            var result = try await transport.history(page: max(0, page))
            if result.sessions.isEmpty && result.page > 0 {
                result = try await transport.history(page: max(0, min(result.page - 1, result.totalPages - 1)))
            }
            guard version == historyRevision else { return }
            history = result
        } catch { fail(error, "Unable to load sessions. Try again.") }
    }

    /// Snapshots never replace a user's idle draft or text currently being edited.
    func apply(_ snapshot: TrackedSession?) {
        let current = snapshot?.running == false ? nil : snapshot
        let previous = timer
        let changed = previous != current
        timer = current
        if let current {
            let pending = draft
            draft = SessionDraft(current)
            if let previous, previous.id == current.id {
                let baseline = SessionDraft(previous)
                if descriptionFocused || pending.description != baseline.description { draft.description = pending.description }
                if pending.pathId != baseline.pathId { draft.pathId = pending.pathId }
                if pending.labelIds != baseline.labelIds { draft.labelIds = pending.labelIds }
                if pending.startedAt != baseline.startedAt { draft.startedAt = pending.startedAt }
            }
            remember(current.pathId)
        } else if previous != nil {
            draft = SessionDraft()
            selectionBaseline = TrackerSelection()
        }
        if changed { revision += 1 }
    }

    func sync() async {
        guard !syncing, !busy else { return }
        syncing = true
        let version = revision
        defer { syncing = false }
        do {
            let snapshot = try await transport.current()
            guard version == revision, !busy else { return }
            let changed = timer != snapshot
            apply(snapshot)
            if snapshot == nil {
                let selection = try await transport.selection()
                guard version == revision, !busy, timer == nil else { return }
                applySelection(selection)
            }
            await refreshTargets()
            if changed { await loadHistory(page: 0) }
        } catch { fail(error, "Unable to sync the timer. Try again.") }
    }

    func toggleTimer() async {
        guard !busy else { return }
        busy = true
        error = nil
        revision += 1
        let version = revision
        defer { busy = false }
        do {
            if let timer {
                try await transport.stop(id: timer.id)
                if version == revision {
                    apply(nil)
                    applySelection(try await transport.selection())
                }
            } else {
                let result = try await transport.start(draft)
                if version == revision { apply(result) }
            }
            await loadHistory(page: 0)
        } catch { fail(error, "Could not update the timer. Only one timer can run at a time. Retry after syncing.") }
    }

    func saveTimer() async {
        guard !busy else { saveQueued = true; return }
        let timer = timer
        busy = true
        error = nil
        revision += 1
        let version = revision
        let submitted = draft
        defer {
            busy = false
            if saveQueued { saveQueued = false; Task { await saveTimer() } }
        }
        do {
            guard let timer else {
                let selection = try await transport.saveSelection(submitted)
                if version == revision { applySelection(selection, submitted: submitted) }
                return
            }
            let result = try await transport.updateTimer(id: timer.id, draft: submitted)
            if version == revision {
                let pendingText = draft.description
                self.timer = nil
                apply(result)
                if pendingText != submitted.description { draft.description = pendingText }
            }
            await loadHistory(page: history.page)
        } catch { fail(error, "Could not save the active timer settings. Your edits are kept; try again.") }
    }

    func choosePath(_ id: UUID?) async {
        guard !busy else { return }
        draft.pathId = id
        remember(id)
        await saveTimer()
    }

    func toggleLabel(_ id: UUID) async {
        guard !busy else { return }
        if draft.labelIds.contains(id) { draft.labelIds.removeAll { $0 == id } }
        else { draft.labelIds.append(id) }
        await saveTimer()
    }

    func createPath(_ name: String) async -> Bool {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy else { return false }
        guard !name.isEmpty else { error = "Enter a path name."; return false }
        busy = true
        error = nil
        do {
            let path = try await transport.createPath(name: name)
            paths.append(path)
            pathsByID[path.id] = path
            draft.pathId = path.id
            remember(path.id)
            busy = false
            await saveTimer()
            return true
        } catch { busy = false; fail(error, "Could not create path. Try again."); return false }
    }

    func createLabel(_ name: String) async -> Bool {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy else { return false }
        guard !name.isEmpty else { error = "Enter a label name."; return false }
        busy = true
        error = nil
        do {
            let label = try await transport.createLabel(name: name)
            if !labels.contains(where: { $0.id == label.id }) {
                labels.append(label)
                labelsByID[label.id] = label
            }
            if !draft.labelIds.contains(label.id) { draft.labelIds.append(label.id) }
            busy = false
            await saveTimer()
            return true
        } catch { busy = false; fail(error, "Could not create the session label. Try again."); return false }
    }

    func save(_ session: TrackedSession, draft: SessionDraft) async -> Bool {
        guard !busy, session.running != true else { return false }
        guard draft.endedAt > draft.startedAt else { error = "End time must be after start time."; return false }
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await transport.save(id: session.id, draft: draft)
            await loadHistory(page: history.page)
            return true
        } catch { fail(error, "Could not update this session. Check its time range and selections."); return false }
    }

    func remove(_ session: TrackedSession) async {
        guard !busy, session.running != true else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await transport.remove(id: session.id)
            await loadHistory(page: history.page)
        } catch { fail(error, "Could not remove this session. Try again.") }
    }

    private func fail(_ failure: Error, _ message: String) {
        if failure is CancellationError { return }
        if case APIError.unauthorized = failure { suspend(); unauthorized(); return }
        error = (failure as? APIError).map { if case .offline = $0 { return "No network connection. Reconnect and try again." }; return message } ?? message
    }

    func resume(client: APIClient, token: String) {
        guard !active else { return }
        active = true
        pollingTask = Task { [weak self] in
            guard let self else { return }
            await load()
            while !Task.isCancelled {
                await sync()
                try? await Task.sleep(for: .seconds(2))
            }
        }
        socketTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                var url = URLComponents(url: client.base, resolvingAgainstBaseURL: false)!
                url.scheme = url.scheme == "https" ? "wss" : "ws"
                url.path = "/ws/timers"
                url.query = nil
                let candidate = client.session.webSocketTask(with: url.url!)
                socket = candidate
                candidate.resume()
                do {
                    let auth = try JSONSerialization.data(withJSONObject: ["type": "AUTH", "token": token])
                    try await candidate.send(.string(String(decoding: auth, as: UTF8.self)))
                    while !Task.isCancelled {
                        let message = try await candidate.receive()
                        let data: Data
                        switch message { case .data(let value): data = value; case .string(let value): data = Data(value.utf8); @unknown default: continue }
                        receiveSnapshot(data)
                    }
                } catch { /* REST remains available while the socket reconnects. */ }
                candidate.cancel(with: .goingAway, reason: nil)
                connected = false
                if Task.isCancelled { break }
                await sync()
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    func receiveSnapshot(_ data: Data) {
        struct Message: Decodable { let type: String; let timer: TrackedSession? }
        guard let message = try? JSONDecoder().decode(Message.self, from: data) else { return }
        if message.type == "READY" { revision += 1; connected = true; Task { await sync() } }
        if message.type == "TIMER_STATE" {
            revision += 1
            let changed = timer != message.timer
            apply(message.timer)
            if changed { Task { await refreshTargets(); await loadHistory(page: 0) } }
        }
    }

    func suspend() {
        active = false
        revision += 1
        pollingTask?.cancel()
        socketTask?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        connected = false
    }
}
