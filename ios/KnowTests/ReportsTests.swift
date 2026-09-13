import XCTest
@testable import Know

@MainActor final class ReportsTests: XCTestCase {
    class Stub: ReportsTransport {
        var reportValue: Report; var reportQueries: [ReportQuery] = []; var failure: Error?
        init() { reportValue = Report(period: "CUSTOM", from: "2026-09-07", to: "2026-09-13", totalSeconds: 3600, days: [ReportDay(date: "2026-09-07", totalSeconds: 3600, paths: [ReportCategory(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001"), label: "Research", seconds: 3600, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: [])], paths: [ReportCategory(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001"), label: "Research", seconds: 3600, color: nil)], sessionLabels: [], calendarLabels: [], sankey: nil) }
        func report(query: ReportQuery) async throws -> Report { reportQueries.append(query); if let failure { throw failure }; return reportValue }
        func paths() async throws -> [Path] { [] }
        func labels() async throws -> [KBLabel] { [] }
    }
    final class TimeoutStub: ReportsTransport {
        func report(query: ReportQuery) async throws -> Report { throw ReportLoadError.timeout }
        func paths() async throws -> [Path] { [] }
        func labels() async throws -> [KBLabel] { [] }
    }
    private func calendar() -> Calendar { var c = Calendar(identifier: .gregorian); c.locale = Locale(identifier: "en_US_POSIX"); c.timeZone = TimeZone(identifier: "Europe/Istanbul")!; return c }

    func testDefaultAndAllPresetsUseInclusiveLocalDates() {
        let c = calendar(); let now = c.date(from: DateComponents(year: 2026, month: 9, day: 13))!
        XCTAssertEqual(ReportDateMath.defaultQuery(now: now, calendar: c).startDate, "2026-09-07")
        XCTAssertEqual(ReportDateMath.preset("Past two weeks", now: now, calendar: c)?.0, "2026-08-31")
        XCTAssertEqual(ReportDateMath.preset("Last week", now: now, calendar: c)?.0, "2026-08-31")
        XCTAssertEqual(ReportDateMath.preset("Last month", now: now, calendar: c)?.1, "2026-08-31")
        XCTAssertEqual(ReportDateMath.preset("Quarter", now: now, calendar: c)?.0, "2026-07-01")
        XCTAssertEqual(ReportDateMath.preset("Last year", now: now, calendar: c)?.1, "2025-12-31")
    }

    func testQueryDeduplicatesDeterministicallyAndRepeatsFilters() throws {
        let a = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!, b = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let query = ReportQuery(startDate: "2026-09-01", endDate: "2026-09-30", aggregation: .month, pathIDs: [a, b, a], labelIDs: [b, b])
        XCTAssertEqual(query.pathIDs, [b, a]); XCTAssertEqual(query.labelIDs, [b]); XCTAssertEqual(query.queryItems.filter { $0.name == "pathId" }.count, 2); XCTAssertEqual(query.queryItems.filter { $0.name == "labelId" }.count, 1)
    }

    func testShiftPreservesPresentationIndependentQueryValues() {
        let q = ReportQuery(startDate: "2026-02-23", endDate: "2026-03-01", aggregation: .week)
        XCTAssertEqual(ReportDateMath.shifted(q, by: -1, calendar: calendar())?.startDate, "2026-02-16")
        XCTAssertEqual(ReportDateMath.shifted(q, by: 1, calendar: calendar())?.endDate, "2026-03-08")
    }

    func testRangeValidationRejectsIncompleteReversedAndOverlongWithoutLoading() async {
        let stub = Stub(); let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")); await model.setRange(start: nil, end: "2026-09-13"); XCTAssertTrue(stub.reportQueries.isEmpty)
        await model.setRange(start: "2026-09-14", end: "2026-09-13"); XCTAssertEqual(model.rangeError, "End date must be on or after start date.")
        await model.setRange(start: "2026-01-01", end: "2028-01-02"); XCTAssertEqual(model.rangeError, "Report range cannot exceed two years."); XCTAssertEqual(model.query.startDate, "2026-09-07")
    }

    func testTrendlineUsesNonEmptyPointsAndQuadraticFallback() {
        let buckets: [ReportBucket] = (0..<4).map { index in
            let seconds: Int64 = index == 1 ? 0 : Int64(index * index + 1)
            return ReportBucket(id: String(index), label: "B\(index)", seconds: seconds, categories: [])
        }
        XCTAssertEqual(ReportCalculations.trend(buckets, mode: .linear).first?.0, "0")
        XCTAssertEqual(ReportCalculations.trend(buckets, mode: .parabolic).count, 3)
        XCTAssertTrue(ReportCalculations.trend(Array(buckets.prefix(2)), mode: .parabolic).isEmpty)
        XCTAssertTrue(ReportCalculations.trend(buckets, mode: .off).isEmpty)
    }

