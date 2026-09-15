import SwiftUI

struct SessionsView: View {
    @Bindable var model: SessionsModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var newLabel = ""
    @State private var newPath = ""
    @State private var addingPath = false
    @State private var editingStart = false
    @State private var startedAt = Date()
    @State private var editing: TrackedSession?
    @State private var removing: TrackedSession?
    @FocusState private var descriptionFocused: Bool

    private var groups: [(id: UUID, label: String, sessions: [TrackedSession])] {
        var result: [(id: UUID, label: String, sessions: [TrackedSession])] = []
        for session in model.history.sessions {
            let label = SessionFormatting.group(session.startedAt)
            if result.last?.label == label { result[result.count - 1].sessions.append(session) }
            else { result.append((session.id, label, [session])) }
        }
        return result
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                tracker
                if let error = model.error { errorNotice(error) }
                if model.loading && !model.loaded {
                    ProgressView("Loading sessions…").frame(maxWidth: .infinity, minHeight: 140)
                } else if model.history.sessions.isEmpty && model.error == nil {
                    Text("No sessions recorded yet.").foregroundStyle(WorkspaceTheme.muted(scheme))
                    Text("Start a session above to record your time.").font(.footnote).foregroundStyle(WorkspaceTheme.muted(scheme))
                }
                ForEach(groups, id: \.id) { group in
                    HStack {
                        Text(group.label.uppercased()).font(.subheadline.bold()).tracking(0.3)
                        Spacer(minLength: 12)
                        Text(SessionFormatting.groupDuration(group.sessions)).monospacedDigit().foregroundStyle(WorkspaceTheme.muted(scheme))
                    }
                        .accessibilityAddTraits(.isHeader)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 8)
                        .overlay(alignment: .bottom) { Rectangle().fill(WorkspaceTheme.border(scheme)).frame(height: 1) }
                    ForEach(group.sessions) { session in sessionCard(session) }
                }
                if model.history.totalSessions > 0 {
                    ScrollView(.horizontal) {
                        LazyHStack(spacing: 8) {
                            ForEach(0..<max(1, model.history.totalPages), id: \.self) { page in
                                Button((page + 1).formatted()) { Task { await model.loadHistory(page: page) } }
                                    .buttonStyle(WorkspaceButton(primary: page == model.history.page))
                                    .accessibilityLabel("Page \(page + 1)")
                                    .accessibilityAddTraits(page == model.history.page ? .isSelected : [])
                                    .disabled(editing != nil)
                            }
                        }
                    }.accessibilityLabel("Session pages")
                }
            }.padding(.horizontal, 16).padding(.top, 24).padding(.bottom, 48)
                .frame(maxWidth: 1200).frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await model.load() }
        .onChange(of: descriptionFocused) { _, focused in
            model.descriptionFocused = focused
            if !focused { Task { await model.saveTimer() } }
        }
        .onChange(of: model.error) { _, error in
            #if os(iOS)
            if let error { UIAccessibility.post(notification: .announcement, argument: error) }
            #endif
        }
        .alert("New path name", isPresented: $addingPath) {
            TextField("Path name…", text: $newPath)
            Button("Cancel", role: .cancel) {}
            Button("Create path") { Task { if await model.createPath(newPath) { newPath = "" } } }
        }
        .confirmationDialog("Remove this session? This cannot be undone.", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button("Remove session", role: .destructive) { if let session = removing { Task { await model.remove(session) } }; removing = nil }
                .accessibilityIdentifier("session.remove.confirm")
            Button("Cancel", role: .cancel) { removing = nil }
        }
        .sheet(isPresented: $editingStart) {
            NavigationStack {
                VStack(spacing: 24) {
                    DatePicker("Started at", selection: $startedAt).datePickerStyle(.graphical)
                    if let error = model.error { errorNotice(error) }
                    Button { Task {
                        model.draft.startedAt = startedAt
                        await model.saveTimer()
                        if model.error == nil { editingStart = false }
                    } } label: { busyLabel("Save start time") }.buttonStyle(WorkspaceButton(primary: true)).disabled(model.busy)
                }.padding().navigationTitle("Started at")
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editingStart = false } } }
            }.presentationDetents([.large])
        }
    }

    private var tracker: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                SwiftUI.TimelineView(.periodic(from: .now, by: 1)) { context in
                    Button {
                        startedAt = model.draft.startedAt
                        editingStart = true
                    } label: {
                        Text(SessionFormatting.clock(start: model.timer?.startedAt, now: context.date))
                            .font(.system(.body, design: .monospaced).bold()).monospacedDigit()
                    }.buttonStyle(.plain).frame(minHeight: 44)
                        .disabled(model.timer == nil || model.busy)
                        .accessibilityLabel("Edit timer start time; elapsed session time")
                        .accessibilityIdentifier("timer.clock")
                }
                if let path = model.draft.pathId.flatMap({ model.pathsByID[$0] }) {
                    WorkspaceChip(text: path.name).lineLimit(1).frame(maxWidth: 110)
                }
                if !model.draft.labelIds.isEmpty {
                    WorkspaceChip(text: model.draft.labelIds.compactMap { model.labelsByID[$0]?.name }.joined(separator: ", "))
                        .lineLimit(1).frame(maxWidth: 110)
                }
                Spacer(minLength: 0)
                Button { Task {
                    if model.timer != nil {
                        if model.hasUnsavedDraft {
                            await model.saveTimer()
                            guard model.error == nil else { return }
                        }
                    }
                    await model.toggleTimer()
                    descriptionFocused = false
                } } label: {
                    ZStack {
                        Image(systemName: model.timer == nil ? "play.fill" : "stop.fill").font(.caption)
                        if model.busy { ProgressView().scaleEffect(0.7).offset(y: 13) }
                    }.frame(width: 44, height: 44)
                }.buttonStyle(.plain)
                    .foregroundStyle(model.timer == nil ? WorkspaceTheme.color(scheme == .dark ? "87d5ae" : "197a43") : WorkspaceTheme.danger(scheme))
                    .background(model.timer == nil ? WorkspaceTheme.color(scheme == .dark ? "20372b" : "edf8f0") : WorkspaceTheme.color(scheme == .dark ? "3a242b" : "fff4f4"), in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(model.timer == nil ? WorkspaceTheme.color("4f9b6d") : WorkspaceTheme.danger(scheme).opacity(0.5)))
                    .disabled(model.busy || !model.loaded)
                    .accessibilityLabel(model.timer == nil ? "Start timer" : "Stop timer")
                    .accessibilityIdentifier("timer.toggle")
            }.padding(.horizontal, 10).padding(.vertical, 8)
            Rectangle().fill(WorkspaceTheme.border(scheme)).frame(height: 1)
            VStack(alignment: .leading, spacing: 12) {
                heading("Path")
                Menu {
                    Button("＋ Add a new path…") { addingPath = true }
                    Divider()
                    ForEach(model.activePaths) { path in Button(path.name) { Task { await model.choosePath(path.id) } } }
                } label: {
                    HStack { Text(model.draft.pathId.flatMap { model.pathsByID[$0] }?.name ?? "Choose a path…"); Spacer(); Image(systemName: "chevron.down").font(.caption) }
                        .frame(maxWidth: .infinity, alignment: .leading).modifier(WorkspaceControl())
                }.buttonStyle(.plain).disabled(model.busy).accessibilityLabel("Timer path").accessibilityIdentifier("timer.path")
                if !model.recentPaths.isEmpty {
                    WorkspaceFlow {
                        Text("Recent").font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)).frame(minHeight: 44)
                        ForEach(model.recentPaths) { path in
                            chipButton(path.name, selected: model.draft.pathId == path.id) { Task { await model.choosePath(path.id) } }
                        }
                    }.accessibilityLabel("Recently used paths")
                }
                HStack { heading("Labels"); Spacer(); Text("\(model.labels.count) available").font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)) }
                WorkspaceFlow {
                    ForEach(model.labels) { label in
                        chipButton(label.name, selected: model.draft.labelIds.contains(label.id)) { Task { await model.toggleLabel(label.id) } }
                            .accessibilityIdentifier("timer.label.\(label.id)")
                    }
                    if model.labels.isEmpty { Text("No session labels yet.").font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)).frame(minHeight: 44) }
                }.padding(6).background(WorkspaceTheme.background(scheme), in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(WorkspaceTheme.control(scheme)))
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 6) { newLabelField; createLabelButton }
                } else { HStack(spacing: 6) { newLabelField; createLabelButton.fixedSize() } }
                heading("Description", suffix: "(optional)")
                TextField("What are you working on…", text: $model.draft.description, axis: .vertical)
                    .lineLimit(2...).padding(.vertical, 8).frame(maxHeight: 200).modifier(WorkspaceControl())
                    .focused($descriptionFocused).accessibilityLabel("Timer description").accessibilityIdentifier("timer.description")
                    .onSubmit { Task { await model.saveTimer() } }
                if model.timer != nil && model.hasUnsavedDraft {
                    Button { Task { await model.saveTimer() } } label: { busyLabel("Save timer settings") }
                        .buttonStyle(WorkspaceButton()).disabled(model.busy)
                }
            }.padding(12)
        }
        .background(WorkspaceTheme.surface(scheme), in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(WorkspaceTheme.border(scheme)))
        .compositingGroup()
        .shadow(color: .black.opacity(scheme == .dark ? 0.18 : 0.12), radius: 3, y: 2)
        .shadow(color: .black.opacity(scheme == .dark ? 0.18 : 0.10), radius: 12, y: 10)
        .accessibilityElement(children: .contain).accessibilityLabel("Focus today")
    }

    private var newLabelField: some View {
        TextField("New label for this session…", text: $newLabel).modifier(WorkspaceControl())
            .accessibilityLabel("New session label name").accessibilityIdentifier("timer.newLabel")
            .onSubmit(createLabel)
    }
    private var createLabelButton: some View {
        Button(action: createLabel) { busyLabel("＋ Create label") }.buttonStyle(WorkspaceButton())
            .disabled(model.busy).accessibilityIdentifier("timer.createLabel")
    }
    private func createLabel() { Task { if await model.createLabel(newLabel) { newLabel = "" } } }
    private func busyLabel(_ title: String) -> some View { HStack { if model.busy { ProgressView() }; Text(title) } }
    private func heading(_ title: String, suffix: String = "") -> some View {
        HStack(spacing: 4) { Text(title.uppercased()).font(.caption2.weight(.semibold)).tracking(1); Text(suffix).font(.caption2) }
            .foregroundStyle(WorkspaceTheme.muted(scheme))
    }
    private func chipButton(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) { Text(title); if selected { Image(systemName: "xmark").font(.caption2) } }
                .font(.caption).padding(.horizontal, 8).frame(minHeight: 44)
                .foregroundStyle(selected ? WorkspaceTheme.onAccent(scheme) : WorkspaceTheme.text(scheme))
                .background(selected ? WorkspaceTheme.accent(scheme) : WorkspaceTheme.selected(scheme), in: RoundedRectangle(cornerRadius: 4))
        }.buttonStyle(.plain).disabled(model.busy).accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func errorNotice(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(text, systemImage: "exclamationmark.circle").foregroundStyle(WorkspaceTheme.danger(scheme)).font(.footnote)
            Button("Retry") { Task { await model.load() } }.buttonStyle(WorkspaceButton())
        }.accessibilityIdentifier("sessions.error")
    }

    private func sessionCard(_ session: TrackedSession) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if editing?.id == session.id {
                SessionEditor(model: model, session: editing ?? session) { editing = nil }
            } else {
            let path = session.pathId.flatMap { model.pathsByID[$0] }
            if let path { WorkspaceChip(text: path.name, color: path.color, prominent: true) }
            WorkspaceFlow(spacing: 4) {
                ForEach(session.labelIds ?? [], id: \.self) { id in
                    let label = model.labelsByID[id]
                    WorkspaceChip(text: label?.name ?? "Removed label", color: label?.color)
                }
            }
            if let text = session.description, !text.isEmpty { Text(text).font(.subheadline).foregroundStyle(WorkspaceTheme.muted(scheme)) }
            WorkspaceFlow(spacing: 10) {
                Button(session.running == true ? "Stop to edit" : "Edit session") { editing = session }
                    .buttonStyle(WorkspaceButton()).disabled(session.running == true || model.busy || editing != nil)
                    .accessibilityIdentifier("session.edit.\(session.id)")
                if session.running != true {
                    Button { removing = session } label: { Text("Remove session").foregroundStyle(WorkspaceTheme.danger(scheme)) }
                        .buttonStyle(WorkspaceButton()).disabled(model.busy)
                        .accessibilityIdentifier("session.remove.\(session.id)")
                }
            }
            WorkspaceFlow {
                WorkspaceChip(text: session.running == true ? "Running" : SessionFormatting.duration(session.durationSeconds ?? 0))
                WorkspaceChip(text: "\(session.source) · \(SessionFormatting.date(session.startedAt)?.formatted(date: .numeric, time: .standard) ?? session.startedAt)")
            }.monospacedDigit()
            }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(WorkspaceTheme.surface(scheme), in: RoundedRectangle(cornerRadius: 4))
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(WorkspaceTheme.control(scheme).opacity(0.6)))
            .compositingGroup()
            .shadow(color: .black.opacity(0.05), radius: 3, y: 2)
    }
}
