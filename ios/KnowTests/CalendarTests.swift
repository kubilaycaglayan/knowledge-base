import XCTest
@testable import Know

@MainActor final class CalendarTests: XCTestCase {
    final class Stub: CalendarTransport {
        var labelsValue = [KBLabel(id: UUID(), name: "Work", color: "#2878D5", scopes: [.calendar])]
        var daysValue: [CalendarDay] = []
        var failure: Error?
        var dayRequests: [(String, CalendarDayRequest)] = []
        var rangeRequests: [CalendarRangeRequest] = []
        var loadedDayRanges: [(String, String)] = []
        var loads = 0
        func labels() async throws -> [KBLabel] { if let failure { throw failure }; loads += 1; return labelsValue }
        func days(startDate: String, endDate: String) async throws -> [CalendarDay] { if let failure { throw failure }; loads += 1; loadedDayRanges.append((startDate, endDate)); return daysValue }
        func saveDay(date: String, request: CalendarDayRequest) async throws -> CalendarDay { if let failure { throw failure }; dayRequests.append((date, request)); return CalendarDay(date: date, note: request.note, labels: request.labels.map { CalendarAssignment(labelId: $0.labelId, name: "Work", color: "#2878D5", portion: $0.portion) }) }
        func saveRange(request: CalendarRangeRequest) async throws -> [CalendarDay] { if let failure { throw failure }; rangeRequests.append(request); return [] }
        func createLabel(name: String, color: String) async throws -> KBLabel { KBLabel(id: UUID(), name: name, color: color, scopes: [.calendar]) }
        func updateLabel(_ label: KBLabel) async throws -> KBLabel { label }
    }

    final class DelayedStub: CalendarTransport, @unchecked Sendable {
        private let lock = NSLock(); private var dayCall = 0; private var saveCall = 0
        let label = KBLabel(id: UUID(), name: "Work", color: "#2878D5", scopes: [.calendar])
        func labels() async throws -> [KBLabel] { [label] }
        func days(startDate: String, endDate: String) async throws -> [CalendarDay] {
            let call = nextDayCall()
            try await Task.sleep(nanoseconds: call == 1 ? 80_000_000 : 5_000_000)
            return [CalendarDay(date: startDate, note: call == 1 ? "Stale" : "Current", labels: [])]
        }
        func saveDay(date: String, request: CalendarDayRequest) async throws -> CalendarDay {
            incrementSaveCall(); try await Task.sleep(nanoseconds: 50_000_000)
            return CalendarDay(date: date, note: request.note, labels: [])
        }
        func saveRange(request: CalendarRangeRequest) async throws -> [CalendarDay] { [] }
        func createLabel(name: String, color: String) async throws -> KBLabel { label }
        func updateLabel(_ label: KBLabel) async throws -> KBLabel { label }
        var saves: Int { lock.lock(); defer { lock.unlock() }; return saveCall }
        private func nextDayCall() -> Int { lock.lock(); defer { lock.unlock() }; dayCall += 1; return dayCall }
        private func incrementSaveCall() { lock.lock(); defer { lock.unlock() }; saveCall += 1 }
    }

    private func calendar(_ zone: String = "Europe/Istanbul") -> Calendar { var value = Calendar(identifier: .gregorian); value.locale = Locale(identifier: "en_US_POSIX"); value.timeZone = TimeZone(identifier: zone)!; return value }

    func testMondayFirstGridHasSixWeeksAndAdjacentDays() {
        let cal = calendar(); let date = cal.date(from: DateComponents(year: 2026, month: 9, day: 13))!
        let dates = CalendarGrid.monthDates(month: date, calendar: cal)
        XCTAssertEqual(dates.count, 35)
        XCTAssertEqual(CalendarDate.string(dates.first!, calendar: cal), "2026-08-31")
        XCTAssertEqual(CalendarDate.string(dates.last!, calendar: cal), "2026-10-04")
    }

    func testLocalDateRoundTripDoesNotUseUTCInstant() {
        let cal = calendar("America/New_York"); let date = cal.date(from: DateComponents(year: 2026, month: 3, day: 8))!
        XCTAssertEqual(CalendarDate.string(date, calendar: cal), "2026-03-08")
        XCTAssertEqual(CalendarDate.string(cal.date(byAdding: .day, value: 1, to: date)!, calendar: cal), "2026-03-09")
    }

