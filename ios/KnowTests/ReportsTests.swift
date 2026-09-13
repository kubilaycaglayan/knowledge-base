import XCTest
@testable import Know

private final class ReportsURLProtocolStub: URLProtocol {
    static var responseData = Data()
    static var requests: [URLRequest] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requests.append(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor final class ReportsTests: XCTestCase {
    class Stub: ReportsTransport {
        var reportValue: Report; var reportQueries: [ReportQuery] = []; var failure: Error?; var pathsValue: [Path] = []; var labelsValue: [KBLabel] = []; var pathCalls = 0; var labelCalls = 0; var echoQueryBoundaries = false
        init() { reportValue = Report(period: "CUSTOM", from: "2026-09-07", to: "2026-09-13", totalSeconds: 3600, days: [ReportDay(date: "2026-09-07", totalSeconds: 3600, paths: [ReportCategory(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001"), label: "Research", seconds: 3600, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: [])], paths: [ReportCategory(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001"), label: "Research", seconds: 3600, color: nil)], sessionLabels: [], calendarLabels: [], sankey: nil) }
        func report(query: ReportQuery) async throws -> Report { reportQueries.append(query); if let failure { throw failure }; guard echoQueryBoundaries else { return reportValue }; return Report(period: reportValue.period, from: query.startDate, to: query.endDate, totalSeconds: reportValue.totalSeconds, days: reportValue.days, paths: reportValue.paths, sessionLabels: reportValue.sessionLabels, calendarLabels: reportValue.calendarLabels, sankey: reportValue.sankey) }
        func paths() async throws -> [Path] { pathCalls += 1; return pathsValue }
        func labels() async throws -> [KBLabel] { labelCalls += 1; return labelsValue }
    }
    final class TimeoutStub: ReportsTransport {
        func report(query: ReportQuery) async throws -> Report { throw ReportLoadError.timeout }
        func paths() async throws -> [Path] { [] }
        func labels() async throws -> [KBLabel] { [] }
    }
    private func calendar() -> Calendar { var c = Calendar(identifier: .gregorian); c.locale = Locale(identifier: "en_US_POSIX"); c.timeZone = TimeZone(identifier: "Europe/Istanbul")!; return c }

    func testDefaultAndAllPresetsUseInclusiveLocalDates() {
        let c = calendar(); let now = c.date(from: DateComponents(year: 2026, month: 9, day: 13))!
        let defaultQuery = ReportDateMath.defaultQuery(now: now, calendar: c); XCTAssertEqual(defaultQuery.aggregation, .day); XCTAssertEqual(defaultQuery.startDate, "2026-09-07"); XCTAssertEqual(defaultQuery.endDate, "2026-09-13")
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

    func testReportsAPIUsesBearerAndReadOnlyScopedContracts() async throws {
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [ReportsURLProtocolStub.self]
        let client = APIClient(base: URL(string: "https://example.test/api/v1")!, session: URLSession(configuration: configuration)); ReportsURLProtocolStub.requests = []
        let report = Report(period: "CUSTOM", from: "2026-09-07", to: "2026-09-13", totalSeconds: 0, days: [], paths: [], sessionLabels: [], calendarLabels: [], sankey: nil)
        ReportsURLProtocolStub.responseData = try JSONEncoder().encode(report)
        let pathID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!; let labelID = UUID(uuidString: "00000000-0000-0000-0000-000000000011")!
        _ = try await ReportsAPI(client: client, token: "report-token").report(query: ReportQuery(startDate: report.from, endDate: report.to, pathIDs: [pathID], labelIDs: [labelID]))
        ReportsURLProtocolStub.responseData = Data("[]".utf8); _ = try await ReportsAPI(client: client, token: "report-token").paths(); _ = try await ReportsAPI(client: client, token: "report-token").labels()
        XCTAssertEqual(ReportsURLProtocolStub.requests.count, 3)
        let reportRequest = try XCTUnwrap(ReportsURLProtocolStub.requests[0]); XCTAssertEqual(reportRequest.httpMethod, "GET"); XCTAssertEqual(reportRequest.value(forHTTPHeaderField: "Authorization"), "Bearer report-token"); XCTAssertTrue(reportRequest.url?.path == "/api/v1/reports"); XCTAssertTrue(reportRequest.url?.query?.contains("pathId=\(pathID.uuidString)") == true); XCTAssertTrue(reportRequest.url?.query?.contains("labelId=\(labelID.uuidString)") == true)
        let pathsRequest = try XCTUnwrap(ReportsURLProtocolStub.requests[1]); XCTAssertEqual(pathsRequest.url?.path, "/api/v1/paths"); XCTAssertEqual(pathsRequest.httpMethod, "GET")
        let labelsRequest = try XCTUnwrap(ReportsURLProtocolStub.requests[2]); XCTAssertEqual(labelsRequest.url?.path, "/api/v1/labels"); XCTAssertEqual(labelsRequest.url?.query, "scope=TIME_ENTRY"); XCTAssertEqual(labelsRequest.httpMethod, "GET"); XCTAssertEqual(labelsRequest.value(forHTTPHeaderField: "Authorization"), "Bearer report-token")
    }

    func testShiftPreservesPresentationIndependentQueryValues() {
        let q = ReportQuery(startDate: "2026-02-23", endDate: "2026-03-01", aggregation: .week)
        XCTAssertEqual(ReportDateMath.shifted(q, by: -1, calendar: calendar())?.startDate, "2026-02-16")
        XCTAssertEqual(ReportDateMath.shifted(q, by: 1, calendar: calendar())?.endDate, "2026-03-08")
    }

    func testShiftPreservesFiltersAndPresentationState() async {
        let path = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!; let label = UUID(uuidString: "00000000-0000-0000-0000-000000000011")!
        let stub = Stub(); let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13", aggregation: .week, pathIDs: [path], labelIDs: [label])); model.trendline = .parabolic; model.showSankey = true; model.showCalendarInputs = false; await model.shift(1, calendar: calendar())
        XCTAssertEqual(model.query.pathIDs, [path]); XCTAssertEqual(model.query.labelIDs, [label]); XCTAssertEqual(model.query.aggregation, .week); XCTAssertEqual(model.trendline, .parabolic); XCTAssertTrue(model.showSankey); XCTAssertFalse(model.showCalendarInputs)
    }

    func testRangeValidationRejectsIncompleteReversedAndOverlongWithoutLoading() async {
        let stub = Stub(); let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")); await model.setRange(start: nil, end: "2026-09-13"); XCTAssertTrue(stub.reportQueries.isEmpty)
        await model.setRange(start: "2026-09-14", end: "2026-09-13"); XCTAssertEqual(model.rangeError, "End date must be on or after start date.")
        await model.setRange(start: "2026-01-01", end: "2028-01-02"); XCTAssertEqual(model.rangeError, "Report range cannot exceed two years."); XCTAssertEqual(model.query.startDate, "2026-09-07")
    }

    func testUnchangedRangeAndAggregationDoNotStartRedundantLoads() async {
        let stub = Stub(); let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")); await model.load(); let count = stub.reportQueries.count
        await model.setRange(start: "2026-09-07", end: "2026-09-13"); await model.setAggregation(.day)
        XCTAssertEqual(stub.reportQueries.count, count)
    }

    func testPresentationOnlyChangesDoNotStartReportLoads() async {
        let stub = Stub(); let model = ReportsModel(transport: stub); await model.load(); let count = stub.reportQueries.count
        model.trendline = .linear; model.showSankey = true; model.showCalendarInputs = false; model.breakdown = .labels
        XCTAssertEqual(stub.reportQueries.count, count)
    }

    func testAggregationPresetsResetExpectedRangesAndYearKeepsCurrentRange() async {
        let c = calendar(); let now = c.date(from: DateComponents(year: 2026, month: 9, day: 13))!
        let stub = Stub(); stub.echoQueryBoundaries = true; let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-08-01", endDate: "2026-08-10"))
        await model.setAggregation(.week, now: now, calendar: c)
        XCTAssertEqual(model.query.startDate, "2026-08-15"); XCTAssertEqual(model.query.endDate, "2026-09-13")
        await model.setAggregation(.month, now: now, calendar: c)
        XCTAssertEqual(model.query.startDate, "2025-09-13"); XCTAssertEqual(model.query.endDate, "2026-09-13")
        await model.setAggregation(.quarter, now: now, calendar: c)
        XCTAssertEqual(model.query.startDate, "2024-09-13"); XCTAssertEqual(model.query.endDate, "2026-09-13")
        await model.setAggregation(.year, now: now, calendar: c)
        XCTAssertEqual(model.query.startDate, "2024-09-13"); XCTAssertEqual(model.query.endDate, "2026-09-13")
        await model.setAggregation(.day, now: now, calendar: c)
        XCTAssertEqual(model.query.startDate, "2026-09-07"); XCTAssertEqual(model.query.endDate, "2026-09-13")
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

    func testBucketsUseNaturalMonthQuarterAndYearBoundaries() {
        let days = [
            ReportDay(date: "2026-01-31", totalSeconds: 60, paths: [ReportCategory(id: nil, label: "A", seconds: 60, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: []),
            ReportDay(date: "2026-02-01", totalSeconds: 120, paths: [ReportCategory(id: nil, label: "A", seconds: 120, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: []),
            ReportDay(date: "2026-04-01", totalSeconds: 180, paths: [ReportCategory(id: nil, label: "A", seconds: 180, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: [])
        ]
        let report = Report(period: "CUSTOM", from: "2026-01-31", to: "2026-04-01", totalSeconds: 360, days: days, paths: [], sessionLabels: [], calendarLabels: [], sankey: nil)
        let month = ReportCalculations.buckets(report, query: ReportQuery(startDate: report.from, endDate: report.to, aggregation: .month), calendar: calendar())
        let quarter = ReportCalculations.buckets(report, query: ReportQuery(startDate: report.from, endDate: report.to, aggregation: .quarter), calendar: calendar())
        let year = ReportCalculations.buckets(report, query: ReportQuery(startDate: report.from, endDate: report.to, aggregation: .year), calendar: calendar())
        XCTAssertEqual(month.map(\.seconds), [60, 120, 180]); XCTAssertEqual(quarter.map(\.seconds), [180, 180]); XCTAssertEqual(year.map(\.seconds), [360])
    }

    func testPartialBoundaryBucketsRetainSemanticLabelsAndCategoryTotals() {
        let a = UUID(uuidString: "00000000-0000-0000-0000-000000000041")!
        let days = [
            ReportDay(date: "2026-09-30", totalSeconds: 90, paths: [ReportCategory(id: a, label: "Research", seconds: 90, color: "#2878D5")], sessionLabels: [], calendarNote: nil, calendarLabels: []),
            ReportDay(date: "2026-10-01", totalSeconds: 30, paths: [ReportCategory(id: a, label: "Research", seconds: 30, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: [])
        ]
        let report = Report(period: "CUSTOM", from: "2026-09-30", to: "2026-10-01", totalSeconds: 120, days: days, paths: [ReportCategory(id: a, label: "Research", seconds: 120, color: "#2878D5")], sessionLabels: [], calendarLabels: [], sankey: nil)
        let buckets = ReportCalculations.buckets(report, query: ReportQuery(startDate: report.from, endDate: report.to, aggregation: .month), calendar: calendar())
        XCTAssertEqual(buckets.map(\.id), ["2026-09-01", "2026-10-01"]); XCTAssertEqual(buckets.map(\.seconds), [90, 30]); XCTAssertEqual(buckets.map { $0.categories.reduce(0) { $0 + $1.seconds } }, [90, 30]); XCTAssertEqual(buckets.first?.categories.first?.color, "#2878D5")
    }

    func testLocalDateShiftsAcrossDaylightSavingByCalendarDays() {
        var c = Calendar(identifier: .gregorian); c.locale = Locale(identifier: "en_US_POSIX"); c.timeZone = TimeZone(identifier: "America/New_York")!
        let query = ReportQuery(startDate: "2026-03-08", endDate: "2026-03-14")
        XCTAssertEqual(ReportDateMath.shifted(query, by: -1, calendar: c)?.startDate, "2026-03-01")
        XCTAssertEqual(ReportDateMath.shifted(query, by: 1, calendar: c)?.endDate, "2026-03-21")
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

    func testReferenceOptionsUseTimeEntryScopeAndFallBackToReportCategories() async {
        let stub = Stub()
        let pathID = UUID(uuidString: "00000000-0000-0000-0000-000000000031")!
        let timeID = UUID(uuidString: "00000000-0000-0000-0000-000000000032")!
        let calendarID = UUID(uuidString: "00000000-0000-0000-0000-000000000033")!
        stub.pathsValue = [Path(id: pathID, name: "Owned", description: nil, status: "ACTIVE", color: nil)]
        stub.labelsValue = [KBLabel(id: timeID, name: "Time", color: nil, scopes: [.timeEntry]), KBLabel(id: calendarID, name: "Calendar", color: nil, scopes: [.calendar])]
        await ReportsModel(transport: stub).load()
        let model = ReportsModel(transport: stub); await model.load()
        XCTAssertEqual(model.pathOptions.map(\.name), ["Owned"]); XCTAssertEqual(model.labelOptions.map(\.name), ["Time"])

        let fallback = Stub(); fallback.reportValue = Report(period: "CUSTOM", from: "2026-09-07", to: "2026-09-13", totalSeconds: 60, days: stub.reportValue.days, paths: [ReportCategory(id: pathID, label: "Fallback path", seconds: 60, color: nil)], sessionLabels: [ReportCategory(id: timeID, label: "Fallback label", seconds: 60, color: nil)], calendarLabels: [], sankey: nil)
        let fallbackModel = ReportsModel(transport: fallback); await fallbackModel.load()
        XCTAssertEqual(fallbackModel.pathOptions.map(\.name), ["Fallback path"]); XCTAssertEqual(fallbackModel.labelOptions.map(\.name), ["Fallback label"])
    }

    func testMalformedReportIsRejectedAsRecoverableError() async {
        let stub = Stub(); stub.reportValue = Report(period: "CUSTOM", from: "2026-09-07", to: "2026-09-13", totalSeconds: 60, days: [], paths: [ReportCategory(id: UUID(), label: "Unexpected", seconds: 60, color: nil)], sessionLabels: [], calendarLabels: [], sankey: nil)
        let model = ReportsModel(transport: stub); await model.load()
        XCTAssertFalse(model.loaded); XCTAssertNil(model.report); XCTAssertEqual(model.error, "Unable to load the report. Please try again.")
    }

    func testTimeoutUsesRecoverableTimeoutCopyWithoutSigningOut() async {
        var signedOut = false; let model = ReportsModel(transport: TimeoutStub(), unauthorized: { signedOut = true }); await model.load()
        XCTAssertEqual(model.error, "The report took too long to load."); XCTAssertFalse(signedOut); XCTAssertNil(model.report)
    }

    func testCurrentReportUnauthorizedResponseUsesRecoveryCallback() async {
        var signedOut = false; let stub = Stub(); stub.failure = APIError.unauthorized; let model = ReportsModel(transport: stub, unauthorized: { signedOut = true }); await model.load()
        XCTAssertTrue(signedOut); XCTAssertNil(model.report); XCTAssertNil(model.error)
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
        XCTAssertEqual(decoded.sankey?.nodes.map(\.id), ["research", "deep-work"]); XCTAssertEqual(decoded.sankey?.nodes.map(\.depth), [0, 1]); XCTAssertEqual(decoded.sankey?.nodes.map(\.value), [3_600, 3_600]); XCTAssertEqual(decoded.sankey?.links.first?.source, "research"); XCTAssertEqual(decoded.sankey?.links.first?.target, "deep-work"); XCTAssertEqual(decoded.sankey?.links.first?.value, 3_600)
    }

    func testFixtureCalendarNoteOnlyAndFractionalPortionsRemainDistinct() async throws {
        let query = ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")
        let noteOnly = try await ReportsFixture(arguments: ["-reports-calendar-note-only"]).report(query: query)
        XCTAssertEqual(noteOnly.days[2].calendarNote, "Planning day\nReview the weekly priorities."); XCTAssertTrue(noteOnly.days[2].calendarLabels.isEmpty)
        let fractions = try await ReportsFixture(arguments: ["-reports-calendar-fractions"]).report(query: query)
        XCTAssertEqual(fractions.days[2].calendarLabels.compactMap(\.portion), [Decimal(string: "0.25")!, Decimal(string: "0.50")!, Decimal(string: "0.75")!, Decimal(string: "1.00")!]); XCTAssertEqual(Set(fractions.days[2].calendarLabels.map(\.label)).count, 4)
    }

    func testFixtureLongZeroAndSparseIntervalsRemainStructurallyValid() async throws {
        let query = ReportQuery(startDate: "2026-09-07", endDate: "2026-11-05")
        let long = try await ReportsFixture(arguments: ["-reports-long-range"]).report(query: query)
        XCTAssertEqual(long.days.count, 60); XCTAssertEqual(long.days.first?.date, "2026-09-07"); XCTAssertEqual(long.days.last?.date, "2026-11-05")
        let zero = try await ReportsFixture(arguments: ["-reports-zero"]).report(query: query)
        XCTAssertEqual(zero.days.count, 7); XCTAssertTrue(zero.days.allSatisfy { $0.paths.isEmpty }); XCTAssertEqual(zero.totalSeconds, 0)
        let sparse = try await ReportsFixture(arguments: ["-reports-sparse"]).report(query: query)
        XCTAssertEqual(sparse.days.filter { !$0.paths.isEmpty }.count, 1); XCTAssertGreaterThan(sparse.totalSeconds, 0)
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

    func testFirstActivationLoadsReportAndReferencesOnce() async {
        let stub = Stub(); let model = ReportsModel(transport: stub); await model.load(); await model.load()
        XCTAssertEqual(stub.reportQueries.count, 1); XCTAssertEqual(stub.pathCalls, 1); XCTAssertEqual(stub.labelCalls, 1)
    }

    func testOlderRangeCompletionCannotReplaceNewerReport() async {
        final class RaceStub: ReportsTransport {
            var queries: [ReportQuery] = []
            func report(query: ReportQuery) async throws -> Report {
                queries.append(query)
                try await Task.sleep(for: query.startDate == "2026-09-07" ? .milliseconds(80) : .milliseconds(5))
                return Report(period: "CUSTOM", from: query.startDate, to: query.endDate, totalSeconds: 60, days: [ReportDay(date: query.startDate, totalSeconds: 60, paths: [ReportCategory(id: nil, label: query.startDate, seconds: 60, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: [])], paths: [ReportCategory(id: nil, label: query.startDate, seconds: 60, color: nil)], sessionLabels: [], calendarLabels: [], sankey: nil)
            }
            func paths() async throws -> [Path] { [] }
            func labels() async throws -> [KBLabel] { [] }
        }
        let stub = RaceStub(); let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")); let first = Task { await model.load() }
        try? await Task.sleep(for: .milliseconds(10)); await model.setRange(start: "2026-09-08", end: "2026-09-13"); await first.value
        XCTAssertEqual(stub.queries.count, 2); XCTAssertEqual(model.query.startDate, "2026-09-08"); XCTAssertEqual(model.report?.from, "2026-09-08"); XCTAssertEqual(model.report?.paths.first?.label, "2026-09-08")
    }

    func testRefreshRetainsVisibleReportWhileFailureIsInFlightAndAfterwards() async {
        final class RefreshStub: Stub {
            var delay: Duration = .zero
            override func report(query: ReportQuery) async throws -> Report { if delay != .zero { try await Task.sleep(for: delay) }; return try await super.report(query: query) }
        }
        let stub = RefreshStub(); let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")); await model.load()
        stub.failure = APIError.offline; stub.delay = .milliseconds(40)
        let refresh = Task { await model.retry() }; try? await Task.sleep(for: .milliseconds(5))
        XCTAssertTrue(model.refreshing); XCTAssertNotNil(model.report)
        await refresh.value
        XCTAssertFalse(model.refreshing); XCTAssertNotNil(model.report); XCTAssertEqual(model.error, "Unable to load the report. Please try again.")
    }

    func testFilterChangeRetainsVisibleReportDuringMatchingRefresh() async {
        final class FilterStub: Stub {
            var delay: Duration = .zero
            override func report(query: ReportQuery) async throws -> Report { if delay != .zero { try await Task.sleep(for: delay) }; return try await super.report(query: query) }
        }
        let stub = FilterStub(); let model = ReportsModel(transport: stub); await model.load(); stub.delay = .milliseconds(50)
        let update = Task { await model.togglePath(UUID(uuidString: "00000000-0000-0000-0000-000000000001")!) }
        try? await Task.sleep(for: .milliseconds(8)); XCTAssertTrue(model.refreshing); XCTAssertNotNil(model.report); await update.value
        XCTAssertFalse(model.refreshing); XCTAssertNotNil(model.report); XCTAssertEqual(model.query.pathIDs.count, 1)
    }

    func testFixtureHonorsRepeatedPathAndLabelFiltersWithoutAccountAccess() async throws {
        let fixture = ReportsFixture(arguments: ["-reports-filtered"])
        let research = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!; let writing = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!; let deepWork = UUID(uuidString: "00000000-0000-0000-0000-000000000011")!; let planning = UUID(uuidString: "00000000-0000-0000-0000-000000000012")!
        let query = ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13", pathIDs: [writing])
        let report = try await fixture.report(query: query)
        XCTAssertEqual(report.paths.map(\.label), ["Writing"])
        XCTAssertEqual(report.days.filter { !$0.paths.isEmpty }.count, 1); XCTAssertTrue(report.days.flatMap(\.paths).allSatisfy { $0.id == writing }); XCTAssertFalse(report.days.flatMap(\.paths).contains { $0.id == research })
        let bothPaths = try await fixture.report(query: ReportQuery(startDate: query.startDate, endDate: query.endDate, pathIDs: [research, writing]))
        XCTAssertEqual(Set(bothPaths.paths.compactMap(\.id)), Set([research, writing]))
        let labelQuery = ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13", labelIDs: [planning])
        let labelReport = try await fixture.report(query: labelQuery)
        XCTAssertEqual(labelReport.totalSeconds, 0)
        let matching = try await fixture.report(query: ReportQuery(startDate: query.startDate, endDate: query.endDate, pathIDs: [research], labelIDs: [deepWork]))
        XCTAssertTrue(matching.paths.allSatisfy { $0.id == research }); XCTAssertGreaterThan(matching.totalSeconds, 0); XCTAssertEqual(matching.totalSeconds, matching.days.flatMap(\.paths).reduce(0) { $0 + $1.seconds })
    }
}
