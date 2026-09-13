import Foundation
import SwiftUI

enum ReportAggregation: String, Codable, CaseIterable, Identifiable {
    case day = "DAY", week = "WEEK", month = "MONTH", quarter = "QUARTER", year = "YEAR"
    var id: String { rawValue }
    var title: String { switch self { case .day: "Daily"; case .week: "Weekly"; case .month: "Monthly"; case .quarter: "Quarterly"; case .year: "Yearly" } }
}

enum ReportTrendline: String, CaseIterable { case off = "OFF", linear = "LINEAR", parabolic = "PARABOLIC"
    var title: String { switch self { case .off: "Off"; case .linear: "Linear"; case .parabolic: "Parabolic" } }
}

enum ReportBreakdown: String, CaseIterable { case path = "Path", labels = "Labels" }

struct ReportCategory: Codable, Equatable {
    let id: UUID?
    let label: String
    let seconds: Int64
    let color: String?
    var identity: String { id?.uuidString ?? label }
    var identifiableID: String { identity }
}

struct ReportCalendarLabel: Codable, Equatable, Identifiable {
    let id: UUID
    let label: String
    let color: String?
    let portion: Decimal?
    var identifiableID: UUID { id }
}

struct ReportCalendarTotal: Codable, Equatable, Identifiable {
    let id: UUID
    let label: String
    let color: String?
    let days: Decimal
    let markers: Int
    var identifiableID: UUID { id }
}

struct ReportDay: Codable, Equatable, Identifiable {
    let date: String
    let totalSeconds: Int64
    let paths: [ReportCategory]
    let sessionLabels: [ReportCategory]
    let calendarNote: String?
    let calendarLabels: [ReportCalendarLabel]
    var id: String { date }
}

struct ReportSankeyNode: Codable, Equatable, Identifiable { let id: String; let label: String; let color: String?; let depth: Int; let value: Int64; let pathLabel: String; let bucketLabel: String }
struct ReportSankeyLink: Codable, Equatable { let source: String; let target: String; let sourceLabel: String; let targetLabel: String; let value: Int64 }
struct ReportSankey: Codable, Equatable { let granularity: String; let nodes: [ReportSankeyNode]; let links: [ReportSankeyLink] }

struct Report: Codable, Equatable {
    let period: String
    let from: String
    let to: String
    let totalSeconds: Int64
    let days: [ReportDay]
    let paths: [ReportCategory]
    let sessionLabels: [ReportCategory]
    let calendarLabels: [ReportCalendarTotal]
    let sankey: ReportSankey?
}

struct ReportQuery: Equatable, Hashable, Codable {
    var startDate: String
    var endDate: String
    var aggregation: ReportAggregation = .day
    var pathIDs: [UUID] = []
    var labelIDs: [UUID] = []

    init(startDate: String, endDate: String, aggregation: ReportAggregation = .day, pathIDs: [UUID] = [], labelIDs: [UUID] = []) {
        self.startDate = startDate; self.endDate = endDate; self.aggregation = aggregation
        self.pathIDs = Self.unique(pathIDs); self.labelIDs = Self.unique(labelIDs)
    }
    var cacheKey: String { "\(startDate)|\(endDate)|\(aggregation.rawValue)|p:\(pathIDs.map(\.uuidString).joined(separator: ","))|l:\(labelIDs.map(\.uuidString).joined(separator: ","))" }
    var queryItems: [URLQueryItem] {
        var items = [URLQueryItem(name: "startDate", value: startDate), URLQueryItem(name: "endDate", value: endDate), URLQueryItem(name: "aggregation", value: aggregation.rawValue)]
        items += pathIDs.map { URLQueryItem(name: "pathId", value: $0.uuidString) }
        items += labelIDs.map { URLQueryItem(name: "labelId", value: $0.uuidString) }
        return items
    }
    private static func unique(_ values: [UUID]) -> [UUID] { Array(Set(values)).sorted { $0.uuidString < $1.uuidString } }
}

