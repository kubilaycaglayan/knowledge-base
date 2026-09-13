import Foundation

struct CalendarFixture: CalendarTransport {
    let arguments: [String]
    private let labelID = UUID(uuidString: "00000000-0000-4000-8000-000000000020")!
    private let dayDate = "2026-09-03"

    func labels() async throws -> [KBLabel] {
        if arguments.contains("-calendar-loading") { try await Task.sleep(nanoseconds: 5_000_000_000) }
        if arguments.contains("-calendar-unauthorized") { throw APIError.unauthorized }
        if arguments.contains("-calendar-offline") { throw APIError.offline }
        if arguments.contains("-calendar-load-error") { throw APIError.http(status: 503, message: nil) }
        if arguments.contains("-calendar-empty-labels") { return [] }
        return [KBLabel(id: labelID, name: "Milestone", color: WorkspaceTheme.palette[0], scopes: [.calendar])]
    }
    func days(startDate: String, endDate: String) async throws -> [CalendarDay] {
        if arguments.contains("-calendar-loading") { try await Task.sleep(nanoseconds: 5_000_000_000) }
        if arguments.contains("-calendar-unauthorized") { throw APIError.unauthorized }
        if arguments.contains("-calendar-offline") || arguments.contains("-calendar-load-error") { throw APIError.offline }
        guard arguments.contains("-calendar-saved-day") || arguments.contains("-calendar-range") else { return [] }
        return [CalendarDay(date: dayDate, note: "A useful day", labels: [CalendarAssignment(labelId: labelID, name: "Milestone", color: WorkspaceTheme.palette[0], portion: arguments.contains("-calendar-range") ? 0.50 : nil)])]
    }
    func saveDay(date: String, request: CalendarDayRequest) async throws -> CalendarDay {
        if arguments.contains("-calendar-mutation-error") || arguments.contains("-calendar-offline") { throw APIError.offline }
        return CalendarDay(date: date, note: request.note, labels: request.labels.map { CalendarAssignment(labelId: $0.labelId, name: "Milestone", color: WorkspaceTheme.palette[0], portion: $0.portion) })
    }
    func saveRange(request: CalendarRangeRequest) async throws -> [CalendarDay] {
        if arguments.contains("-calendar-mutation-error") || arguments.contains("-calendar-offline") { throw APIError.offline }
        guard let start = CalendarDate.date(request.startDate), let end = CalendarDate.date(request.endDate) else { return [] }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        var result: [CalendarDay] = []; var date = start
        while date <= end { result.append(CalendarDay(date: CalendarDate.string(date, calendar: calendar), note: request.note, labels: request.labels.map { CalendarAssignment(labelId: $0.labelId, name: "Milestone", color: WorkspaceTheme.palette[0], portion: $0.portion) })); date = calendar.date(byAdding: .day, value: 1, to: date)! }
        return result
    }
    func createLabel(name: String, color: String) async throws -> KBLabel { if arguments.contains("-calendar-mutation-error") { throw APIError.http(status: 409, message: nil) }; return KBLabel(id: UUID(), name: name, color: color, scopes: [.calendar]) }
    func updateLabel(_ label: KBLabel) async throws -> KBLabel { if arguments.contains("-calendar-mutation-error") { throw APIError.http(status: 503, message: nil) }; return label }
}
