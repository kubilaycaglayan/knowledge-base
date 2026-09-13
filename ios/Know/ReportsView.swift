import SwiftUI

struct ReportsView: View {
    @ObservedObject var model: ReportsModel
    @Environment(\.colorScheme) private var scheme
    private let duration: (Int64) -> String = { seconds in
        let hours = seconds / 3600; let minutes = (seconds % 3600) / 60
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack { Text("SUMMARY").font(.caption.weight(.bold)); Spacer(); if model.refreshing { Text("Updating report…").font(.caption).accessibilityAddTraits(.updatesFrequently) } }
                if model.loading && model.report == nil { skeleton } else { content }
            }.padding(16).frame(maxWidth: 1200, alignment: .leading).frame(maxWidth: .infinity)
        }.refreshable { await model.retry() }
        .task { await model.load() }
        .overlay(alignment: .top) { if let error = model.error { HStack { Label(error, systemImage: "exclamationmark.triangle"); Spacer(); Button("Try again") { Task { await model.retry() } }.accessibilityIdentifier("reports.retry") }.padding(12).background(.thinMaterial).accessibilityAddTraits(.isStaticText) } }
        .accessibilityIdentifier("reports.page")
    }
    private var skeleton: some View { VStack(alignment: .leading, spacing: 14) { ProgressView("Loading report…"); RoundedRectangle(cornerRadius: 8).fill(.secondary.opacity(0.15)).frame(height: 180); ForEach(0..<3, id: \.self) { _ in RoundedRectangle(cornerRadius: 5).fill(.secondary.opacity(0.12)).frame(height: 32) } }.accessibilityElement(children: .combine) }
    private var content: some View { VStack(alignment: .leading, spacing: 18) {
        Text("Tracked time").font(.headline); Text(duration(model.report?.totalSeconds ?? 0)).font(.system(size: 32, weight: .bold, design: .rounded)).monospacedDigit()
        controls
        if let report = model.report, report.days.isEmpty { Text("No report data for this period.").foregroundStyle(.secondary).padding(.vertical, 30) } else { chart; breakdown; if model.report?.sankey != nil { Button(model.showSankey ? "Show bar chart" : "Show Sankey") { model.showSankey.toggle() }.frame(minHeight: 44) } }
    } }
    private var controls: some View { VStack(alignment: .leading, spacing: 10) {
        HStack { Button("Previous") { Task { await model.shift(-1) } }.frame(minHeight: 44); Button("Next") { Task { await model.shift(1) } }.frame(minHeight: 44); Spacer(); Menu("Preset") { ForEach(ReportDateMath.presets, id: \.self) { preset in Button(preset) { Task { await model.setPreset(preset) } } } } }
        Picker("Aggregation", selection: Binding(get: { model.query.aggregation }, set: { value in Task { await model.setAggregation(value) } })) { ForEach(ReportAggregation.allCases) { Text($0.title).tag($0) } }.pickerStyle(.segmented).accessibilityIdentifier("reports.aggregation")
        Text("\(model.query.startDate) – \(model.query.endDate)").font(.subheadline).monospacedDigit()
        filterMenu(title: "Paths", options: model.pathOptions, selected: model.query.pathIDs, toggle: model.togglePath, clear: model.clearPaths)
        filterMenu(title: "Labels", options: model.labelOptions.map { Path(id: $0.id, name: $0.name, description: nil, status: "ACTIVE", color: $0.color) }, selected: model.query.labelIDs, toggle: model.toggleLabel, clear: model.clearLabels)
    }.accessibilityElement(children: .contain) }
    private func filterMenu(title: String, options: [Path], selected: [UUID], toggle: @escaping (UUID) async -> Void, clear: @escaping () async -> Void) -> some View { VStack(alignment: .leading, spacing: 4) { HStack { Text(title).font(.subheadline.weight(.semibold)); if !selected.isEmpty { Button("Clear") { Task { await clear() } }.font(.caption) }; Spacer(); Menu("Choose \(title.lowercased())") { ForEach(options) { option in Button { Task { await toggle(option.id) } } label: { Label(option.name, systemImage: selected.contains(option.id) ? "checkmark.square" : "square") } } } }.frame(minHeight: 44); if !selected.isEmpty { Text(selected.compactMap { id in options.first(where: { $0.id == id })?.name }.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) } } }
    private var chart: some View { VStack(alignment: .leading, spacing: 10) { HStack { Text(model.showSankey ? "TIME FLOW" : "Activity").font(.headline); Spacer(); Button("Trendline: \(model.trendline.title)") { model.trendline = ReportTrendline.allCases[(ReportTrendline.allCases.firstIndex(of: model.trendline)! + 1) % ReportTrendline.allCases.count] }.frame(minHeight: 44).accessibilityValue(model.trendline.title) }; if model.showSankey { Text("No tracked time to show in this flow.").foregroundStyle(.secondary) } else { ForEach(ReportCalculations.buckets(model.report!, query: model.query)) { bucket in HStack { Text(bucket.label).frame(width: 100, alignment: .leading); GeometryReader { proxy in RoundedRectangle(cornerRadius: 3).fill(WorkspaceTheme.accent(scheme)).frame(width: max(4, proxy.size.width * CGFloat(bucket.seconds) / CGFloat(max(1, model.report!.totalSeconds)))) }.frame(height: 18); Text(duration(bucket.seconds)).monospacedDigit().frame(width: 70, alignment: .trailing) }.frame(height: 28).accessibilityElement(children: .combine).accessibilityLabel("\(bucket.label), \(duration(bucket.seconds))") } } }.padding(14).background(.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10)) }
    private var breakdown: some View { VStack(alignment: .leading, spacing: 8) { HStack { Text("Breakdown").font(.headline); Spacer(); Picker("Group by", selection: $model.breakdown) { ForEach(ReportBreakdown.allCases, id: \.self) { Text($0.rawValue).tag($0) } }.labelsHidden() }; let values = model.breakdown == .path ? model.report!.paths : model.report!.sessionLabels; ForEach(values) { value in HStack { Circle().fill(WorkspaceTheme.accent(scheme)).frame(width: 10, height: 10); Text(value.label).lineLimit(2); Spacer(); Text(duration(value.seconds)).monospacedDigit() }.padding(.vertical, 6) }; if values.isEmpty { Text("No tracked time in this period.").foregroundStyle(.secondary) }; Text("\(model.report?.days.filter { $0.totalSeconds > 0 }.count ?? 0) active days").font(.caption).foregroundStyle(.secondary) }.padding(14).background(.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10)) }
}
