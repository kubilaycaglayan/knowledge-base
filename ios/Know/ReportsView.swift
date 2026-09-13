import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct ReportsView: View {
    @ObservedObject var model: ReportsModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private func duration(_ seconds: Int64) -> String {
        ReportsFormatting.duration(seconds)
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Reports").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                HStack {
                    Text("SUMMARY").font(.caption.weight(.bold))
                    Spacer()
                    Text(accessibilityStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("reports.status")
                        .accessibilityAddTraits(.updatesFrequently)
                }
                if model.report == nil {
                    if model.loading {
                        skeleton
                    } else {
                        ProgressView("Loading report…")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                    }
                } else {
                    content
                }
            }.padding(16).frame(maxWidth: 1200, alignment: .leading).frame(maxWidth: .infinity)
        }.refreshable { await model.retry() }
        .task { await model.load() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await model.load() } } }
        .onChange(of: accessibilityStatus) { _, status in announce(status) }
        .onChange(of: model.showSankey) { _, showSankey in announce(showSankey ? "Showing Sankey time flow." : "Showing activity bar chart.") }
        .onChange(of: model.trendline) { _, trendline in announce("Trendline \(trendline.title).") }
        .onChange(of: model.breakdown) { _, breakdown in announce("Breakdown grouped by \(breakdown.rawValue).") }
        .transaction { transaction in if reduceMotion { transaction.animation = nil } }
        .overlay(alignment: .top) { if let error = model.error { HStack { Label(error, systemImage: "exclamationmark.triangle"); Spacer(); Button("Try again") { Task { await model.retry() } }.frame(minWidth: 44, minHeight: 44).accessibilityHint("Retries loading the current report.").accessibilityIdentifier("reports.retry") }.padding(12).background(.thinMaterial).accessibilityElement(children: .contain) } }
        .accessibilityIdentifier("reports.page")
    }
    private var accessibilityStatus: String {
        if model.loading { return "Loading report…" }
        if let error = model.error { return "Report error: \(error) Try again." }
        if model.refreshing { return "Updating report…" }
        if let report = model.report { return "Report updated for \(report.from) through \(report.to)." }
        return "Reports ready."
    }
    private func announce(_ status: String) {
        #if canImport(UIKit)
        guard UIAccessibility.isVoiceOverRunning else { return }
        UIAccessibility.post(notification: .announcement, argument: status)
        #endif
    }
    private var skeleton: some View { VStack(alignment: .leading, spacing: 14) { ProgressView("Loading report…"); RoundedRectangle(cornerRadius: 8).fill(.secondary.opacity(0.15)).frame(height: 180); ForEach(0..<3, id: \.self) { _ in RoundedRectangle(cornerRadius: 5).fill(.secondary.opacity(0.12)).frame(height: 32) } }.accessibilityElement(children: .combine) }
    private var content: some View { VStack(alignment: .leading, spacing: 18) {
        Text("Tracked time").font(.headline); Text(duration(model.report?.totalSeconds ?? 0)).font(.system(size: 32, weight: .bold, design: .rounded)).monospacedDigit()
        controls
        if let report = model.report, report.days.isEmpty {
            Text("No report data for this period.").foregroundStyle(.secondary).padding(.vertical, 30)
            if report.sankey != nil { sankeyControl }
        } else {
            chart; breakdown
            if model.report?.sankey != nil { sankeyControl }
            calendarSummary
        }
    } }
    private var sankeyControl: some View { Group { Button(model.showSankey ? "Show bar chart" : "Show Sankey") { model.showSankey.toggle() }.frame(minHeight: 44).accessibilityHint("Switches between the activity chart and time flow.").accessibilityIdentifier("reports.sankey.toggle"); if model.showSankey { sankey } } }
    private var controls: some View { VStack(alignment: .leading, spacing: 10) {
        HStack { Button("Previous") { Task { await model.shift(-1) } }.padding(.vertical, 12).contentShape(Rectangle()).accessibilityHint("Moves to the previous report period."); Button("Next") { Task { await model.shift(1) } }.padding(.vertical, 12).contentShape(Rectangle()).accessibilityHint("Moves to the next report period."); Spacer(); Menu("Preset") { ForEach(ReportDateMath.presets, id: \.self) { preset in Button(preset) { Task { await model.setPreset(preset) } } } }.frame(minHeight: 44).accessibilityLabel("Report preset").accessibilityHint("Changes the report date range.").accessibilityIdentifier("reports.preset") }
        aggregationControl
        HStack { DatePicker("Start", selection: dateBinding(start: true), displayedComponents: .date).accessibilityIdentifier("reports.start"); DatePicker("End", selection: dateBinding(start: false), displayedComponents: .date).accessibilityIdentifier("reports.end") }.labelsHidden().frame(minHeight: 44).accessibilityElement(children: .contain)
        Text("\(model.query.startDate) – \(model.query.endDate)").font(.subheadline).monospacedDigit(); if let rangeError = model.rangeError { Text(rangeError).font(.caption).foregroundStyle(.red).accessibilityAddTraits(.isStaticText) }
        filterMenu(title: "Paths", options: model.pathOptions, selected: model.query.pathIDs, toggle: model.togglePath, clear: model.clearPaths)
        filterMenu(title: "Labels", options: model.labelOptions.map { Path(id: $0.id, name: $0.name, description: nil, status: "ACTIVE", color: $0.color) }, selected: model.query.labelIDs, toggle: model.toggleLabel, clear: model.clearLabels)
    }.accessibilityElement(children: .contain) }
    private var aggregationControl: some View {
        HStack(spacing: 0) {
            ForEach(ReportAggregation.allCases) { value in
                Button(value.title) { Task { await model.setAggregation(value) } }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(model.query.aggregation == value ? WorkspaceTheme.selected(scheme) : .clear)
                    .accessibilityAddTraits(model.query.aggregation == value ? .isSelected : [])
                    .accessibilityIdentifier("reports.aggregation.\(value.rawValue.lowercased())")
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(WorkspaceTheme.border(scheme)))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Report aggregation")
        .accessibilityValue(model.query.aggregation.title)
        .accessibilityHint("Changes how report time is grouped.")
        .accessibilityIdentifier("reports.aggregation")
    }
    private func dateBinding(start: Bool) -> Binding<Date> { Binding(get: { ReportDateMath.date(start ? model.query.startDate : model.query.endDate) ?? Date() }, set: { value in let date = ReportDateMath.iso(value); Task { await model.setRange(start: start ? date : model.query.startDate, end: start ? model.query.endDate : date) } }) }
    private func filterMenu(title: String, options: [Path], selected: [UUID], toggle: @escaping (UUID) async -> Void, clear: @escaping () async -> Void) -> some View { let key = title.lowercased(); return VStack(alignment: .leading, spacing: 4) { HStack { Text(title).font(.subheadline.weight(.semibold)); if !selected.isEmpty { Button("Clear") { Task { await clear() } }.font(.caption).frame(minHeight: 44).accessibilityHint("Removes all selected \(key) filters.").accessibilityIdentifier("reports.\(key).clear") }; Spacer(); Menu("Choose \(key)") { ForEach(options) { option in Button { Task { await toggle(option.id) } } label: { Label(option.name, systemImage: selected.contains(option.id) ? "checkmark.square" : "square") }.accessibilityAddTraits(selected.contains(option.id) ? .isSelected : []) } }.accessibilityLabel("Choose \(key)").accessibilityHint("Filters the report by \(key).").accessibilityIdentifier("reports.\(key).filter") }.frame(minHeight: 44); if !selected.isEmpty { HStack { ForEach(selected.compactMap { id in options.first(where: { $0.id == id }) }, id: \.id) { option in HStack(spacing: 3) { Text(option.name).lineLimit(2); Button { Task { await toggle(option.id) } } label: { Image(systemName: "xmark.circle.fill").frame(width: 44, height: 44) }.accessibilityLabel("Remove \(option.name)").accessibilityHint("Removes this \(key) filter.").accessibilityIdentifier("reports.\(key).remove.\(option.id.uuidString)") }.padding(.horizontal, 8).padding(.vertical, 5).background(.secondary.opacity(0.12), in: Capsule()) } }.fixedSize(horizontal: false, vertical: true) } } }
    private var chart: some View { VStack(alignment: .leading, spacing: 10) { HStack { Text(model.showSankey ? "TIME FLOW" : "Activity").font(.headline); Spacer(); Button("Trendline: \(model.trendline.title)") { model.trendline = ReportTrendline.allCases[(ReportTrendline.allCases.firstIndex(of: model.trendline)! + 1) % ReportTrendline.allCases.count] }.frame(minHeight: 44).accessibilityValue(model.trendline.title).accessibilityHint("Cycles through Off, Linear, and Parabolic").accessibilityAddTraits(model.trendline == .off ? [] : .isSelected).accessibilityIdentifier("reports.trendline") }; if model.showSankey { EmptyView() } else { let buckets = ReportCalculations.buckets(model.report!, query: model.query); ForEach(buckets) { bucket in HStack { Text(bucket.label).frame(width: 100, alignment: .leading); GeometryReader { proxy in if bucket.categories.isEmpty { RoundedRectangle(cornerRadius: 3).fill(WorkspaceTheme.accent(scheme)).frame(width: max(4, proxy.size.width * CGFloat(bucket.seconds) / CGFloat(max(1, model.report!.totalSeconds)))) } else { HStack(spacing: 0) { ForEach(Array(bucket.categories.enumerated()), id: \.element.identity) { index, category in RoundedRectangle(cornerRadius: index == 0 || index == bucket.categories.count - 1 ? 3 : 0).fill(WorkspaceTheme.color(category.color ?? WorkspaceTheme.palette[index % WorkspaceTheme.palette.count])).frame(width: max(2, proxy.size.width * CGFloat(category.seconds) / CGFloat(max(1, model.report!.totalSeconds)))) } } } }.frame(height: 18); Text(duration(bucket.seconds)).monospacedDigit().frame(width: 70, alignment: .trailing) }.frame(height: 28).accessibilityElement(children: .combine).accessibilityLabel(bucketAccessibilityLabel(bucket)).accessibilityIdentifier("reports.bucket.\(bucket.id)") }; if model.showCalendarInputs && model.query.aggregation == .day { calendarAnnotations }; let trend = ReportCalculations.trend(buckets, mode: model.trendline); if !trend.isEmpty { Text("\(model.trendline.title) trend: \(trend.map { duration($0.1) }.joined(separator: ", "))").font(.caption).foregroundStyle(.secondary).accessibilityLabel("\(model.trendline.title) trend values \(trend.map { duration($0.1) }.joined(separator: ", "))") } } }.padding(14).background(.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10)) }
    private var calendarAnnotations: some View { VStack(alignment: .leading, spacing: 5) { ForEach(model.report?.days.filter { $0.calendarNote != nil || !$0.calendarLabels.isEmpty } ?? []) { day in let labels = day.calendarLabels.map { "\($0.label): \(calendarPortionText($0.portion))" }.joined(separator: ", "); VStack(alignment: .leading, spacing: 3) { HStack(spacing: 5) { Image(systemName: day.calendarNote == nil ? "calendar" : "note.text").accessibilityHidden(true); Text(day.date).font(.caption.weight(.semibold)); ForEach(Array(day.calendarLabels.enumerated()), id: \.element.id) { index, label in Label(calendarPortionText(label.portion), systemImage: label.portion.map { $0 > 0 ? "rectangle.fill" : "bookmark.fill" } ?? "bookmark.fill").font(.caption2).lineLimit(1).padding(.horizontal, 5).padding(.vertical, 2).frame(width: calendarSegmentWidth(label.portion), alignment: .leading).foregroundStyle(WorkspaceTheme.color(label.color ?? WorkspaceTheme.palette[index % WorkspaceTheme.palette.count])).background(WorkspaceTheme.color(label.color ?? WorkspaceTheme.palette[index % WorkspaceTheme.palette.count]).opacity(0.14), in: Capsule()) } }.accessibilityHidden(true); if let note = day.calendarNote { Text(note).font(.caption).foregroundStyle(.secondary) } }.accessibilityElement(children: .combine).accessibilityLabel("Calendar input for \(day.date). \(labels)\(day.calendarNote.map { ", \($0)" } ?? "")") } }.accessibilityElement(children: .contain) }
    private func bucketAccessibilityLabel(_ bucket: ReportBucket) -> String { let categories = bucket.categories.map { "\($0.label): \(duration($0.seconds))" }.joined(separator: ", "); return "\(bucket.label), total \(duration(bucket.seconds)), \(categories)" }
    private var sankey: some View { Group { if let sankey = model.report?.sankey, !sankey.nodes.isEmpty { VStack(alignment: .leading, spacing: 10) { Text("Path timing by \(sankey.granularity.lowercased())").font(.subheadline); Text("\(sankey.links.count) tracked flow\(sankey.links.count == 1 ? "" : "s")").font(.caption).foregroundStyle(.secondary); ScrollView(.horizontal) { HStack(alignment: .top, spacing: 24) { ForEach(Array(Dictionary(grouping: sankey.nodes, by: \.depth).keys.sorted()), id: \.self) { depth in VStack(alignment: .leading) { Text("Stage \(depth + 1)").font(.caption.bold()); ForEach(sankey.nodes.filter { $0.depth == depth }) { node in Text("\(node.label) · \(duration(node.value))").padding(8).background(.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 6)).accessibilityLabel("\(node.bucketLabel), \(node.pathLabel), \(duration(node.value))") } } } }.frame(minWidth: 620, alignment: .leading).padding(.vertical, 8) }; VStack(alignment: .leading, spacing: 4) { ForEach(Array(sankey.links.enumerated()), id: \.offset) { _, link in Text("\(link.sourceLabel) to \(link.targetLabel) · \(duration(link.value))").font(.caption).accessibilityLabel("Flow from \(link.sourceLabel) to \(link.targetLabel), \(duration(link.value))") } } } } else { Text("No tracked time to show in this flow.").foregroundStyle(.secondary) } }.accessibilityElement(children: .contain) }
    private var calendarSummary: some View { Group { if model.query.aggregation == .day, let report = model.report, report.days.contains(where: { $0.calendarNote != nil || !$0.calendarLabels.isEmpty }) { VStack(alignment: .leading, spacing: 8) { HStack { Text("DAILY RECORDS").font(.caption.weight(.bold)); Spacer(); Button(model.showCalendarInputs ? "Hide calendar inputs" : "Show calendar inputs") { model.showCalendarInputs.toggle() }.frame(minHeight: 44).accessibilityIdentifier("reports.calendar.toggle") }; Text("Calendar log").font(.headline); if model.showCalendarInputs { ForEach(report.days.filter { $0.calendarNote != nil || !$0.calendarLabels.isEmpty }) { day in VStack(alignment: .leading, spacing: 4) { Text(calendarDateLabel(day.date)).font(.subheadline.weight(.semibold)); if let note = day.calendarNote { Text(note) }; ForEach(Array(day.calendarLabels.enumerated()), id: \.element.id) { index, label in Label("\(label.label) · \(calendarPortionText(label.portion))", systemImage: label.portion.map { $0 > 0 ? "rectangle.fill" : "bookmark.fill" } ?? "bookmark.fill").font(.caption).foregroundStyle(WorkspaceTheme.color(label.color ?? WorkspaceTheme.palette[index % WorkspaceTheme.palette.count])).accessibilityLabel("\(label.label), \(calendarPortionText(label.portion))") } }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8)) }; if !report.calendarLabels.isEmpty { Text("Calendar totals").font(.subheadline.weight(.semibold)); ForEach(report.calendarLabels) { total in Text("\(total.label) · \(calendarAggregateText(total))").font(.caption).accessibilityLabel("\(total.label), \(calendarAggregateText(total))") } } } } } } }
    private func calendarDateLabel(_ iso: String) -> String { guard let date = ReportDateMath.date(iso) else { return iso }; let formatter = DateFormatter(); formatter.locale = .current; formatter.setLocalizedDateFormatFromTemplate("EEE, MMM d"); return formatter.string(from: date) }
    private func calendarAggregateText(_ total: ReportCalendarTotal) -> String { var values: [String] = []; if total.days > 0 { values.append("\(total.days) day\(total.days == 1 ? "" : "s")") }; if total.markers > 0 { values.append("\(total.markers) marked day\(total.markers == 1 ? "" : "s")") }; return values.isEmpty ? "No marked days" : values.joined(separator: ", ") }
    private func calendarPortionText(_ portion: Decimal?) -> String { guard let portion else { return "Marked" }; return portion == 1 ? "1 day" : "\(portion) days" }
    private func calendarSegmentWidth(_ portion: Decimal?) -> CGFloat { guard let portion else { return 42 }; let value = NSDecimalNumber(decimal: portion).doubleValue; return max(42, min(132, CGFloat(value * 132))) }
    private var breakdown: some View {
        let values = model.breakdown == .path ? model.report!.paths : model.report!.sessionLabels
        let total = values.reduce(Int64(0)) { $0 + $1.seconds }
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Breakdown").font(.headline)
                Spacer()
                Menu {
                    ForEach(ReportBreakdown.allCases, id: \.self) { value in
                        Button { model.breakdown = value } label: {
                            if model.breakdown == value { Label(value.rawValue, systemImage: "checkmark") }
                            else { Text(value.rawValue) }
                        }
                    }
                } label: {
                    Text(model.breakdown.rawValue).frame(minWidth: 80, minHeight: 44)
                }
                .accessibilityLabel("Group by")
                .accessibilityValue(model.breakdown.rawValue)
                .accessibilityHint("Changes the report breakdown.")
                .accessibilityIdentifier("reports.breakdown")
            }
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(values.enumerated()), id: \.element.identity) { index, value in
                    HStack { Circle().fill(WorkspaceTheme.color(value.color ?? WorkspaceTheme.palette[index % WorkspaceTheme.palette.count])).frame(width: 10, height: 10); Text(value.label).lineLimit(2); Spacer(); Text(duration(value.seconds)).monospacedDigit() }.padding(.vertical, 6)
                }
            }
            if values.isEmpty { Text("No tracked time in this period.").foregroundStyle(.secondary) }
            VStack(alignment: .leading, spacing: 8) {
                donut(values: values, total: total).frame(width: 54, height: 54)
                VStack(alignment: .leading) { Text("Donut summary").font(.caption.weight(.semibold)); Text(duration(total)).monospacedDigit(); Text(values.isEmpty ? "No tracked time in this period." : values.map { "\($0.label): \(duration($0.seconds))" }.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
            }.accessibilityElement(children: .combine).accessibilityLabel("Breakdown total \(duration(total)). \(values.isEmpty ? "No tracked time in this period." : values.map { "\($0.label): \(duration($0.seconds))" }.joined(separator: ", "))")
            Text("\(model.report?.days.filter { $0.paths.reduce(0) { $0 + $1.seconds } > 0 }.count ?? 0) active days").font(.caption).foregroundStyle(.secondary)
        }.padding(14).background(.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
    @ViewBuilder private func donut(values: [ReportCategory], total: Int64) -> some View {
        ZStack {
            Circle().stroke(WorkspaceTheme.border(scheme), lineWidth: 14)
            if total > 0 { ForEach(Array(values.enumerated()), id: \.element.identity) { index, value in Circle().trim(from: donutStart(values, index: index, total: total), to: donutEnd(values, index: index, total: total)).stroke(WorkspaceTheme.color(value.color ?? WorkspaceTheme.palette[index % WorkspaceTheme.palette.count]), lineWidth: 14).rotationEffect(.degrees(-90)) } }
        }.accessibilityHidden(true)
    }
    private func donutStart(_ values: [ReportCategory], index: Int, total: Int64) -> CGFloat { CGFloat(Double(values.prefix(index).reduce(0) { $0 + $1.seconds }) / Double(total)) }
    private func donutEnd(_ values: [ReportCategory], index: Int, total: Int64) -> CGFloat { CGFloat(Double(values.prefix(index + 1).reduce(0) { $0 + $1.seconds }) / Double(total)) }
}
