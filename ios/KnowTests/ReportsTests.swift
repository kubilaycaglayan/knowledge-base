import XCTest
@testable import Know

@MainActor final class ReportsTests: XCTestCase {
    final class Stub: ReportsTransport {
        var reportValue: Report; var reportQueries: [ReportQuery] = []; var failure: Error?
        init() { reportValue = Report(period: "CUSTOM", from: "2026-09-07", to: "2026-09-13", totalSeconds: 3600, days: [ReportDay(date: "2026-09-07", totalSeconds: 3600, paths: [ReportCategory(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001"), label: "Research", seconds: 3600, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: [])], paths: [ReportCategory(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001"), label: "Research", seconds: 3600, color: nil)], sessionLabels: [], calendarLabels: [], sankey: nil) }
        func report(query: ReportQuery) async throws -> Report { reportQueries.append(query); if let failure { throw failure }; return reportValue }
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

    func testBucketsRetainZeroDaysAndGroupMondayWeeks() {
        let report = Report(period: "CUSTOM", from: "2026-09-07", to: "2026-09-13", totalSeconds: 60, days: [ReportDay(date: "2026-09-07", totalSeconds: 60, paths: [ReportCategory(id: nil, label: "A", seconds: 60, color: nil)], sessionLabels: [], calendarNote: nil, calendarLabels: []), ReportDay(date: "2026-09-08", totalSeconds: 0, paths: [], sessionLabels: [], calendarNote: nil, calendarLabels: [])], paths: [ReportCategory(id: nil, label: "A", seconds: 60, color: nil)], sessionLabels: [], calendarLabels: [], sankey: nil)
        let buckets = ReportCalculations.buckets(report, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-08", aggregation: .day), calendar: calendar())
        XCTAssertEqual(buckets.count, 2); XCTAssertEqual(buckets[1].seconds, 0)
        XCTAssertEqual(ReportCalculations.buckets(report, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-08", aggregation: .week), calendar: calendar()).count, 1)
    }

    func testModelCachesSuccessRetainsQueryOnFailureAndSignsOutClearsCache() async {
        let stub = Stub(); let model = ReportsModel(transport: stub, query: ReportQuery(startDate: "2026-09-07", endDate: "2026-09-13")); await model.load(); await model.load(); XCTAssertEqual(stub.reportQueries.count, 1)
        stub.failure = APIError.offline; await model.retry(); XCTAssertNotNil(model.report); XCTAssertEqual(model.query.startDate, "2026-09-07"); model.signOut(); XCTAssertNil(model.report)
    }
}