enum ReportDateMath {
    static func calendar(_ calendar: Calendar = .current) -> Calendar { var c = calendar; c.locale = Locale.current; return c }
    static func iso(_ date: Date, calendar: Calendar = .current) -> String { CalendarDate.string(date, calendar: calendar) }
    static func date(_ value: String, calendar: Calendar = .current) -> Date? { let formatter = DateFormatter(); formatter.calendar = calendar; formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd"; return formatter.date(from: value) }
    static func weekStart(_ date: Date, calendar: Calendar = .current) -> Date { let c = calendar; let start = c.startOfDay(for: date); let offset = (c.component(.weekday, from: start) + 5) % 7; return c.date(byAdding: .day, value: -offset, to: start)! }
    static func weekRange(containing date: Date, calendar: Calendar = .current) -> (Date, Date) { let start = weekStart(date, calendar: calendar); return (start, calendar.date(byAdding: .day, value: 6, to: start)!) }
    static func monthRange(containing date: Date, calendar: Calendar = .current) -> (Date, Date) { let start = calendar.date(from: calendar.dateComponents([.year, .month], from: date))!; return (start, calendar.date(byAdding: .day, value: -1, to: calendar.date(byAdding: .month, value: 1, to: start)!)!) }
    static func quarterRange(containing date: Date, calendar: Calendar = .current) -> (Date, Date) { let month = calendar.component(.month, from: date); let startMonth = ((month - 1) / 3) * 3 + 1; let start = calendar.date(from: DateComponents(year: calendar.component(.year, from: date), month: startMonth, day: 1))!; return (start, calendar.date(byAdding: .day, value: -1, to: calendar.date(byAdding: .month, value: 3, to: start)!)!) }
    static func yearRange(containing date: Date, calendar: Calendar = .current) -> (Date, Date) { let year = calendar.component(.year, from: date); let start = calendar.date(from: DateComponents(year: year, month: 1, day: 1))!; return (start, calendar.date(from: DateComponents(year: year, month: 12, day: 31))!) }
    static func defaultQuery(now: Date = Date(), calendar: Calendar = .current) -> ReportQuery { let range = weekRange(containing: now, calendar: calendar); return ReportQuery(startDate: iso(range.0, calendar: calendar), endDate: iso(range.1, calendar: calendar)) }
    static func preset(_ name: String, now: Date = Date(), calendar: Calendar = .current) -> (String, String)? {
        let c = calendar; let today = c.startOfDay(for: now)
        let range: (Date, Date)?
        switch name {
        case "Today": range = (today, today)
        case "Yesterday": let d = c.date(byAdding: .day, value: -1, to: today)!; range = (d, d)
        case "Week": range = weekRange(containing: today, calendar: c)
        case "Last week": let w = weekRange(containing: c.date(byAdding: .day, value: -7, to: today)!, calendar: c); range = w
        case "Past two weeks": range = (c.date(byAdding: .day, value: -13, to: today)!, today)
        case "Month": range = monthRange(containing: today, calendar: c)
        case "Last month": let current = monthRange(containing: today, calendar: c); let d = c.date(byAdding: .day, value: -1, to: current.0)!; range = monthRange(containing: d, calendar: c)
        case "Quarter": range = quarterRange(containing: today, calendar: c)
        case "Last quarter": let current = quarterRange(containing: today, calendar: c); range = quarterRange(containing: c.date(byAdding: .day, value: -1, to: current.0)!, calendar: c)
        case "Year": range = yearRange(containing: today, calendar: c)
        case "Last year": let current = yearRange(containing: today, calendar: c); range = yearRange(containing: c.date(byAdding: .day, value: -1, to: current.0)!, calendar: c)
        default: range = nil
        }
        guard let range else { return nil }; return (iso(range.0, calendar: c), iso(range.1, calendar: c))
    }
    static func shifted(_ query: ReportQuery, by direction: Int, calendar: Calendar = .current) -> ReportQuery? { guard let a = date(query.startDate, calendar: calendar), let b = date(query.endDate, calendar: calendar) else { return nil }; let count = calendar.dateComponents([.day], from: a, to: b).day! + 1; guard let start = calendar.date(byAdding: .day, value: direction * count, to: a), let end = calendar.date(byAdding: .day, value: direction * count, to: b) else { return nil }; return ReportQuery(startDate: iso(start, calendar: calendar), endDate: iso(end, calendar: calendar), aggregation: query.aggregation, pathIDs: query.pathIDs, labelIDs: query.labelIDs) }
    static let presets = ["Today", "Yesterday", "Week", "Last week", "Past two weeks", "Month", "Last month", "Quarter", "Last quarter", "Year", "Last year"]
}

struct ReportBucket: Identifiable, Equatable { let id: String; let label: String; let seconds: Int64; let categories: [ReportCategory] }

enum ReportCalculations {
    static func buckets(_ report: Report, query: ReportQuery, calendar: Calendar = .current) -> [ReportBucket] {
        var result: [String: (Date, Int64, [String: ReportCategory])] = [:]
        for day in report.days {
            guard let date = ReportDateMath.date(day.date, calendar: calendar) else { continue }
            let bucketDate: Date
            switch query.aggregation { case .day: bucketDate = date; case .week: bucketDate = ReportDateMath.weekStart(date, calendar: calendar); case .month: bucketDate = calendar.date(from: calendar.dateComponents([.year, .month], from: date))!; case .quarter: bucketDate = ReportDateMath.quarterRange(containing: date, calendar: calendar).0; case .year: bucketDate = calendar.date(from: calendar.dateComponents([.year], from: date))! }
            let key = ReportDateMath.iso(bucketDate, calendar: calendar); var current = result[key] ?? (bucketDate, 0, [:]); current.1 += day.paths.reduce(0) { $0 + $1.seconds }; for category in day.paths { let identity = category.identity; let old = current.2[identity]; current.2[identity] = ReportCategory(id: category.id, label: category.label, seconds: (old?.seconds ?? 0) + category.seconds, color: category.color ?? old?.color) }; result[key] = current
        }
        let formatter = DateFormatter(); formatter.calendar = calendar; formatter.locale = .current; formatter.timeZone = calendar.timeZone
        return result.values.sorted { $0.0 < $1.0 }.map { value in
            switch query.aggregation { case .day: formatter.setLocalizedDateFormatFromTemplate("EEE, MMM d"); case .week: formatter.setLocalizedDateFormatFromTemplate("MMM d"); case .month: formatter.setLocalizedDateFormatFromTemplate("MMM yyyy"); case .quarter: formatter.dateFormat = "'Q'\((calendar.component(.month, from: value.0)-1)/3+1) yyyy"; case .year: formatter.dateFormat = "yyyy" }
            return ReportBucket(id: ReportDateMath.iso(value.0, calendar: calendar), label: formatter.string(from: value.0), seconds: value.1, categories: value.2.values.sorted { $0.label < $1.label })
        }
    }
    static func trend(_ buckets: [ReportBucket], mode: ReportTrendline) -> [(String, Int64)] {
        guard mode != .off else { return [] }
        let points = buckets.enumerated().filter { $0.element.seconds > 0 }; guard points.count >= (mode == .parabolic ? 3 : 2) else { return [] }
        let xs = points.map { Double($0.offset) }, ys = points.map { Double($0.element.seconds) }
        if mode == .linear { let n = Double(xs.count), sx = xs.reduce(0,+), sy = ys.reduce(0,+), sxx = xs.reduce(0) { $0 + $1*$1 }, sxy = zip(xs,ys).reduce(0) { $0 + $1.0*$1.1 }, denominator = n*sxx-sx*sx; guard denominator != 0 else { return [] }; let slope = (n*sxy-sx*sy)/denominator, intercept = (sy-slope*sx)/n; return points.map { ($0.element.id, max(0, Int64((intercept+slope*Double($0.offset)).rounded()))) } }
        let n = Double(xs.count), sx = xs.reduce(0,+), sx2 = xs.reduce(0) { $0 + $1*$1 }, sx3 = xs.reduce(0) { $0 + $1*$1*$1 }, sx4 = xs.reduce(0) { $0 + $1*$1*$1*$1 }, sy = ys.reduce(0,+), sxy = zip(xs,ys).reduce(0) { $0 + $1.0*$1.1 }, sx2y = zip(xs,ys).reduce(0) { $0 + $1.0*$1.0*$1.1 }
        var matrix = [[n, sx, sx2, sy], [sx, sx2, sx3, sxy], [sx2, sx3, sx4, sx2y]]
        for column in 0..<3 { guard let pivot = (column..<3).max(by: { abs(matrix[$0][column]) < abs(matrix[$1][column]) }), abs(matrix[pivot][column]) > 0.000001 else { return [] }; matrix.swapAt(column, pivot); let divisor = matrix[column][column]; for i in column..<4 { matrix[column][i] /= divisor }; for row in 0..<3 where row != column { let factor = matrix[row][column]; for i in column..<4 { matrix[row][i] -= factor * matrix[column][i] } } }
        let a = matrix[0][3], b = matrix[1][3], c = matrix[2][3]; return points.map { let x = Double($0.offset); return ($0.element.id, max(0, Int64((a + b*x + c*x*x).rounded()))) }
    }
}

protocol ReportsTransport { func report(query: ReportQuery) async throws -> Report; func paths() async throws -> [Path]; func labels() async throws -> [KBLabel] }
enum ReportLoadError: Error { case timeout }
struct ReportsAPI: ReportsTransport { let client: APIClient; let token: String
    func report(query: ReportQuery) async throws -> Report { var c = URLComponents(); c.queryItems = query.queryItems; return try await client.request("/reports?\(c.percentEncodedQuery ?? "")", token: token) }
    func paths() async throws -> [Path] { try await client.request("/paths", token: token) }
    func labels() async throws -> [KBLabel] { try await client.request("/labels?scope=TIME_ENTRY", token: token) }
}

@MainActor final class ReportsModel: ObservableObject {
    @Published private(set) var query: ReportQuery
    @Published private(set) var report: Report?
    @Published private(set) var loaded = false
    @Published private(set) var paths: [Path] = []
    @Published private(set) var labels: [KBLabel] = []
    @Published private(set) var loading = false
    @Published private(set) var refreshing = false
    @Published var error: String?
    @Published var rangeError: String?
    @Published var trendline: ReportTrendline = .off
    @Published var showSankey = false
    @Published var showCalendarInputs = true
    @Published var breakdown: ReportBreakdown = .path
    private let transport: ReportsTransport; private let unauthorized: () -> Void; private var generation = 0; private var cache: [String: Report] = [:]; private var loadedReferences = false; private var inflightKey: String?
    init(transport: ReportsTransport, query: ReportQuery? = nil, calendar: Calendar = .current, unauthorized: @escaping () -> Void = {}) { self.transport = transport; self.query = query ?? ReportDateMath.defaultQuery(calendar: calendar); self.unauthorized = unauthorized }
    var pathOptions: [Path] { paths.isEmpty ? (report?.paths.compactMap { guard let id = $0.id else { return nil }; return Path(id: id, name: $0.label, description: nil, status: "ACTIVE", color: $0.color) } ?? []) : paths }
    var labelOptions: [KBLabel] { labels.isEmpty ? (report?.sessionLabels.compactMap { guard let id = $0.id else { return nil }; return KBLabel(id: id, name: $0.label, color: $0.color, scopes: [.timeEntry]) } ?? []) : labels.filter { $0.scopes.contains(.timeEntry) } }
    func load(force: Bool = false) async {
        let requestedQuery = query
        let key = requestedQuery.cacheKey
        if !force, let cached = cache[key] { report = cached; loaded = true; return }
        if !force, inflightKey == key { return }
        generation += 1
        let current = generation
        inflightKey = key
        loading = report == nil
        refreshing = report != nil
        error = nil
        do {
            async let value = timedReport(requestedQuery)
            async let reference = loadReferences()
            let result = try await value
            _ = await reference
            guard current == generation else { return }
            guard !result.days.isEmpty || result.paths.isEmpty else { throw APIError.http(status: 422, message: "Malformed report") }
            var completedQuery = requestedQuery
            if ReportDateMath.date(result.from) != nil, ReportDateMath.date(result.to) != nil {
                completedQuery.startDate = result.from
                completedQuery.endDate = result.to
                query = completedQuery
            }
            report = result
            loaded = true
            cache[key] = result
            cache[completedQuery.cacheKey] = result
        } catch {
            guard current == generation else { return }
            if case APIError.unauthorized = error { unauthorized() }
            else if error is ReportLoadError || (error as? URLError)?.code == .timedOut { self.error = "The report took too long to load." }
            else { self.error = "Unable to load the report. Please try again." }
        }
        if current == generation {
            inflightKey = nil
            loading = false
            refreshing = false
        }
    }
    private func timedReport(_ query: ReportQuery) async throws -> Report { try await withThrowingTaskGroup(of: Report.self) { group in group.addTask { try await self.transport.report(query: query) }; group.addTask { try await Task.sleep(for: .seconds(15)); throw ReportLoadError.timeout }; defer { group.cancelAll() }; return try await group.next()! } }
    private func loadReferences() async { guard !loadedReferences else { return }; async let p = try? transport.paths(); async let l = try? transport.labels(); if let p = await p { paths = p }; if let l = await l { labels = l }; loadedReferences = true }
    func retry() async { await load(force: true) }
    func setRange(start: String?, end: String?, calendar: Calendar = .current) async {
        guard let start, let end else { return }
        guard let a = ReportDateMath.date(start, calendar: calendar), let b = ReportDateMath.date(end, calendar: calendar) else { rangeError = "Choose valid start and end dates."; return }
        guard b >= a else { rangeError = "End date must be on or after start date."; return }
        guard calendar.date(byAdding: .year, value: 2, to: a)! >= b else { rangeError = "Report range cannot exceed two years."; return }
        guard start != query.startDate || end != query.endDate else { return }
        rangeError = nil; query.startDate = start; query.endDate = end; await load()
    }
    func setPreset(_ name: String, now: Date = Date(), calendar: Calendar = .current) async { guard let range = ReportDateMath.preset(name, now: now, calendar: calendar), range != (query.startDate, query.endDate) else { return }; rangeError = nil; query.startDate = range.0; query.endDate = range.1; await load() }
    func setAggregation(_ aggregation: ReportAggregation, now: Date = Date(), calendar: Calendar = .current) async { guard query.aggregation != aggregation else { return }; query.aggregation = aggregation; if aggregation == .day { let r = ReportDateMath.weekRange(containing: now, calendar: calendar); query.startDate = ReportDateMath.iso(r.0, calendar: calendar); query.endDate = ReportDateMath.iso(r.1, calendar: calendar) } else if aggregation == .week { query.endDate = ReportDateMath.iso(calendar.startOfDay(for: now), calendar: calendar); query.startDate = ReportDateMath.iso(calendar.date(byAdding: .day, value: -29, to: now)!, calendar: calendar) } else if aggregation == .month { query.endDate = ReportDateMath.iso(now, calendar: calendar); query.startDate = ReportDateMath.iso(calendar.date(byAdding: .year, value: -1, to: now)!, calendar: calendar) } else if aggregation == .quarter { query.endDate = ReportDateMath.iso(now, calendar: calendar); query.startDate = ReportDateMath.iso(calendar.date(byAdding: .year, value: -2, to: now)!, calendar: calendar) }; await load() }
    func shift(_ direction: Int, calendar: Calendar = .current) async { guard let q = ReportDateMath.shifted(query, by: direction, calendar: calendar) else { return }; query = q; await load() }
    func togglePath(_ id: UUID) async { query.pathIDs = query.pathIDs.contains(id) ? query.pathIDs.filter { $0 != id } : query.pathIDs + [id]; query = ReportQuery(startDate: query.startDate, endDate: query.endDate, aggregation: query.aggregation, pathIDs: query.pathIDs, labelIDs: query.labelIDs); await load() }
    func toggleLabel(_ id: UUID) async { query.labelIDs = query.labelIDs.contains(id) ? query.labelIDs.filter { $0 != id } : query.labelIDs + [id]; query = ReportQuery(startDate: query.startDate, endDate: query.endDate, aggregation: query.aggregation, pathIDs: query.pathIDs, labelIDs: query.labelIDs); await load() }
    func clearPaths() async { query.pathIDs = []; await load() }; func clearLabels() async { query.labelIDs = []; await load() }
    func signOut() { generation += 1; inflightKey = nil; loadedReferences = false; loaded = false; cache.removeAll(); report = nil; paths = []; labels = [] }
}
