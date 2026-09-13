import SwiftUI

struct CalendarView: View {
    @ObservedObject var model: CalendarModel
    @Environment(\.colorScheme) private var scheme
    @State private var newLabel = ""
    @State private var newLabelColor = WorkspaceTheme.palette[0]
    @State private var newLabelPaletteOpen = false
    @State private var paletteLabel: KBLabel?
    private let weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) { Text("DAILY RECORDS").font(.caption.weight(.semibold)); Text("Calendar").font(.largeTitle.bold()); Text("Record leave, milestones, and the days worth remembering.").foregroundStyle(WorkspaceTheme.muted(scheme)) }
            if let error = model.error { HStack { Text(error); Spacer(); Button("Retry") { Task { await model.retry() } } }.padding(12).background(WorkspaceTheme.surface(scheme), in: RoundedRectangle(cornerRadius: 8)).foregroundStyle(WorkspaceTheme.danger(scheme)).accessibilityElement(children: .combine).accessibilityLabel(error) }
            monthHeader
            calendarGrid
            editor
        }.padding(16).frame(maxWidth: 900, alignment: .leading) }
        .task { if !model.loaded { await model.load() } }
        .sheet(item: $paletteLabel) { label in palette(for: label) }
        .sheet(isPresented: $newLabelPaletteOpen) { newLabelPalette }
    }

    private var monthHeader: some View { HStack {
        Button { Task { await model.moveMonth(-1) } } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("Previous month")
        VStack { Text(model.month, format: .dateTime.month(.wide).year()).font(.title3.bold()); DatePicker("Choose month", selection: Binding(get: { model.month }, set: { value in Task { await model.setMonth(value) } }), displayedComponents: [.date]).labelsHidden().accessibilityLabel("Choose month and year") }
        Button { Task { await model.moveMonth(1) } } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel("Next month")
        Spacer()
    }.buttonStyle(.plain) }

    private var calendarGrid: some View { VStack(spacing: 4) {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)) { ForEach(weekdays, id: \.self) { Text($0).font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)).frame(minHeight: 28) } }
        if model.loading { HStack { ProgressView(); Text("Loading calendar…") }.frame(maxWidth: .infinity, minHeight: 280).accessibilityElement(children: .combine).accessibilityIdentifier("calendar.loading") }
        else { LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) { ForEach(model.gridDates, id: \.self) { day in dayCell(day) } } }
    }.accessibilityIdentifier("calendar.grid") }

    private func dayCell(_ day: Date) -> some View {
        let key = CalendarDate.string(day, calendar: model.calendar)
        let record = model.days[key]
        let inMonth = model.calendar.isDate(day, equalTo: model.month, toGranularity: .month)
        let selected = model.calendar.isDate(day, inSameDayAs: model.selectedDate)
        return Button { model.select(day) } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(day, format: .dateTime.day()).font(.subheadline.weight(selected ? .bold : .regular))
                if let record {
                    if record.note != nil { Text("Note").font(.caption2) }
                    ForEach(record.labels.prefix(2)) { label in Text(label.name).font(.caption2).lineLimit(1) }
                    if record.labels.count > 2 { Text("+\(record.labels.count - 2)").font(.caption2) }
                }
                Spacer(minLength: 0)
            }
            .padding(6).frame(maxWidth: .infinity, minHeight: 58, alignment: .topLeading)
            .background(model.inRange(day) || selected ? WorkspaceTheme.selected(scheme) : WorkspaceTheme.surface(scheme), in: RoundedRectangle(cornerRadius: 6))
            .opacity(inMonth ? 1 : 0.48)
        }
        .buttonStyle(.plain).accessibilityIdentifier("calendar.day.\(key)")
        .accessibilityLabel(dayLabel(day, record: record))
        .accessibilityHint("Tap to edit this day. Long-press to start a date range.")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .onLongPressGesture(minimumDuration: 0.35) { model.beginRange(day) }
        .accessibilityAction(named: "Start range") { model.beginRange(day) }
    }

    private func dayLabel(_ day: Date, record: CalendarDay?) -> String { let formatter = DateFormatter(); formatter.dateStyle = .full; formatter.timeStyle = .none; formatter.calendar = model.calendar; var value = formatter.string(from: day); if record?.note != nil { value += ", note" }; if let labels = record?.labels, !labels.isEmpty { value += ", \(labels.count) label\(labels.count == 1 ? "" : "s")" }; return value }

    private var editor: some View { VStack(alignment: .leading, spacing: 12) {
        if let title = model.rangeTitle { Text(title).font(.title3.bold()) } else { Text(model.selectedDate, format: .dateTime.weekday(.wide).month(.wide).day().year()).font(.title3.bold()) }
        if model.selectingRange { Text("Release on another day to select a range.").font(.caption).foregroundStyle(WorkspaceTheme.muted(scheme)).accessibilityIdentifier("calendar.range.prompt") }
        TextEditor(text: $model.note).frame(minHeight: 90).padding(4).overlay(RoundedRectangle(cornerRadius: 6).stroke(WorkspaceTheme.border(scheme))).accessibilityLabel("What happened today?").onChange(of: model.note) { _, value in if value.count > 20_000 { model.note = String(value.prefix(20_000)) } }
        if model.loaded && !model.loading && model.labels.isEmpty { Text("Create a label below to begin.").foregroundStyle(WorkspaceTheme.muted(scheme)) } else { ForEach(model.labels) { label in labelRow(label) } }
        HStack { Button(model.rangeEnd != nil ? "Apply to range" : model.saving ? "Saving…" : "Save day") { Task { await model.save() } }.buttonStyle(WorkspaceButton(primary: true)).disabled(model.saving || model.selectingRange); if model.saving { ProgressView().accessibilityHidden(true) }; if model.isRangeMode { Button("Cancel range") { model.cancelRange() }.buttonStyle(WorkspaceButton()) } else { Button("Select range") { model.beginRange(model.selectedDate) }.buttonStyle(WorkspaceButton()) } }
        HStack { TextField("New label, e.g. Vacation", text: $newLabel).modifier(WorkspaceControl()).accessibilityLabel("New calendar label").onChange(of: newLabel) { _, value in if value.count > 80 { newLabel = String(value.prefix(80)) } }.onSubmit { addLabel() }; Button { newLabelPaletteOpen = true } label: { Circle().fill(WorkspaceTheme.color(newLabelColor)).frame(width: 28, height: 28).frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Choose new label color (\(newLabelColor))"); Button("Add") { addLabel() }.disabled(model.addingLabel || newLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }.accessibilityIdentifier("calendar.new-label")
    }.padding(16).background(WorkspaceTheme.surface(scheme), in: RoundedRectangle(cornerRadius: 10)).accessibilityElement(children: .contain).accessibilityIdentifier("calendar.editor") }

    @ViewBuilder private func labelRow(_ label: KBLabel) -> some View { HStack { Button { model.toggle(label) } label: { Image(systemName: model.selectedAssignments[label.id] == nil ? "square" : "checkmark.square.fill").frame(width: 44, height: 44) }.buttonStyle(.plain).accessibilityLabel("\(model.selectedAssignments[label.id] == nil ? "Select" : "Deselect") \(label.name)"); Circle().fill(WorkspaceTheme.color(label.color ?? WorkspaceTheme.palette[0])).frame(width: 14, height: 14); Text(label.name).lineLimit(2); Spacer(); if let portion = model.selectedAssignments[label.id] { Menu { ForEach(CalendarPortion.allCases) { option in Button(option.title) { model.setPortion(option, for: label) } } } label: { Text(portion.title).frame(minWidth: 80, minHeight: 44) }.accessibilityLabel("Portion for \(label.name)").accessibilityIdentifier("calendar.portion.\(label.id)") }; Button { paletteLabel = label } label: { Image(systemName: "paintpalette").frame(width: 44, height: 44) }.accessibilityLabel("Change \(label.name) color") } }
    private func palette(for label: KBLabel) -> some View { VStack { Text("Color for \(label.name)").font(.headline); ForEach(WorkspaceTheme.palette, id: \.self) { color in Button { Task { _ = await model.updateLabelColor(label, color: color); paletteLabel = nil } } label: { HStack { Circle().fill(WorkspaceTheme.color(color)).frame(width: 28, height: 28); Text(color); if label.color == color { Image(systemName: "checkmark") } }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading) }.accessibilityLabel("Choose \(color) color") } }.padding(24).presentationDetents([.medium]) }
    private var newLabelPalette: some View { ScrollView { VStack { Text("New calendar label color").font(.headline); ForEach(WorkspaceTheme.palette, id: \.self) { color in Button { newLabelColor = color; newLabelPaletteOpen = false } label: { HStack { Circle().fill(WorkspaceTheme.color(color)).frame(width: 28, height: 28); Text(color); if newLabelColor == color { Image(systemName: "checkmark") } }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading) }.accessibilityLabel("Choose new label color: \(color)") } }.padding(24) }.presentationDetents([.medium, .large]) }
    private func addLabel() { Task { if await model.createLabel(name: newLabel, color: newLabelColor) { newLabel = "" } } }
}
