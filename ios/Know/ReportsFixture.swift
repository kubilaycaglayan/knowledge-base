import Foundation

struct ReportsFixture: ReportsTransport {
    private let arguments: [String]
    init(arguments: [String] = ProcessInfo.processInfo.arguments) { self.arguments = arguments }
    func paths() async throws -> [Path] { [Path(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!, name: "Research", description: nil, status: "ACTIVE", color: "#2878D5"), Path(id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!, name: "Writing", description: nil, status: "ACTIVE", color: "#9B51E0")] }
    func labels() async throws -> [KBLabel] { [KBLabel(id: UUID(uuidString: "00000000-0000-0000-0000-000000000011")!, name: "Deep work", color: "#2878D5", scopes: [.timeEntry]), KBLabel(id: UUID(uuidString: "00000000-0000-0000-0000-000000000012")!, name: "Planning", color: "#F2994A", scopes: [.timeEntry])] }
    func report(query: ReportQuery) async throws -> Report {
        if arguments.contains("-reports-timeout") { try await Task.sleep(for: .seconds(20)) }
        if arguments.contains("-reports-error") { throw APIError.offline }
        let path = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let label = UUID(uuidString: "00000000-0000-0000-0000-000000000011")!
        let empty = arguments.contains("-reports-empty")
        let start = query.startDate
        let days = empty ? [] : [ReportDay(date: start, totalSeconds: 5400, paths: [ReportCategory(id: path, label: "Research", seconds: 5400, color: "#2878D5")], sessionLabels: [ReportCategory(id: label, label: "Deep work", seconds: 5400, color: "#2878D5")], calendarNote: arguments.contains("-reports-calendar") ? "Planning day" : nil, calendarLabels: [])]
        return Report(period: "CUSTOM", from: query.startDate, to: query.endDate, totalSeconds: days.reduce(0) { $0 + $1.totalSeconds }, days: days, paths: days.flatMap(\.paths), sessionLabels: days.flatMap(\.sessionLabels), calendarLabels: [], sankey: arguments.contains("-reports-sankey") ? ReportSankey(granularity: query.aggregation.rawValue, nodes: [], links: []) : nil)
    }
}
