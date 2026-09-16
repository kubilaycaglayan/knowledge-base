import XCTest

@testable import Know

@MainActor final class LabelsTests: XCTestCase {
  final class Stub: LabelsTransport {
    var values = [
      KBLabel(id: UUID(), name: "zeta", color: nil, scopes: [.log]),
      KBLabel(id: UUID(), name: "Alpha", color: "#2878D5", scopes: [.note, .calendar]),
    ]
    var failure: Error?
    var removed: [(UUID, Bool)] = []
    func list() async throws -> [KBLabel] {
      if let failure { throw failure }
      return values
    }
    func create(_ draft: LabelDraft) async throws -> KBLabel {
      if let failure { throw failure }
      return KBLabel(id: UUID(), name: draft.name, color: draft.color, scopes: Array(draft.scopes))
    }
    func update(id: UUID, draft: LabelDraft) async throws -> KBLabel {
      if let failure { throw failure }
      return KBLabel(id: id, name: draft.name, color: draft.color, scopes: Array(draft.scopes))
    }
    func remove(id: UUID, removeAssignments: Bool) async throws {
      removed.append((id, removeAssignments))
      if let failure { throw failure }
    }
  }

  func testCodableAndLocalizedSorting() async {
    let stub = Stub()
    let model = LabelsModel(transport: stub)
    await model.load()
    XCTAssertEqual(model.sortedLabels.map(\.name), ["Alpha", "zeta"])
    let data = try! JSONEncoder().encode(stub.values[0])
    XCTAssertEqual(try! JSONDecoder().decode(KBLabel.self, from: data), stub.values[0])
    let legacy = try! JSONDecoder().decode(
      KBLabel.self,
      from: Data(
        "{\"id\":\"00000000-0000-4000-8000-000000000010\",\"name\":\"Legacy\",\"color\":null,\"scopes\":[\"CALENDAR\"]}"
          .utf8))
    XCTAssertFalse(legacy.system)
  }

  func testNewLabelUsesFirstSharedPaletteColorAndHidesCalendarByDefault() {
    XCTAssertEqual(LabelDraft().color, WorkspaceTheme.palette[0])
    XCTAssertEqual(LabelDraft().scopes, [.note, .timeEntry, .log])
  }

  func testCreateTrimsAndRetainsDraftOnFailure() async {
    let stub = Stub()
    stub.failure = APIError.offline
    let model = LabelsModel(transport: stub)
    model.draft.name = "  Deep work  "
    model.draft.scopes = [.timeEntry]
    let created = await model.create()
    let retained = model.draft.name
    let message = model.error
    XCTAssertFalse(created)
    XCTAssertEqual(retained, "  Deep work  ")
    XCTAssertEqual(message, "No network connection. Reconnect and try again.")
  }

  func testValidationRequiresNameButAllowsAHiddenEverywhereLabel() async {
    let model = LabelsModel(transport: Stub())
    model.draft.name = "  "
    model.draft.scopes = []
    let created = await model.create()
    let message = model.error
    XCTAssertFalse(created)
    XCTAssertEqual(message, "Enter a name.")

    model.draft.name = "Private"
    model.draft.scopes = []
    let hiddenCreated = await model.create()
    XCTAssertTrue(hiddenCreated)
    XCTAssertEqual(model.labels.last?.scopes, [])
  }

  func testEditFailureRetainsDraftAndDeleteUsesSecondConfirmationPath() async {
    let stub = Stub()
    let model = LabelsModel(transport: stub)
    await model.load()
    let label = stub.values[0]
    model.beginEdit(label)
    model.editingDraft?.name = "Changed"
    stub.failure = APIError.offline
    let saved = await model.saveEdit()
    let retained = model.editingDraft?.name
    XCTAssertFalse(saved)
    XCTAssertEqual(retained, "Changed")
    stub.failure = APIError.http(status: 409, message: nil)
    model.requestRemove(label)
    await model.confirmRemove()
    let candidate = model.deleteAssignmentsCandidate?.id
    XCTAssertEqual(candidate, label.id)
    stub.failure = nil
    await model.confirmRemoveAssignments()
    let removed = stub.removed.map(\.1)
    let exists = model.labels.contains { $0.id == label.id }
    XCTAssertEqual(removed, [false, true])
    XCTAssertFalse(exists)
  }

  func testUnauthorizedCallsSignOutAndMutationsInvalidateReports() async {
    let stub = Stub()
    var signedOut = false
    var invalidated = 0
    let model = LabelsModel(
      transport: stub, unauthorized: { signedOut = true }, invalidateReports: { invalidated += 1 })
    await model.load()
    model.draft.name = "Unauthorized"
    stub.failure = APIError.unauthorized
    _ = await model.create()
    XCTAssertTrue(signedOut)
    stub.failure = nil
    model.draft.name = "New"
    _ = await model.create()
    XCTAssertEqual(invalidated, 1)
  }
}