    func testBucketsRetainZeroDaysAndGroupMondayWeeks() {
        let report = Report(period: "CUSTOM", from: "2026-09-07", to: "2026-09-13", totalSeconds: 60, days: [ReportDay(date: "2026-09-07", totalSeconds: 60, paths: [ReportCategory(id: nil, label: "A", seconds: 60, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: []), ReportDay(date: "2026-09-08", totalSeconds: 0, paths: [], sessionLabels: [], calendarNote: nil, calendarLabels: [])], paths: [ReportCategory(id: nil, label: "A", seconds: 60, color: nil)], sessionLabels: [], calendarLabels: [], sankey: nil)
        let buckets = ReportCalculations.buckets(report, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-08", aggregation: .day), calendar: calendar())
        XCTAssertEqual(buckets.count, 2); XCTAssertEqual(buckets[1].seconds, 0)
        XCTAssertEqual(ReportCalculations.buckets(report, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-08", aggregation: .week), calendar: calendar()).count, 1)
    }

    func testDisplayedActiveDaysUseFilteredPathDurationsNotCalendarOrRawDayTotal() {
        let report = Report(period: "CUSTOM", from: "2026-09-07", to: "2026-09-08", totalSeconds: 0, days: [ReportDay(date: "2026-09-07", totalSeconds: 120, paths: [], sessionLabels: [], calendarNote: "Note", calendarLabels: []), ReportDay(date: "2026-09-08", totalSeconds: 120, paths: [ReportCategory(id: nil, label: "A", seconds: 60, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: [])], paths: [], sessionLabels: [], calendarLabels: [], sankey: nil)
        let displayed = report.days.filter { $0.paths.reduce(Int64(0), { $0 + $1.seconds }) > 0 }
        XCTAssertEqual(displayed.map { $0.date }, ["2026-09-08"])
    }

    func testModelCachesSuccessRetainsQueryOnFailureAndSignsOutClearsCache() async {
        let stub = Stub(); let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")); await model.load(); XCTAssertTrue(model.loaded); await model.load(); XCTAssertEqual(stub.reportQueries.count, 1)
        stub.failure = APIError.offline; await model.retry(); XCTAssertNotNil(model.report); XCTAssertEqual(model.query.startDate, "2026-09-07"); model.signOut(); XCTAssertNil(model.report)
        XCTAssertFalse(model.loaded)
    }

    func testTimeoutUsesRecoverableTimeoutCopyWithoutSigningOut() async {
        var signedOut = false; let model = ReportsModel(transport: TimeoutStub(), unauthorized: { signedOut = true }); await model.load()
        XCTAssertEqual(model.error, "The report took too long to load."); XCTAssertFalse(signedOut); XCTAssertNil(model.report)
    }

    func testAllNamedPresetsReturnCompleteExpectedRanges() {
        let c = calendar(); let now = c.date(from: DateComponents(year: 2026, month: 9, day: 13))!
        let expected: [(String, String, String)] = [
            ("Today", "2026-09-13", "2026-09-13"),
            ("Yesterday", "2026-09-12", "2026-09-12"),
            ("Week", "2026-09-07", "2026-09-13"),
            ("Last week", "2026-08-31", "2026-09-06"),
            ("Past two weeks", "2026-08-31", "2026-09-13"),
            ("Month", "2026-09-01", "2026-09-30"),
            ("Last month", "2026-08-01", "2026-08-31"),
            ("Quarter", "2026-07-01", "2026-09-30"),
            ("Last quarter", "2026-04-01", "2026-06-30"),
            ("Year", "2026-01-01", "2026-12-31"),
            ("Last year", "2025-01-01", "2025-12-31")
        ]
        for (name, start, end) in expected { XCTAssertEqual(ReportDateMath.preset(name, now: now, calendar: c)?.0, start); XCTAssertEqual(ReportDateMath.preset(name, now: now, calendar: c)?.1, end) }
    }

    func testReportCodableRoundTripPreservesCalendarAndSankeyDetails() async throws {
        let fixture = ReportsFixture(arguments: ["-ui-testing-authenticated", "-reports-calendar", "-reports-sankey"])
        let report = try await fixture.report(query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13"))
        let decoded = try JSONDecoder().decode(Report.self, from: JSONEncoder().encode(report))
        XCTAssertEqual(decoded, report); XCTAssertEqual(decoded.days[2].calendarLabels.count, 2); XCTAssertEqual(decoded.sankey?.links.count, 1)
    }

    func testNormalizedServerBoundariesBecomeTheDisplayedQuery() async {
        let stub = Stub(); stub.reportValue = Report(period: "CUSTOM", from: "2026-09-08", to: "2026-09-12", totalSeconds: 60, days: stub.reportValue.days, paths: stub.reportValue.paths, sessionLabels: [], calendarLabels: [], sankey: nil)
        let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")); await model.load()
        XCTAssertEqual(model.query.startDate, "2026-09-08"); XCTAssertEqual(model.query.endDate, "2026-09-12"); XCTAssertEqual(stub.reportQueries.count, 1)
    }

    func testEquivalentLoadsDoNotStartDuplicateInFlightRequests() async {
        final class SlowStub: Stub {
            override init() { super.init() }
            override func report(query: ReportQuery) async throws -> Report { try await Task.sleep(for: .milliseconds(40)); return try await super.report(query: query) }
        }
        let stub = SlowStub(); let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")); let first = Task { await model.load() }; try? await Task.sleep(for: .milliseconds(5)); await model.load(); await first.value
        XCTAssertEqual(stub.reportQueries.count, 1)
    }

    func testFixtureHonorsRepeatedPathAndLabelFiltersWithoutAccountAccess() async throws {
        let fixture = ReportsFixture(arguments: ["-reports-filtered"])
        let query = ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13", pathIDs: [UUID(uuidString: "00000000-0000-0000-0000-000000000002")!])
        let report = try await fixture.report(query: query)
        XCTAssertEqual(report.paths.map(\.label), ["Writing"])
        XCTAssertEqual(report.days.filter { !$0.paths.isEmpty }.count, 1)
        let labelQuery = ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13", labelIDs: [UUID(uuidString: "00000000-0000-0000-0000-000000000012")!])
        let labelReport = try await fixture.report(query: labelQuery)
        XCTAssertEqual(labelReport.totalSeconds, 0)
    }
}
