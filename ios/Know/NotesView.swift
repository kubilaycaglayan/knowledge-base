import SwiftUI

struct NotesView: View {
    @ObservedObject var model: NotesModel
    @Environment(\.colorScheme) private var scheme
    @State private var editorDraft: NoteDraft?
    @State private var labelInput = ""
    @State private var labelIndex = 0
    @State private var saveTask: Task<Void, Never>?
    @State private var searchTask: Task<Void, Never>?
    @State private var undoStack: [String] = []
    @State private var redoStack: [String] = []
    @State private var archiveCandidate: Note?
    @State private var leaveConfirmation = false
    @FocusState private var focused: Field?
    enum Field: Hashable { case search, title, body, label }

    var body: some View {
        Group { if editorDraft != nil { editor } else { list } }
            .background(WorkspaceTheme.background(scheme))
            .onDisappear { saveTask?.cancel(); searchTask?.cancel() }
    }

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) { Text("KNOWLEDGE BASE").font(.caption.weight(.semibold)); Text(model.archived ? "Archived notes" : "Notes").font(.largeTitle.bold()) }
                    Spacer()
                    if !model.archived { Button { Task { if let note = await model.create() { await model.open(note); editorDraft = NoteDraft(note); await model.loadLabels(); focused = .title } } } label: { Image(systemName: "plus").frame(width: 44, height: 44) }.buttonStyle(WorkspaceButton(primary: true)).accessibilityLabel("Create new note").accessibilityIdentifier("notes.add") }
                }
                if let error = model.error { errorNotice(error) }
                HStack(spacing: 10) {
                    TextField("Search title, body, or label…", text: $model.query).textFieldStyle(.roundedBorder).focused($focused, equals: .search).accessibilityLabel("Search notes").accessibilityIdentifier("notes.search").onSubmit { Task { await model.load(force: true) } }.onChange(of: model.query) { _, _ in searchTask?.cancel(); searchTask = Task { try? await Task.sleep(for: .milliseconds(250)); guard !Task.isCancelled else { return }; model.resetToFirstPage(); await model.load(force: true) } }
                    Menu { ForEach([20, 50, 100], id: \.self) { amount in Button("Show \(amount)") { model.setPageSize(amount); Task { await model.load() } } } } label: { Text("Show \(model.size)").frame(minWidth: 72, minHeight: 44) }.accessibilityLabel("Notes per page")
                    Button(model.archived ? "Active notes" : "Archive") { model.setArchive(!model.archived); Task { await model.load() } }.buttonStyle(WorkspaceButton()).accessibilityIdentifier("notes.archive-toggle")
                }
                if model.loading { Text("Loading…").foregroundStyle(WorkspaceTheme.muted(scheme)) }
                else if model.notes.isEmpty && model.error == nil { Text(model.query.isEmpty ? "Your notes will appear here." : "No notes match your search.").foregroundStyle(WorkspaceTheme.muted(scheme)).padding(.vertical, 24).accessibilityIdentifier("notes.empty") }
                else { LazyVGrid(columns: [GridItem(.adaptive(minimum: 270), spacing: 12)], spacing: 12) { ForEach(model.notes) { note in row(note) } } }
                if model.totalItems > 0 { HStack { Text("\(model.totalItems) note\(model.totalItems == 1 ? "" : "s")").foregroundStyle(WorkspaceTheme.muted(scheme)); Spacer(); Button("Previous") { model.previousPage() }.disabled(!model.canGoPrevious); Text("Page \(model.page + 1) of \(max(model.totalPages, 1))").font(.caption).monospacedDigit(); Button("Next") { model.nextPage() }.disabled(!model.canGoNext) }.frame(minHeight: 44) }
            }.frame(maxWidth: 1200, alignment: .leading).padding(16)
        }.refreshable { await model.load(force: true) }.task { await model.load(); await model.loadLabels() }
        .confirmationDialog("Move “\(archiveCandidate?.title ?? "this note")” to Archive?", isPresented: Binding(get: { archiveCandidate != nil }, set: { if !$0 { archiveCandidate = nil } }), titleVisibility: .visible) {
            Button("Archive note", role: .destructive) { if let note = archiveCandidate { Task { await model.archive(note) } }; archiveCandidate = nil }
            Button("Cancel", role: .cancel) { archiveCandidate = nil }
        } message: { Text("Archived notes are permanently deleted after 30 days.") }
        .confirmationDialog("Discard unsaved note changes?", isPresented: $leaveConfirmation, titleVisibility: .visible) {
            Button("Discard changes", role: .destructive) { discardEditor() }
            Button("Keep editing", role: .cancel) {}
        }
    }

    @ViewBuilder private func row(_ note: Note) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.archived { Text(note.title).font(.headline).lineLimit(2) } else { Button { Task { await model.open(note); editorDraft = NoteDraft(note); await model.loadLabels(); focused = .title } } label: { Text(note.title).font(.headline).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading) }.buttonStyle(.plain).accessibilityLabel("Open \(note.title)") }
            let excerpt = NoteDocument.plainText(content: note.content, fallback: note.contentText)
            Text(excerpt.isEmpty ? "Empty note" : excerpt).italic(excerpt.isEmpty).foregroundStyle(WorkspaceTheme.muted(scheme)).lineLimit(3).frame(maxWidth: .infinity, alignment: .leading)
            if !note.tags.isEmpty { Text(note.tags.joined(separator: " · ")).font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)).lineLimit(2) }
            HStack { Text(model.archived ? "Archived \(date(note.deletedAt ?? note.updatedAt))" : date(note.updatedAt)).font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)); Spacer(); if model.archived { Button("Restore") { Task { await model.restore(note) } }.buttonStyle(WorkspaceButton()) } else { Button { archiveCandidate = note } label: { Image(systemName: "archivebox").frame(width: 44, height: 44) }.accessibilityLabel("Archive \(note.title)").foregroundStyle(WorkspaceTheme.danger(scheme)) } }
        }.padding(16).frame(maxWidth: .infinity, minHeight: 184, alignment: .topLeading).background(WorkspaceTheme.surface(scheme), in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(WorkspaceTheme.border(scheme))).accessibilityIdentifier("notes.row.\(note.id)")
    }

    private var editor: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack { Button("← Notes") { closeEditor() }.buttonStyle(WorkspaceButton()).accessibilityIdentifier("notes.back"); Spacer(); Text(saveLabel).font(.caption).foregroundStyle(model.saveState == .failed ? WorkspaceTheme.danger(scheme) : WorkspaceTheme.muted(scheme)).accessibilityIdentifier("notes.save-state"); Button { undo() } label: { Image(systemName: "arrow.uturn.backward").frame(width: 44, height: 44) }.disabled(undoStack.isEmpty).accessibilityLabel("Undo"); Button { redo() } label: { Image(systemName: "arrow.uturn.forward").frame(width: 44, height: 44) }.disabled(redoStack.isEmpty).accessibilityLabel("Redo") }
                TextField("Note title", text: Binding(get: { editorDraft?.title ?? "" }, set: { editorDraft?.title = $0; scheduleSave() })).font(.title.bold()).textFieldStyle(.plain).focused($focused, equals: .title).accessibilityLabel("Note title").accessibilityIdentifier("notes.title")
                labelEditor
                TextEditor(text: Binding(get: { editorDraft?.body ?? "" }, set: { newValue in if let old = editorDraft?.body, old != newValue { undoStack.append(old); redoStack.removeAll() }; editorDraft?.body = newValue; scheduleSave() })).frame(minHeight: 300).modifier(WorkspaceControl()).focused($focused, equals: .body).accessibilityLabel("Note content").accessibilityIdentifier("notes.body")
                if let note = model.selected { Text("Created \(date(note.createdAt)) · Updated \(date(note.updatedAt))").font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)) }
            }.frame(maxWidth: 900, alignment: .leading).padding(16)
        }.task { focused = .title }
    }

    private var labelEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack { ForEach(editorDraft?.tags ?? [], id: \.self) { tag in HStack(spacing: 4) { Text(tag); Button("×") { editorDraft?.tags.removeAll { $0 == tag }; scheduleSave() }.accessibilityLabel("Remove \(tag)") }.padding(.horizontal, 8).padding(.vertical, 5).background(WorkspaceTheme.selected(scheme)) }; TextField("Add label and press Enter…", text: $labelInput).textFieldStyle(.roundedBorder).focused($focused, equals: .label).accessibilityLabel("Add label").accessibilityIdentifier("notes.label").onSubmit { addLabel() }.onChange(of: labelInput) { _, _ in labelIndex = 0 } }
            let matches = model.labels.filter { label in !labelInput.isEmpty && label.name.localizedCaseInsensitiveContains(labelInput) && !(editorDraft?.tags.contains(where: { $0.caseInsensitiveCompare(label.name) == .orderedSame }) ?? false) }
            if !matches.isEmpty { ForEach(Array(matches.prefix(8).enumerated()), id: \.element.id) { index, label in Button(label.name) { addLabel(label.name) }.frame(minWidth: 44, minHeight: 44, alignment: .leading).accessibilityAddTraits(index == labelIndex ? .isSelected : []) } }
        }
    }

    private var saveLabel: String { switch model.saveState { case .saved: return "Saved"; case .saving: return "Saving…"; case .failed: return "Not saved" } }
    private func date(_ value: String) -> String { guard let parsed = SessionFormatting.date(value) else { return value }; return parsed.formatted(date: .abbreviated, time: .omitted) }
    private func addLabel(_ value: String? = nil) { let name = (value ?? labelInput).trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "^#", with: "", options: .regularExpression); guard !name.isEmpty, !(editorDraft?.tags.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) ?? true) else { labelInput = ""; return }; editorDraft?.tags.append(name); labelInput = ""; scheduleSave() }
    private func scheduleSave() { guard editorDraft != nil else { return }; model.saveState = .saving; saveTask?.cancel(); saveTask = Task { try? await Task.sleep(for: .milliseconds(650)); guard !Task.isCancelled, let draft = editorDraft else { return }; _ = await model.save(draft) } }
    private func undo() { guard let old = undoStack.popLast(), var draft = editorDraft else { return }; redoStack.append(draft.body); draft.body = old; editorDraft = draft; scheduleSave() }
    private func redo() { guard let next = redoStack.popLast(), var draft = editorDraft else { return }; undoStack.append(draft.body); draft.body = next; editorDraft = draft; scheduleSave() }
    private func closeEditor() { if model.hasUnsavedDraft { leaveConfirmation = true } else { discardEditor() } }
    private func discardEditor() { saveTask?.cancel(); editorDraft = nil; undoStack.removeAll(); redoStack.removeAll(); labelInput = ""; model.saveState = .saved; Task { await model.load(force: true) } }
    private func errorNotice(_ text: String) -> some View { VStack(alignment: .leading, spacing: 8) { Text(text).foregroundStyle(WorkspaceTheme.danger(scheme)).accessibilityLabel(text); Button("Retry") { Task { await model.load(force: true) } }.buttonStyle(WorkspaceButton()) }.accessibilityIdentifier("notes.error") }
}