    func testCodablePreservesNullableNoteColorAndPortions() throws {
        let id = UUID(); let day = CalendarDay(date: "2026-09-03", note: nil, labels: [CalendarAssignment(labelId: id, name: "Work", color: nil, portion: 0.75)])
        let decoded = try JSONDecoder().decode(CalendarDay.self, from: JSONEncoder().encode(day))
        XCTAssertEqual(decoded, day); XCTAssertEqual(decoded.labels[0].portionTitle, "¾ day")
        let request = CalendarDayRequest(note: nil, labels: [CalendarDayAssignment(labelId: id, portion: nil)])
        let encoded = String(data: try! JSONEncoder().encode(request), encoding: .utf8)!
        XCTAssertTrue(encoded.contains("\"note\":null"))
    }

    func testLoadHydratesDraftAndReusesCachedRange() async {
        let stub = Stub(); let id = stub.labelsValue[0].id
        stub.daysValue = [CalendarDay(date: "2026-09-03", note: "Saved", labels: [CalendarAssignment(labelId: id, name: "Work", color: nil, portion: 0.25)])]
        let cal = calendar(); let now = cal.date(from: DateComponents(year: 2026, month: 9, day: 3))!
        let model = CalendarModel(transport: stub, now: now, calendar: cal); await model.load(); XCTAssertEqual(stub.loadedDayRanges.first?.0, "2026-09-01"); XCTAssertEqual(stub.loadedDayRanges.first?.1, "2026-09-30"); XCTAssertEqual(model.note, "Saved"); XCTAssertEqual(model.selectedAssignments[id], .quarter); XCTAssertFalse(model.hasUnsavedDraft)
        let count = stub.loads; await model.load(); XCTAssertEqual(stub.loads, count)
    }

    func testRefreshPreservesDirtyDraftAndEmptyResponseClearsLoadedMonth() async {
        let stub = Stub(); let cal = calendar(); let now = cal.date(from: DateComponents(year: 2026, month: 9, day: 3))!
        stub.daysValue = [CalendarDay(date: "2026-09-03", note: "Saved", labels: [])]
        let model = CalendarModel(transport: stub, now: now, calendar: cal); await model.load(); model.note = "Unsaved"; stub.daysValue = []; await model.load(force: true)
        XCTAssertEqual(model.note, "Unsaved"); XCTAssertNil(model.days["2026-09-03"]); XCTAssertTrue(model.hasUnsavedDraft)
    }

    func testBlankNoteTrimsToNullAndPortionToggleSaves() async {
        let stub = Stub(); let model = CalendarModel(transport: stub, now: Date(), calendar: calendar()); model.note = "  \n "; let label = stub.labelsValue[0]; model.toggle(label); model.setPortion(.half, for: label)
        let saved = await model.save(); XCTAssertTrue(saved); XCTAssertEqual(stub.dayRequests[0].1.note, nil); XCTAssertEqual(stub.dayRequests[0].1.labels[0].portion, 0.50)
    }

    func testRangeNormalizesSameDayFallsBackAndRetainsDraftOnFailure() async {
        let stub = Stub(); let cal = calendar(); let a = cal.date(from: DateComponents(year: 2026, month: 9, day: 3))!; let b = cal.date(from: DateComponents(year: 2026, month: 9, day: 1))!
        let model = CalendarModel(transport: stub, now: a, calendar: cal); model.beginRange(a); XCTAssertTrue(model.selectingRange); let incomplete = await model.save(); XCTAssertFalse(incomplete); XCTAssertTrue(stub.dayRequests.isEmpty); model.select(b); XCTAssertEqual(CalendarDate.string(model.selectedDate, calendar: cal), "2026-09-01"); model.note = "Range note"; let firstSave = await model.save(); XCTAssertTrue(firstSave); XCTAssertEqual(stub.rangeRequests[0].startDate, "2026-09-01"); XCTAssertEqual(stub.rangeRequests[0].endDate, "2026-09-03"); XCTAssertEqual(CalendarDate.string(model.selectedDate, calendar: cal), "2026-09-01")
        model.beginRange(a); model.select(a); XCTAssertFalse(model.isRangeMode)
        stub.failure = APIError.offline; model.beginRange(a); model.select(b); model.note = "Keep me"; let failedSave = await model.save(); XCTAssertFalse(failedSave); XCTAssertEqual(model.note, "Keep me"); XCTAssertNotNil(model.error)
    }

