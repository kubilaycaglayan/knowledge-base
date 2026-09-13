import SwiftUI

struct WorkspaceView: View {
    @ObservedObject var app: AppModel
    @State private var sessions: SessionsModel
    @State private var logs: LogsModel
    @State private var labels: LabelsModel
    @State private var notes: NotesModel
    @State private var paths: PathsModel
    @State private var calendar: CalendarModel
    @State private var reports: ReportsModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @AppStorage("knowledge-base.appearance") private var appearance = "system"
    @State private var section = "Sessions"
    @State private var signOutConfirmation = false
    private let uiTesting: Bool

    init(app: AppModel) {
        self.app = app
        let arguments = ProcessInfo.processInfo.arguments
        let uiTesting = isUITesting(arguments: arguments)
        self.uiTesting = uiTesting
        let api = SessionsAPI(client: app.api, token: app.token ?? "")
        self._sessions = State(initialValue: SessionsModel(
            transport: uiTesting ? SessionsFixture(arguments: arguments) : api,
            defaults: uiTesting ? nil : .standard,
            account: Self.accountID(app.token),
            unauthorized: { [weak app] in app?.signOut() }
        ))
        let logAPI = LogsAPI(client: app.api, token: app.token ?? "")
        self._logs = State(initialValue: LogsModel(
            transport: uiTesting ? LogsFixture(arguments: arguments) : logAPI,
            unauthorized: { [weak app] in app?.signOut() }
        ))
        let labelsAPI = LabelsAPI(client: app.api, token: app.token ?? "")
        self._labels = State(initialValue: LabelsModel(
            transport: uiTesting ? LabelsFixture(arguments: arguments) : labelsAPI,
            unauthorized: { [weak app] in app?.signOut() },
            invalidateReports: { [weak app] in Task { await app?.refresh() } }
        ))
        let notesAPI = NotesAPI(client: app.api, token: app.token ?? "")
        self._notes = State(initialValue: NotesModel(
            transport: uiTesting ? NotesFixture(arguments: arguments) : notesAPI,
            unauthorized: { [weak app] in app?.signOut() }
        ))
        let pathsAPI = PathsAPI(client: app.api, token: app.token ?? "")
        self._paths = State(initialValue: PathsModel(
            transport: uiTesting ? PathsFixture(arguments: arguments) : pathsAPI,
            unauthorized: { [weak app] in app?.signOut() },
            invalidateReports: { [weak app] in Task { await app?.refresh() } }
        ))
        let calendarAPI = CalendarAPI(client: app.api, token: app.token ?? "")
        self._calendar = State(initialValue: CalendarModel(
            transport: uiTesting ? CalendarFixture(arguments: arguments) : calendarAPI,
            unauthorized: { [weak app] in app?.signOut() },
            invalidateReports: { [weak app] in Task { await app?.refresh() } }
        ))
        let reportsAPI = ReportsAPI(client: app.api, token: app.token ?? "")
        self._reports = State(initialValue: ReportsModel(
            transport: uiTesting ? ReportsFixture(arguments: arguments) : reportsAPI,
            unauthorized: { [weak app] in app?.signOut() }
        ))
    }

    // The public JWT subject scopes recent IDs by account without persisting the JWT.
    private static func accountID(_ token: String?) -> String {
        guard let part = token?.split(separator: ".").dropFirst().first else { return "unknown" }
        var base64 = String(part).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        guard let data = Data(base64Encoded: base64), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let subject = value["sub"] as? String else { return "unknown" }
        return subject
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("knowledge.base").font(.system(size: 19, weight: .bold)).tracking(-0.7)
                        .accessibilityLabel("Knowledge Base").accessibilityAddTraits(.isHeader)
                    Spacer()
                    Menu {
                        Picker("Appearance", selection: $appearance) {
                            Text("System").tag("system")
                            Text("Light").tag("light")
                            Text("Dark").tag("dark")
                        }
                    } label: { Image(systemName: "gearshape.fill").frame(width: 44, height: 44) }
                        .accessibilityLabel("Appearance settings").accessibilityIdentifier("workspace.appearance")
                    Button("Sign out") {
                        if sessions.hasUnsavedDraft || sessions.editingHistoryDraft || logs.hasUnsavedDraft || labels.hasUnsavedDraft || notes.hasUnsavedDraft || calendar.hasUnsavedDraft { signOutConfirmation = true } else { reports.signOut(); app.signOut() }
                    }.font(.caption).frame(minHeight: 44).accessibilityIdentifier("workspace.signOut")
                }
                ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 2) {
                    ForEach(["Sessions", "Logs", "Labels", "Notes", "Paths", "Calendar", "Reports", "Timeline"], id: \.self) { name in
                        Button { section = name } label: {
                            Text(name).font(.subheadline.weight(section == name ? .semibold : .regular))
                                .padding(.horizontal, 10).frame(minHeight: 44)
                                .background(section == name ? WorkspaceTheme.selected(scheme) : .clear, in: RoundedRectangle(cornerRadius: 4))
                        }.buttonStyle(.plain).accessibilityAddTraits(section == name ? .isSelected : [])
                            .accessibilityIdentifier("workspace.\(name.lowercased())")
                    }
                } }
            }.padding(.horizontal, 16).padding(.vertical, 12).frame(maxWidth: 1200)
            Rectangle().fill(WorkspaceTheme.border(scheme)).frame(height: 1).padding(.horizontal, 16)
            ZStack {
                if section == "Sessions" { SessionsView(model: sessions) }
                if section == "Logs" { LogsView(model: logs) }
                if section == "Labels" { LabelsView(model: labels) }
                if section == "Notes" { NotesView(model: notes) }
                if section == "Paths" { PathsView(model: paths, sessions: sessions) }
                if section == "Calendar" { CalendarView(model: calendar) }
                if section == "Reports" { ReportsView(model: reports) }
                if section == "Timeline" { TimelineView() }
            }
        }
        .foregroundStyle(WorkspaceTheme.text(scheme))
        .tint(WorkspaceTheme.accent(scheme))
        .background(WorkspaceTheme.background(scheme))
        .preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
        .task { if uiTesting { await sessions.load(); await logs.load(); await labels.load(); await notes.load(); await notes.loadLabels(); await paths.load(); await calendar.load() } else { resumeVisibleSection() } }
        .onChange(of: phase) { _, phase in if phase == .active { if !uiTesting { resumeVisibleSection(); Task { await reports.load(force: true) } } } else { sessions.suspend(); logs.suspend() } }
        .onChange(of: section) { _, value in if !uiTesting { resumeVisibleSection() }; if value != "Sessions" { Task { await app.refresh() } } }
        .onDisappear { sessions.suspend(); logs.suspend() }
        .confirmationDialog("Discard unsaved changes and sign out?", isPresented: $signOutConfirmation, titleVisibility: .visible) {
            Button("Discard and sign out", role: .destructive) { reports.signOut(); app.signOut() }
            Button("Keep editing", role: .cancel) {}
        }
    }
    private func resumeVisibleSection() {
        guard let token = app.token else { return }
        if section == "Sessions" { sessions.resume(client: app.api, token: token) } else { sessions.suspend() }
        if section == "Logs" { logs.resume() } else { logs.suspend() }
        Task { await labels.load(); await notes.load(); await notes.loadLabels() }
    }
}
