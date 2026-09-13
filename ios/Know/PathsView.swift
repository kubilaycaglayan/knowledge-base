import SwiftUI

struct PathsView: View {
    @ObservedObject var model: PathsModel
    @ObservedObject var sessions: SessionsModel
    @Environment(\.colorScheme) private var scheme
    @State private var addOpen = false
    @State private var editPath: Path?
    @State private var historyPath: Path?
    @State private var mergeSource: Path?
    @State private var deleteCandidate: Path?
    @State private var editingSession: TrackedSession?
    @State private var name = ""
    @State private var description = ""
    @State private var color = "#3B82F6"
    private let colors = ["#3B82F6", "#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#64748B", "#84CC16", "#475569"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) { Text("ORGANIZE").font(.caption.weight(.semibold)); Text("Your paths").font(.largeTitle.bold()) }
                    Spacer()
                    Button { resetDraft(); addOpen = true } label: { Image(systemName: "plus").frame(width: 44, height: 44) }
                        .buttonStyle(WorkspaceButton(primary: true)).accessibilityLabel("Add path").accessibilityIdentifier("paths.add")
                }
                Text("Long-lived areas that give your work a place to belong.").foregroundStyle(WorkspaceTheme.muted(scheme))
                if let error = model.error { errorNotice(error) }
                if let removed = model.pendingRemoval { HStack { Text("Removed “\(removed.name)”."); Spacer(); Button("Undo") { Task { await model.undoRemoval() } } }.padding(12).background(WorkspaceTheme.selected(scheme), in: RoundedRectangle(cornerRadius: 6)).accessibilityIdentifier("paths.undo") }
                if model.isLoading { ProgressView("Loading…").frame(maxWidth: .infinity, alignment: .leading) }
                else if model.paths.isEmpty { Text("Your first path is waiting to be named.").foregroundStyle(WorkspaceTheme.muted(scheme)).padding(.vertical, 24).accessibilityIdentifier("paths.empty") }
                else { ForEach(model.paths) { row($0) } }
            }.padding(16).frame(maxWidth: 1200, alignment: .leading)
        }
        .refreshable { await model.load(force: true) }
        .task { if model.paths.isEmpty { await model.load() } }
        .sheet(isPresented: $addOpen) { pathEditor(title: "Add a path", submit: saveNew, cancel: { addOpen = false }) }
        .sheet(item: $editPath) { path in pathEditor(title: "Edit path", submit: { await saveEdit(path) }, cancel: { editPath = nil }) }
        .sheet(item: $mergeSource) { source in MergePathSheet(source: source, paths: model.paths) { target in self.merge(source: source, target: target) } }
        .sheet(item: $historyPath) { path in history(path) }
        .sheet(item: $editingSession) { session in SessionEditor(model: sessions, session: session) { editingSession = nil }.onDisappear { if let path = historyPath { Task { await model.loadSummary(for: path) } } } }
        .confirmationDialog("Remove “\(deleteCandidate?.name ?? "")”?", isPresented: Binding(get: { deleteCandidate != nil }, set: { if !$0 { deleteCandidate = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) { if let path = deleteCandidate { Task { _ = await model.remove(path); deleteCandidate = nil } } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("You can undo this for a few seconds.") }
    }

    @ViewBuilder private func row(_ path: Path) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Circle().fill(WorkspaceTheme.color(path.color ?? colors[0])).frame(width: 14, height: 14).padding(.top, 5).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    HStack { Text(path.name).font(.headline).lineLimit(3); if let label = path.activityLabel { WorkspaceChip(text: label) } }
                    if let value = path.description, !value.isEmpty { descriptionView(value) } else { Text("No description yet").foregroundStyle(WorkspaceTheme.muted(scheme)) }
                }
            }
            HStack { Button("History") { historyPath = path }.accessibilityIdentifier("paths.history.\(path.id)"); Button("Edit") { beginEdit(path) }.accessibilityIdentifier("paths.edit.\(path.id)"); if path.status == "ACTIVE" { Button("Remove") { deleteCandidate = path }.foregroundStyle(WorkspaceTheme.danger(scheme)).accessibilityIdentifier("paths.remove.\(path.id)") }; Spacer() }.buttonStyle(.borderless)
        }.padding(16).background(WorkspaceTheme.surface(scheme), in: RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(WorkspaceTheme.border(scheme))).accessibilityElement(children: .contain)
    }

    @ViewBuilder private func descriptionView(_ value: String) -> some View {
        if let start = value.range(of: "http://") ?? value.range(of: "https://") {
            let candidate = String(value[start.lowerBound...]).split(whereSeparator: { $0.isWhitespace }).first.map(String.init) ?? ""
            if let url = URL(string: candidate.trimmingCharacters(in: .punctuationCharacters)) { Link(value, destination: url).foregroundStyle(WorkspaceTheme.text(scheme)) } else { Text(value).fixedSize(horizontal: false, vertical: true) }
        } else { Text(value).fixedSize(horizontal: false, vertical: true) }
    }

    @ViewBuilder private func pathEditor(title: String, submit: @escaping () async -> Void, cancel: @escaping () -> Void) -> some View {
        NavigationStack { Form { Section { TextField("Path name", text: $name).onSubmit { Task { await submit() } }.accessibilityIdentifier("paths.name"); TextEditor(text: $description).frame(minHeight: 100).accessibilityLabel("Path description").accessibilityIdentifier("paths.description") }; Section("Color") { LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5)) { ForEach(colors, id: \.self) { value in Button { color = value } label: { Circle().fill(WorkspaceTheme.color(value)).frame(width: 34, height: 34).overlay(color == value ? Circle().stroke(WorkspaceTheme.text(scheme), lineWidth: 3) : nil) }.frame(minWidth: 44, minHeight: 44).accessibilityLabel("Choose \(value) color").accessibilityAddTraits(color == value ? .isSelected : []) } } }; if let error = model.error { Text(error).foregroundStyle(WorkspaceTheme.danger(scheme)).accessibilityIdentifier("paths.error") } }.navigationTitle(title).toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: cancel) }; ToolbarItem(placement: .confirmationAction) { Button(title == "Add a path" ? "Add path" : "Save path") { Task { await submit() } }.disabled(model.busy).accessibilityIdentifier("paths.save") } }.interactiveDismissDisabled(model.busy) }
        .presentationDetents([.medium, .large]).onAppear { model.error = nil }
    }

    private func history(_ path: Path) -> some View {
        NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 16) { if let summary = model.summaries[path.id] { Text("\(SessionFormatting.duration(summary.trackedSeconds)) tracked").foregroundStyle(WorkspaceTheme.muted(scheme)); if summary.recentActivity.isEmpty { Text("No recent activity yet.").foregroundStyle(WorkspaceTheme.muted(scheme)) } else { ForEach(summary.recentActivity) { event in historyEvent(event) } } } else { ProgressView("Loading history…") } }.padding(16) }.navigationTitle(path.name).toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { historyPath = nil }.accessibilityIdentifier("paths.history.close") } }.task { if model.summaries[path.id] == nil { await model.loadSummary(for: path) } } }
    }

    @ViewBuilder private func historyEvent(_ event: Activity) -> some View { VStack(alignment: .leading, spacing: 8) { Text(event.occurredAt).font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)); if event.title.hasPrefix("Tracked "), let seconds = Int64(event.title.split(separator: " ").dropFirst().first ?? "0") { Text(SessionFormatting.duration(seconds)).font(.headline) }; if let detail = event.detail { Text(detail).fixedSize(horizontal: false, vertical: true) }; if let id = event.timeEntryId { Button("Edit session") { Task { editingSession = await model.session(id: id) } } } }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(WorkspaceTheme.surface(scheme), in: RoundedRectangle(cornerRadius: 6)).overlay(RoundedRectangle(cornerRadius: 6).stroke(WorkspaceTheme.border(scheme))) }

    private func errorNotice(_ value: String) -> some View { Text(value).font(.subheadline).foregroundStyle(WorkspaceTheme.danger(scheme)).accessibilityLabel(value).accessibilityIdentifier("paths.error") }
    private func resetDraft() { name = ""; description = ""; color = colors[0]; model.error = nil }
    private func beginEdit(_ path: Path) { name = path.name; description = path.description ?? ""; color = path.color ?? colors[0]; model.error = nil; editPath = path }
    private func saveNew() async { if await model.create(name: name, description: description, color: color) { addOpen = false; resetDraft() } }
    private func saveEdit(_ path: Path) async { if await model.update(path, name: name, description: description, color: color) { editPath = nil } }
    private func merge(source: Path, target: Path) { Task { if await model.merge(source: source, into: target) { mergeSource = nil } } }
}

private struct MergePathSheet: View {
    let source: Path
    let paths: [Path]
    let confirm: (Path) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    var targets: [Path] { paths.filter { $0.id != source.id && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) } }
    var body: some View { NavigationStack { List { TextField("Search paths…", text: $query).accessibilityIdentifier("paths.merge.search"); ForEach(targets) { path in Button { confirm(path); dismiss() } label: { Text(path.name) }.accessibilityIdentifier("paths.merge.target.\(path.id)") }; if targets.isEmpty { Text("No matching paths.").foregroundStyle(.secondary) } }.navigationTitle("Merge \(source.name) into…").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } } } }
}
