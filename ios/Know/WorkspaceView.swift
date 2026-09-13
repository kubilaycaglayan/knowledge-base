import SwiftUI

struct WorkspaceView: View {
    @ObservedObject var app: AppModel
    @StateObject private var sessions: SessionsModel
    @StateObject private var logs: LogsModel
    @StateObject private var labels: LabelsModel
    @StateObject private var notes: NotesModel
    @StateObject private var paths: PathsModel
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
        self._sessions = StateObject(wrappedValue: SessionsModel(
            transport: uiTesting ? SessionsFixture(arguments: arguments) : api,
            defaults: uiTesting ? nil : .standard,
            account: Self.accountID(app.token),
            unauthorized: { [weak app] in app?.signOut() }
        ))
        let logAPI = LogsAPI(client: app.api, token: app.token ?? "")
        self._logs = StateObject(wrappedValue: LogsModel(
            transport: uiTesting ? LogsFixture(arguments: arguments) : logAPI,
            unauthorized: { [weak app] in app?.signOut() }
        ))
        let labelsAPI = LabelsAPI(client: app.api, token: app.token ?? "")
        self._labels = StateObject(wrappedValue: LabelsModel(
            transport: uiTesting ? LabelsFixture(arguments: arguments) : labelsAPI,
            unauthorized: { [weak app] in app?.signOut() },
            invalidateReports: { [weak app] in Task { await app?.refresh() } }
        ))
        let notesAPI = NotesAPI(client: app.api, token: app.token ?? "")
        self._notes = StateObject(wrappedValue: NotesModel(
            transport: uiTesting ? NotesFixture(arguments: arguments) : notesAPI,
            unauthorized: { [weak app] in app?.signOut() }
        ))
        let pathsAPI = PathsAPI(client: app.api, token: app.token ?? "")
        self._paths = StateObject(wrappedValue: PathsModel(
            transport: uiTesting ? PathsFixture(arguments: arguments) : pathsAPI,
            unauthorized: { [weak app] in app?.signOut() },
            invalidateReports: { [weak app] in Task { await app?.refresh() } }
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
                        if sessions.hasUnsavedDraft || sessions.editingHistoryDraft || logs.hasUnsavedDraft || labels.hasUnsavedDraft || notes.hasUnsavedDraft { signOutConfirmation = true } else { app.signOut() }
                    }.font(.caption).frame(minHeight: 44).accessibilityIdentifier("workspace.signOut")
                }
                HStack(spacing: 2) {
                    ForEach(["Sessions", "Logs", "Labels", "Notes", "Paths", "Timeline"], id: \.self) { name in
                        Button { section = name } label: {
                            Text(name).font(.subheadline.weight(section == name ? .semibold : .regular))
                                .padding(.horizontal, 10).frame(minHeight: 44)
                                .background(section == name ? WorkspaceTheme.selected(scheme) : .clear, in: RoundedRectangle(cornerRadius: 4))
                        }.buttonStyle(.plain).accessibilityAddTraits(section == name ? .isSelected : [])
                            .accessibilityIdentifier("workspace.\(name.lowercased())")
                    }
                }
            }.padding(.horizontal, 16).padding(.vertical, 12).frame(maxWidth: 1200)
            Rectangle().fill(WorkspaceTheme.border(scheme)).frame(height: 1).padding(.horizontal, 16)
            ZStack {
                SessionsView(model: sessions).opacity(section == "Sessions" ? 1 : 0).allowsHitTesting(section == "Sessions").accessibilityHidden(section != "Sessions")
                LogsView(model: logs).opacity(section == "Logs" ? 1 : 0).allowsHitTesting(section == "Logs").accessibilityHidden(section != "Logs")
                LabelsView(model: labels).opacity(section == "Labels" ? 1 : 0).allowsHitTesting(section == "Labels").accessibilityHidden(section != "Labels")
                NotesView(model: notes).opacity(section == "Notes" ? 1 : 0).allowsHitTesting(section == "Notes").accessibilityHidden(section != "Notes")
                if section == "Paths" { PathsView(model: paths, sessions: sessions) }
                if section == "Timeline" { TimelineView() }
            }
        }
        .foregroundStyle(WorkspaceTheme.text(scheme))
        .tint(WorkspaceTheme.accent(scheme))
        .background(WorkspaceTheme.background(scheme))
        .preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
        .task { if uiTesting { await sessions.load(); await logs.load(); await labels.load(); await notes.load(); await notes.loadLabels(); await paths.load() } else { resume() } }
        .onChange(of: phase) { _, phase in if phase == .active { if !uiTesting { resume() } } else { sessions.suspend(); logs.suspend() } }
        .onChange(of: section) { _, value in if value != "Sessions" { Task { await app.refresh() } } }
        .onDisappear { sessions.suspend(); logs.suspend() }
        .confirmationDialog("Discard unsaved changes and sign out?", isPresented: $signOutConfirmation, titleVisibility: .visible) {
            Button("Discard and sign out", role: .destructive) { app.signOut() }
            Button("Keep editing", role: .cancel) {}
        }
    }
    private func resume() { if let token = app.token { sessions.resume(client: app.api, token: token); logs.resume(); Task { await labels.load(); await notes.load(); await notes.loadLabels() } } }
}
