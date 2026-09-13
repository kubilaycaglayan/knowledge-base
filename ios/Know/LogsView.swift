import SwiftUI

struct LogsView: View {
    @ObservedObject var model: LogsModel
    @Environment(\.colorScheme) private var scheme
    @State private var now = Date()
    @State private var followsClock = true
    @State private var changingClock = false
    @State private var labelLogID: UUID?
    @State private var removing: Log?
    @FocusState private var composerFocused: Bool
    private let calendar = Calendar.current

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Logs").font(.title2.weight(.semibold)).accessibilityAddTraits(.isHeader)
                    composer
                    if let error = model.error { errorNotice(error) }
                    if model.logs.isEmpty && !model.loading && model.error == nil { Text("No logs yet. Capture a thought above.").foregroundStyle(WorkspaceTheme.muted(scheme)).padding(.vertical, 24).accessibilityIdentifier("logs.empty") }
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(groups, id: \.label) { group in
                            VStack(alignment: .leading, spacing: 0) {
                                Text(group.label.uppercased()).font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(WorkspaceTheme.muted(scheme)).padding(.top, group.dayBreak ? 24 : 12).padding(.bottom, 6)
                                ForEach(Array(group.logs.enumerated()), id: \.element.id) { index, log in row(log, group: group.label, previous: index > 0 ? group.logs[index - 1] : nil, index: index) }
                            }.id(group.label)
                        }
                    }
                }.frame(maxWidth: 1200, alignment: .leading).padding(16)
            }.refreshable { await model.load() }
        }.background(WorkspaceTheme.background(scheme)).task { while !Task.isCancelled { try? await Task.sleep(for: .seconds(1)); now = Date(); if followsClock { changingClock = true; model.draft.occurredAt = Date(); changingClock = false } } }
        .confirmationDialog("Remove this log? This cannot be undone.", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) { Button("Remove log", role: .destructive) { if let log = removing { Task { await model.remove(log) } }; removing = nil }; Button("Cancel", role: .cancel) { removing = nil } }
    }
    private var composer: some View { VStack(alignment: .leading, spacing: 10) { TextEditor(text: $model.draft.body).frame(minHeight: 44, maxHeight: 120).modifier(WorkspaceControl()).focused($composerFocused).accessibilityLabel("Log text").accessibilityIdentifier("logs.composer"); HStack { DatePicker("Timestamp", selection: $model.draft.occurredAt, displayedComponents: [.date, .hourAndMinute]).labelsHidden().accessibilityLabel("Log timestamp").onChange(of: model.draft.occurredAt) { if !changingClock { followsClock = false } }; if !followsClock { Button("Use device time") { followsClock = true; changingClock = true; model.draft.occurredAt = Date(); changingClock = false }.buttonStyle(WorkspaceButton()).accessibilityIdentifier("logs.reset-time") }; Spacer(); Button { Task { await model.create() }; composerFocused = false } label: { HStack { if model.busy { ProgressView() }; Text("Save") } }.buttonStyle(WorkspaceButton(primary: true)).disabled(model.busy).accessibilityIdentifier("logs.save") }.frame(minHeight: 44); if !followsClock && abs(now.timeIntervalSince(model.draft.occurredAt)) > 60 { Text("Timestamp differs from device time.").font(.footnote).foregroundStyle(WorkspaceTheme.muted(scheme)) } }.padding(.bottom, 8).overlay(alignment: .bottom) { Rectangle().fill(WorkspaceTheme.border(scheme)).frame(height: 1) }.onSubmit { Task { await model.create() } } }
    private var groups: [(label: String, logs: [Log], dayBreak: Bool)] { var result: [(String, [Log], Bool)] = []; for log in model.logs { let label = LogFormatting.group(log.occurredAt, now: now, calendar: calendar); if result.last?.0 == label { result[result.count - 1].1.append(log) } else { let dayBreak = result.last.map { !LogFormatting.sameDay($0.1.last!.occurredAt, log.occurredAt, calendar: calendar) } ?? false; result.append((label, [log], dayBreak)) } }; return result }
    @ViewBuilder private func row(_ log: Log, group: String, previous: Log?, index: Int) -> some View { VStack(alignment: .leading, spacing: 8) { if model.editing?.id == log.id { TextField("Timestamp", value: $model.editDraft.occurredAt, format: .dateTime).modifier(WorkspaceControl()); TextEditor(text: $model.editDraft.body).frame(minHeight: 44).modifier(WorkspaceControl()); HStack { Button { Task { await model.saveEdit() } } label: { HStack { if model.busy { ProgressView() }; Text("Save") } }.buttonStyle(WorkspaceButton(primary: true)).disabled(model.busy).accessibilityIdentifier("logs.edit.save.\(log.id)"); Button("Cancel") { model.cancelEdit() }.buttonStyle(WorkspaceButton()).disabled(model.busy) } } else { HStack(alignment: .firstTextBaseline, spacing: 12) { Text(LogFormatting.display(log.occurredAt, group: group, calendar: calendar)).font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)).monospacedDigit(); Text(log.body).font(.body).frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true) }; HStack { if !model.labels.isEmpty { Button { labelLogID = labelLogID == log.id ? nil : log.id } label: { Image(systemName: "tag").frame(width: 44, height: 44) }.accessibilityLabel("Choose labels for log").accessibilityIdentifier("logs.labels.\(log.id)").popover(isPresented: Binding(get: { labelLogID == log.id }, set: { if !$0 { labelLogID = nil } })) { labels(for: log) } }; Spacer(); Button("Edit log") { model.beginEdit(log) }.buttonStyle(WorkspaceButton()).accessibilityIdentifier("logs.edit.\(log.id)"); Button { removing = log } label: { Image(systemName: "trash").frame(width: 44, height: 44) }.accessibilityLabel("Remove log").accessibilityIdentifier("logs.remove.\(log.id)").foregroundStyle(WorkspaceTheme.danger(scheme)) } } }.padding(.vertical, 8).overlay(alignment: .top) { if let previous { Rectangle().fill(WorkspaceTheme.border(scheme)).frame(height: LogFormatting.sameHour(previous.occurredAt, log.occurredAt, calendar: calendar) ? 0 : 1) } }.accessibilityIdentifier("logs.row.\(log.id)") }
    private func labels(for log: Log) -> some View { VStack(alignment: .leading) { Text("Labels").font(.headline); ForEach(model.labels) { label in Button { Task { await model.toggleLabel(label.id, for: log) } } label: { Label(label.name, systemImage: log.labelIds.contains(label.id) ? "checkmark.square.fill" : "square").frame(minWidth: 180, minHeight: 44, alignment: .leading) }.disabled(model.labelBusyID == log.id) } }.padding() }
    private func errorNotice(_ text: String) -> some View { VStack(alignment: .leading, spacing: 8) { Label(text, systemImage: "exclamationmark.circle").foregroundStyle(WorkspaceTheme.danger(scheme)).font(.footnote); Button("Retry") { Task { await model.load() } }.buttonStyle(WorkspaceButton()) }.accessibilityElement(children: .contain).accessibilityIdentifier("logs.error") }
}
