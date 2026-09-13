import SwiftUI

struct SessionEditor: View {
    @Bindable var model: SessionsModel
    let session: TrackedSession
    let close: () -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var draft: SessionDraft
    @State private var discard = false
    @State private var timeError: String?
    @FocusState private var invalidTime: Bool
    private let original: SessionDraft

    init(model: SessionsModel, session: TrackedSession, close: @escaping () -> Void) {
        self.model = model
        self.session = session
        self.close = close
        let draft = SessionDraft(session)
        self.original = draft
        self._draft = State(initialValue: draft)
    }

    var body: some View {
                VStack(alignment: .leading, spacing: 16) {
                    field("Path") {
                        Picker("Edit session path", selection: $draft.pathId) {
                            Text("Unassigned").tag(nil as UUID?)
                            ForEach(model.paths) { path in Text(path.name).tag(Optional(path.id)) }
                        }.frame(maxWidth: .infinity, alignment: .leading).modifier(WorkspaceControl())
                    }
                    field("Description (optional)") {
                        TextField("What did you work on…", text: $draft.description, axis: .vertical)
                            .lineLimit(2...6).padding(.vertical, 8).modifier(WorkspaceControl())
                            .accessibilityLabel("Edit session description").accessibilityIdentifier("session.description")
                    }
                    field("Labels") {
                        WorkspaceFlow {
                            ForEach(draft.labelIds, id: \.self) { id in
                                let name = model.labels.first { $0.id == id }?.name ?? "Removed label"
                                Button { draft.labelIds.removeAll { $0 == id } } label: { Label(name, systemImage: "xmark") }
                                    .buttonStyle(WorkspaceButton()).accessibilityLabel("Remove \(name)")
                            }
                        }
                        Menu("Add a label…") {
                            ForEach(model.labels.filter { !draft.labelIds.contains($0.id) }) { label in
                                Button(label.name) { draft.labelIds.append(label.id) }
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading).modifier(WorkspaceControl())
                    }
                    field("Source") {
                        Picker("Edit session source", selection: $draft.source) {
                            ForEach(["WEB", "IOS", "CHROME_EXTENSION", "MANUAL", "IMPORT"], id: \.self) { Text($0).tag($0) }
                        }.modifier(WorkspaceControl())
                    }
                    DatePicker("Started", selection: $draft.startedAt).accessibilityLabel("Edit session start")
                    DatePicker("Ended", selection: $draft.endedAt).accessibilityLabel("Edit session end").focused($invalidTime)
                    if let error = timeError ?? model.error {
                        Label(error, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(WorkspaceTheme.danger(scheme))
                            .accessibilityIdentifier("session.error")
                    }
                    Button(action: save) {
                        HStack { if model.busy { ProgressView() }; Text("Save session") }
                    }.buttonStyle(WorkspaceButton(primary: true)).disabled(model.busy).accessibilityIdentifier("session.save")
                        .keyboardShortcut(.return, modifiers: .command)
                    Button("Cancel", action: cancel).buttonStyle(WorkspaceButton()).disabled(model.busy).accessibilityIdentifier("session.cancel")
                }.foregroundStyle(WorkspaceTheme.text(scheme))
        .confirmationDialog("Discard unsaved changes?", isPresented: $discard, titleVisibility: .visible) {
            Button("Discard changes", role: .destructive) { close() }
            Button("Keep editing", role: .cancel) {}
        }
        .onAppear { model.error = nil }
        .onChange(of: draft) { _, _ in model.editingHistoryDraft = draft != original }
        .onDisappear { model.editingHistoryDraft = false }
    }

    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.subheadline.weight(.semibold)); content() }
    }
    private func cancel() { if draft != original { discard = true } else { close() } }
    private func save() {
        guard draft.endedAt > draft.startedAt else { timeError = "End time must be after start time."; invalidTime = true; return }
        timeError = nil
        Task { if await model.save(session, draft: draft) { close() } }
    }
}
