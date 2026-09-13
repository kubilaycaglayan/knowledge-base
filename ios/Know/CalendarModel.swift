import Foundation

@MainActor final class CalendarModel: ObservableObject {
    @Published private(set) var labels: [KBLabel] = []
    @Published private(set) var days: [String: CalendarDay] = [:]
    @Published private(set) var loading = false
    @Published private(set) var loaded = false
    @Published private(set) var saving = false
    @Published private(set) var addingLabel = false
    @Published var error: String?
    @Published var month: Date
    @Published var selectedDate: Date
    @Published var note = ""
    @Published var selectedAssignments: [UUID: CalendarPortion] = [:]
    @Published private(set) var rangeStart: Date?
    @Published private(set) var rangeEnd: Date?

    let calendar: Calendar
    private let transport: CalendarTransport
    private let unauthorized: () -> Void
    private let invalidateReports: () -> Void
    private var loadedRanges = Set<String>()
    private var loadGeneration = 0

    init(transport: CalendarTransport, now: Date = Date(), calendar: Calendar = .current, unauthorized: @escaping () -> Void = {}, invalidateReports: @escaping () -> Void = {}) {
        self.transport = transport; self.calendar = calendar; self.unauthorized = unauthorized; self.invalidateReports = invalidateReports
        let today = calendar.startOfDay(for: now)
        selectedDate = today
        month = CalendarGrid.monthStart(containing: today, calendar: calendar)
    }

    var gridDates: [Date] { CalendarGrid.monthDates(month: month, calendar: calendar) }
    var isRangeMode: Bool { rangeStart != nil }
    var rangeTitle: String? {
        guard let start = rangeStart, let end = rangeEnd else { return nil }
        let formatter = DateFormatter(); formatter.calendar = calendar; formatter.locale = .current; formatter.timeZone = calendar.timeZone; formatter.dateFormat = "MMM d, yyyy"
        return "\(formatter.string(from: start)) – \(formatter.string(from: end))"
    }
    var hasUnsavedDraft: Bool { !note.isEmpty || isRangeMode || !selectedAssignments.isEmpty }

    func load(force: Bool = false) async {
        let bounds = CalendarGrid.range(for: month, calendar: calendar)
        let start = CalendarDate.string(bounds.0, calendar: calendar), end = CalendarDate.string(bounds.1, calendar: calendar)
        let key = "\(start):\(end)"
        if !force, loadedRanges.contains(key) { loaded = true; return }
        loadGeneration += 1; let generation = loadGeneration
        loading = true; error = nil
        do {
            async let fetchedLabels = transport.labels()
            async let fetchedDays = transport.days(startDate: start, endDate: end)
            let (newLabels, newDays) = try await (fetchedLabels, fetchedDays)
            guard generation == loadGeneration else { return }
            labels = newLabels.filter { $0.scopes.contains(.calendar) }
            for day in newDays { days[day.date] = day }
            loadedRanges.insert(key); loaded = true
            if rangeStart == nil { hydrate(date: selectedDate) }
        } catch { fail(error, "Unable to load calendar records.") }
        loading = false
    }

    func moveMonth(_ offset: Int) async {
        month = calendar.date(byAdding: .month, value: offset, to: month) ?? month
        selectedDate = CalendarGrid.monthStart(containing: month, calendar: calendar)
        clearRange(); note = ""; selectedAssignments = [:]
        await load()
    }

    func select(_ date: Date) {
        let day = calendar.startOfDay(for: date)
        if let start = rangeStart {
            rangeEnd = day
            if rangeEnd == start { clearRange(); selectedDate = day; hydrate(date: day) }
            else if day < start { rangeEnd = start; rangeStart = day }
            return
        }
        selectedDate = day; hydrate(date: day)
    }

    func beginRange(_ date: Date) { rangeStart = calendar.startOfDay(for: date); rangeEnd = nil; note = ""; selectedAssignments = [:]; error = nil }
    func cancelRange() { clearRange(); hydrate(date: selectedDate) }
    func clearRange() { rangeStart = nil; rangeEnd = nil }
    func inRange(_ date: Date) -> Bool { guard let start = rangeStart else { return false }; let end = rangeEnd ?? start; return date >= min(start, end) && date <= max(start, end) }

    func toggle(_ label: KBLabel) { if selectedAssignments[label.id] != nil { selectedAssignments.removeValue(forKey: label.id) } else { selectedAssignments[label.id] = .marker } }
    func setPortion(_ portion: CalendarPortion, for label: KBLabel) { selectedAssignments[label.id] = portion }

    func save() async -> Bool {
        guard !saving else { return false }; saving = true; error = nil
        let assignments = selectedAssignments.map { CalendarDayAssignment(labelId: $0.key, portion: $0.value.value) }.sorted { $0.labelId.uuidString < $1.labelId.uuidString }
        do {
            let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
            if let start = rangeStart, let end = rangeEnd {
                let result = try await transport.saveRange(request: CalendarRangeRequest(startDate: CalendarDate.string(min(start, end), calendar: calendar), endDate: CalendarDate.string(max(start, end), calendar: calendar), note: trimmed.isEmpty ? nil : trimmed, labels: assignments))
                for day in result { days[day.date] = day }; clearRange()
            } else {
                let date = CalendarDate.string(selectedDate, calendar: calendar)
                let result = try await transport.saveDay(date: date, request: CalendarDayRequest(note: trimmed.isEmpty ? nil : trimmed, labels: assignments)); days[date] = result; hydrate(date: selectedDate)
            }
            saving = false; invalidateReports(); return true
        } catch { saving = false; fail(error, "Unable to save this day."); return false }
    }

    func retry() async { await load(force: true) }

    func createLabel(name: String, color: String = WorkspaceTheme.palette[0]) async -> Bool {
        let value = name.trimmingCharacters(in: .whitespacesAndNewlines); guard !value.isEmpty, !addingLabel else { return false }
        addingLabel = true; error = nil
        do { let label = try await transport.createLabel(name: value, color: color); if !labels.contains(where: { $0.name.caseInsensitiveCompare(label.name) == .orderedSame }) { labels.append(label) }; addingLabel = false; invalidateReports(); return true }
        catch { addingLabel = false; fail(error, "Unable to add that label. Label names must be unique."); return false }
    }

    func updateLabelColor(_ label: KBLabel, color: String) async -> Bool {
        guard WorkspaceTheme.palette.contains(color) else { return false }
        var updated = label; updated.color = color
        do { let saved = try await transport.updateLabel(updated); labels = labels.map { $0.id == saved.id ? saved : $0 }; return true }
        catch { fail(error, "Unable to update that label color."); return false }
    }

    private func hydrate(date: Date) {
        let key = CalendarDate.string(date, calendar: calendar); let day = days[key]
        note = day?.note ?? ""; selectedAssignments = Dictionary(uniqueKeysWithValues: (day?.labels ?? []).map { ($0.labelId, CalendarPortion(portion: $0.portion)) })
    }
    private func fail(_ failure: Error, _ message: String) { if failure is CancellationError { return }; if case APIError.unauthorized = failure { unauthorized() } else if case APIError.offline = failure { error = message } else { error = message } }
}
