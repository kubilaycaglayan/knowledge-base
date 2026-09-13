import Foundation

struct ReportsFixture: ReportsTransport {
    private let arguments: [String]

    private static let researchID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    private static let writingID = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
    private static let deepWorkID = UUID(uuidString: "00000000-0000-0000-0000-000000000011")!
    private static let planningID = UUID(uuidString: "00000000-0000-0000-0000-000000000012")!
    private static let calendarID = UUID(uuidString: "00000000-0000-0000-0000-000000000021")!

    init(arguments: [String] = ProcessInfo.processInfo.arguments) { self.arguments = arguments }

    func paths() async throws -> [Path] {
        if arguments.contains("-reports-paths-error") { throw APIError.offline }
        return [
            Path(id: Self.researchID, name: arguments.contains("-reports-long") ? String(repeating: "Research and planning with a very long path name ", count: 3) : "Research", description: nil, status: "ACTIVE", color: "#2878D5"),
            Path(id: Self.writingID, name: "Writing", description: nil, status: "ACTIVE", color: "#9B51E0")
        ]
    }

    func labels() async throws -> [KBLabel] {
        if arguments.contains("-reports-labels-error") { throw APIError.offline }
        return [
            KBLabel(id: Self.deepWorkID, name: arguments.contains("-reports-long") ? String(repeating: "Deep work label with a long accessible name ", count: 3) : "Deep work", color: "#2878D5", scopes: [.timeEntry]),
            KBLabel(id: Self.planningID, name: "Planning", color: "#F2994A", scopes: [.timeEntry]),
            KBLabel(id: Self.calendarID, name: "Calendar only", color: "#22C55E", scopes: [.calendar])
        ]
    }

    func report(query: ReportQuery) async throws -> Report {
        if arguments.contains("-reports-timeout") { try await Task.sleep(for: .seconds(20)) }
        if arguments.contains("-reports-loading") { try await Task.sleep(for: .seconds(2)) }
        if arguments.contains("-reports-error") || arguments.contains("-reports-offline") { throw APIError.offline }

        let empty = arguments.contains("-reports-empty")
        let malformed = arguments.contains("-reports-malformed")
        if empty { return Report(period: "CUSTOM", from: query.startDate, to: query.endDate, totalSeconds: 0, days: [], paths: [], sessionLabels: [], calendarLabels: [], sankey: arguments.contains("-reports-sankey") ? sankey(empty: true) : nil) }
        if malformed { return Report(period: "CUSTOM", from: query.startDate, to: query.endDate, totalSeconds: 0, days: [], paths: [category(Self.researchID, label: "Research", seconds: 60, color: "#2878D5")], sessionLabels: [], calendarLabels: [], sankey: nil) }

        let calendar = Self.fixtureCalendar
        let start = ReportDateMath.date(query.startDate, calendar: calendar) ?? calendar.date(from: DateComponents(year: 2026, month: 9, day: 7))!
        let names = arguments.contains("-reports-long") ? String(repeating: "Deep work label with a long accessible name ", count: 3) : "Deep work"
        let days = (0..<7).map { offset -> ReportDay in
            let date = calendar.date(byAdding: .day, value: offset, to: start)!
            let iso = ReportDateMath.iso(date, calendar: calendar)
            let researchSeconds: Int64 = offset.isMultiple(of: 2) ? Int64(1_800 + offset * 300) : 0
            let writingSeconds: Int64 = offset == 3 ? 2_400 : 0
            let pathFilterAllowsResearch = query.pathIDs.isEmpty || query.pathIDs.contains(Self.researchID)
            let pathFilterAllowsWriting = query.pathIDs.isEmpty || query.pathIDs.contains(Self.writingID)
            let labelFilterAllowsEntry = query.labelIDs.isEmpty || query.labelIDs.contains(Self.deepWorkID)
            let paths = [
                researchSeconds > 0 && pathFilterAllowsResearch && labelFilterAllowsEntry ? category(Self.researchID, label: "Research", seconds: researchSeconds, color: "#2878D5") : nil,
                writingSeconds > 0 && pathFilterAllowsWriting && labelFilterAllowsEntry ? category(Self.writingID, label: "Writing", seconds: writingSeconds, color: "#9B51E0") : nil
            ].compactMap { $0 }
            let labels = paths.isEmpty ? [] : [category(Self.deepWorkID, label: names, seconds: paths.reduce(0) { $0 + $1.seconds }, color: "#2878D5")]
            let calendarLabels: [ReportCalendarLabel] = arguments.contains("-reports-calendar") && offset == 2 ? [
                ReportCalendarLabel(id: Self.calendarID, label: "Planning", color: "#F2994A", portion: Decimal(string: "0.50")),
                ReportCalendarLabel(id: Self.planningID, label: "Deep focus", color: "#2878D5", portion: nil)
            ] : []
            let note = arguments.contains("-reports-calendar") && offset == 2 ? "Planning day\nReview the weekly priorities." : nil
            return ReportDay(date: iso, totalSeconds: paths.reduce(0) { $0 + $1.seconds }, paths: paths, sessionLabels: labels, calendarNote: note, calendarLabels: calendarLabels)
        }
        let paths = aggregate(days.flatMap(\.paths))
        let sessionLabels = aggregate(days.flatMap(\.sessionLabels))
        let total = paths.reduce(0) { $0 + $1.seconds }
        let totals = arguments.contains("-reports-calendar") ? [ReportCalendarTotal(id: Self.calendarID, label: "Planning", color: "#F2994A", days: Decimal(string: "0.5")!, markers: 1)] : []
        let normalizedFrom = arguments.contains("-reports-normalized") ? ReportDateMath.iso(start, calendar: calendar) : query.startDate
        let normalizedTo = arguments.contains("-reports-normalized") ? ReportDateMath.iso(calendar.date(byAdding: .day, value: 6, to: start)!, calendar: calendar) : query.endDate
        return Report(period: "CUSTOM", from: normalizedFrom, to: normalizedTo, totalSeconds: total, days: days, paths: paths, sessionLabels: sessionLabels, calendarLabels: totals, sankey: arguments.contains("-reports-sankey") ? sankey(empty: false) : nil)
    }

    private static let fixtureCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }()

    private func category(_ id: UUID, label: String, seconds: Int64, color: String?) -> ReportCategory { ReportCategory(id: id, label: label, seconds: seconds, color: color) }

    private func aggregate(_ values: [ReportCategory]) -> [ReportCategory] {
        Dictionary(grouping: values, by: { $0.identity }).compactMap { _, values in
            guard let first = values.first else { return nil }
            return ReportCategory(id: first.id, label: first.label, seconds: values.reduce(0) { $0 + $1.seconds }, color: first.color)
        }.sorted { $0.label < $1.label }
    }

    private func sankey(empty: Bool) -> ReportSankey {
        guard !empty else { return ReportSankey(granularity: "DAY", nodes: [], links: []) }
        let source = ReportSankeyNode(id: "research", label: "Research", color: "#2878D5", depth: 0, value: 3_600, pathLabel: "Research", bucketLabel: "Mon, Sep 7")
        let target = ReportSankeyNode(id: "deep-work", label: "Deep work", color: "#2878D5", depth: 1, value: 3_600, pathLabel: "Research", bucketLabel: "Mon, Sep 7")
        let link = ReportSankeyLink(source: source.id, target: target.id, sourceLabel: source.label, targetLabel: target.label, value: 3_600)
        return ReportSankey(granularity: "DAY", nodes: [source, target], links: [link])
    }
}