    func testLabelCreateTrimsAndColorUpdateUsesFixedPalette() async {
        let stub = Stub(); let model = CalendarModel(transport: stub, calendar: calendar()); let created = await model.createLabel(name: "  Launch  ", color: WorkspaceTheme.palette[2])
        XCTAssertTrue(created); XCTAssertEqual(model.labels.last?.name, "Launch"); XCTAssertEqual(model.labels.last?.color, WorkspaceTheme.palette[2])
        let label = model.labels[0]; let recolored = await model.updateLabelColor(label, color: WorkspaceTheme.palette[4]); XCTAssertTrue(recolored); XCTAssertEqual(model.labels[0].color, WorkspaceTheme.palette[4]); let rejected = await model.updateLabelColor(label, color: "#not-a-palette-color"); XCTAssertFalse(rejected)
    }

    func testUnauthorizedLoadCallsSignOutAndMutationInvalidatesReports() async {
        let stub = Stub(); var signedOut = false; var invalidated = 0; let model = CalendarModel(transport: stub, calendar: calendar(), unauthorized: { signedOut = true }, invalidateReports: { invalidated += 1 })
        stub.failure = APIError.unauthorized; await model.load(); XCTAssertTrue(signedOut); stub.failure = nil; let created = await model.createLabel(name: "New"); XCTAssertTrue(created); XCTAssertEqual(invalidated, 1)
    }

    func testMonthChangeSelectsFirstDayAndCachedReturnHydratesIt() async {
        let stub = Stub(); let cal = calendar(); let september = cal.date(from: DateComponents(year: 2026, month: 9, day: 13))!; let augustFirst = cal.date(from: DateComponents(year: 2026, month: 8, day: 1))!
        stub.daysValue = [CalendarDay(date: "2026-08-01", note: "Month start", labels: [])]
        let model = CalendarModel(transport: stub, now: september, calendar: cal); await model.setMonth(augustFirst); XCTAssertEqual(model.note, "Month start")
        await model.setMonth(september); await model.setMonth(augustFirst); XCTAssertEqual(CalendarDate.string(model.selectedDate, calendar: cal), "2026-08-01"); XCTAssertEqual(model.note, "Month start")
    }

    func testNewerMonthSuppressesStaleLoadAndConcurrentSaveIsRejected() async {
        let stub = DelayedStub(); let cal = calendar(); let august = cal.date(from: DateComponents(year: 2026, month: 8, day: 1))!; let september = cal.date(from: DateComponents(year: 2026, month: 9, day: 1))!
        let model = CalendarModel(transport: stub, now: august, calendar: cal)
        let oldLoad = Task { await model.load() }; try? await Task.sleep(nanoseconds: 10_000_000); await model.setMonth(september); await oldLoad.value
        XCTAssertNil(model.days["2026-08-01"]); XCTAssertEqual(model.days["2026-09-01"]?.note, "Current"); XCTAssertEqual(model.note, "Current")
        model.note = "One"; async let first = model.save(); try? await Task.sleep(nanoseconds: 2_000_000); let second = await model.save(); let firstResult = await first
        XCTAssertTrue(firstResult); XCTAssertFalse(second); XCTAssertEqual(stub.saves, 1)
    }

    func testLoadingStateIsObservableUntilBothCalendarRequestsSettle() async {
        let stub = DelayedStub(); let model = CalendarModel(transport: stub, calendar: calendar())
        let task = Task { await model.load() }
        try? await Task.sleep(nanoseconds: 10_000_000)
        XCTAssertTrue(model.loading); await task.value; XCTAssertFalse(model.loading); XCTAssertTrue(model.loaded)
    }
}
