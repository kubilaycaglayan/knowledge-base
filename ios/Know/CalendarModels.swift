import Foundation

struct CalendarAssignment: Codable, Equatable, Identifiable {
  let labelId: UUID
  var name: String
  var color: String?
  var portion: Decimal?
  var id: UUID { labelId }

  var portionTitle: String {
    switch portion {
    case nil: return "Marker only"
    case 0.25: return "¼ day"
    case 0.50: return "½ day"
    case 0.75: return "¾ day"
    case 1.00: return "Full day"
    default: return "Marker only"
    }
  }
}

struct CalendarDay: Codable, Equatable, Identifiable {
  let date: String
  var note: String?
  var labels: [CalendarAssignment]
  var id: String { date }
}

struct CalendarDayAssignment: Codable, Equatable {
  let labelId: UUID
  let portion: Decimal?
}

struct CalendarDayRequest: Codable, Equatable {
  let note: String?
  let labels: [CalendarDayAssignment]

  enum CodingKeys: String, CodingKey { case note, labels }
  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encodeIfPresent(note, forKey: .note)
    if note == nil { try container.encodeNil(forKey: .note) }
    try container.encode(labels, forKey: .labels)
  }
}

struct CalendarRangeRequest: Codable, Equatable {
  let startDate: String
  let endDate: String
  let note: String?
  let labels: [CalendarDayAssignment]

  enum CodingKeys: String, CodingKey { case startDate, endDate, note, labels }
  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(startDate, forKey: .startDate)
    try container.encode(endDate, forKey: .endDate)
    try container.encodeIfPresent(note, forKey: .note)
    if note == nil { try container.encodeNil(forKey: .note) }
    try container.encode(labels, forKey: .labels)
  }
}

enum CalendarDate {
  static let iso: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()

  static func date(_ value: String) -> Date? { iso.date(from: value) }
  static func string(_ value: Date, calendar: Calendar = .current) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    return formatter.string(from: value)
  }
}

enum CalendarGrid {
  static func monthDates(month: Date, calendar input: Calendar = .current) -> [Date] {
    let calendar = input
    let start = calendar.date(from: calendar.dateComponents([.year, .month], from: month))!
    let weekday = calendar.component(.weekday, from: start)
    let leading = (weekday + 5) % 7  // Monday = 0
    let days = calendar.range(of: .day, in: .month, for: start)!.count
    let count = ((leading + days + 6) / 7) * 7
    let first = calendar.date(byAdding: .day, value: -leading, to: start)!
    return (0..<count).compactMap { calendar.date(byAdding: .day, value: $0, to: first) }
  }

  static func monthStart(containing date: Date, calendar: Calendar = .current) -> Date {
    calendar.date(from: calendar.dateComponents([.year, .month], from: date))!
  }

  static func range(for month: Date, calendar: Calendar = .current) -> (Date, Date) {
    let dates = monthDates(month: month, calendar: calendar)
    return (dates.first!, dates.last!)
  }

  static func monthRange(for month: Date, calendar: Calendar = .current) -> (Date, Date) {
    let start = monthStart(containing: month, calendar: calendar)
    let end = calendar.date(byAdding: DateComponents(month: 1, day: -1), to: start)!
    return (start, end)
  }
}

enum CalendarPortion: CaseIterable, Identifiable, Equatable {
  case marker, quarter, half, threeQuarter, full
  var id: String { title }
  var value: Decimal? {
    switch self {
    case .marker: nil
    case .quarter: 0.25
    case .half: 0.50
    case .threeQuarter: 0.75
    case .full: 1.00
    }
  }
  var title: String {
    switch self {
    case .marker: "Marker only"
    case .quarter: "¼ day"
    case .half: "½ day"
    case .threeQuarter: "¾ day"
    case .full: "Full day"
    }
  }
  init(portion: Decimal?) { self = Self.allCases.first { $0.value == portion } ?? .marker }
}

protocol CalendarTransport {
  func labels() async throws -> [KBLabel]
  func days(startDate: String, endDate: String) async throws -> [CalendarDay]
  func saveDay(date: String, request: CalendarDayRequest) async throws -> CalendarDay
  func saveRange(request: CalendarRangeRequest) async throws -> [CalendarDay]
  func createLabel(name: String, color: String) async throws -> KBLabel
  func updateLabel(_ label: KBLabel) async throws -> KBLabel
}

struct CalendarAPI: CalendarTransport {
  let client: APIClient
  let token: String
  func labels() async throws -> [KBLabel] {
    try await client.request("/labels?scope=CALENDAR", token: token)
  }
  func days(startDate: String, endDate: String) async throws -> [CalendarDay] {
    try await client.request(
      "/calendar/days?startDate=\(startDate)&endDate=\(endDate)", token: token)
  }
  func saveDay(date: String, request: CalendarDayRequest) async throws -> CalendarDay {
    try await client.request(
      "/calendar/days/\(date)", method: "PUT", body: JSONEncoder().encode(request), token: token)
  }
  func saveRange(request: CalendarRangeRequest) async throws -> [CalendarDay] {
    try await client.request(
      "/calendar/days/range", method: "PUT", body: JSONEncoder().encode(request), token: token)
  }
  func createLabel(name: String, color: String) async throws -> KBLabel {
    let body = try JSONSerialization.data(withJSONObject: [
      "name": name, "color": color, "scopes": ["CALENDAR"],
    ])
    return try await client.request("/labels", method: "POST", body: body, token: token)
  }
  func updateLabel(_ label: KBLabel) async throws -> KBLabel {
    let color: Any = label.color.map { $0 as Any } ?? NSNull()
    let body = try JSONSerialization.data(withJSONObject: [
      "name": label.name,
      "color": color,
      "scopes": label.scopes.map(\.rawValue).sorted(),
    ])
    return try await client.request("/labels/\(label.id)", method: "PUT", body: body, token: token)
  }
}
