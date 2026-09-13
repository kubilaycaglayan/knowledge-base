import Foundation
import SwiftUI

// Semantic values from frontend/src/theme.css; keep this mapping explicit.
enum WorkspaceTheme {
    static let palette = [
        "#F8FAFC", "#64748B", "#0F172A", "#EAB308", "#F59E0B",
        "#F97316", "#EF4444", "#EC4899", "#A855F7", "#6366F1",
        "#3B82F6", "#06B6D4", "#14B8A6", "#22C55E", "#84CC16",
    ]
    static func color(_ hex: String) -> Color {
        let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x64748B
        return Color(red: Double(value >> 16 & 255) / 255, green: Double(value >> 8 & 255) / 255, blue: Double(value & 255) / 255)
    }
    static func background(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "151a22" : "f7f8fa") }
    static func surface(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "1c2430" : "ffffff") }
    static func text(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "e1e6ee" : "252b36") }
    static func muted(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "a7b2c2" : "606b7b") }
    static func border(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "343e4c" : "dfe3e9") }
    static func control(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "697789" : "aab3c0") }
    static func selected(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "303e52" : "e7ebf0") }
    static func accent(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "c4d1e2" : "334155") }
    static func onAccent(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "18212e" : "ffffff") }
    static func danger(_ scheme: ColorScheme) -> Color { color(scheme == .dark ? "ffaaaa" : "a12727") }
    static func chartColor(_ hex: String, _ scheme: ColorScheme) -> Color { color(accessibleChartHex(hex, scheme)) }

    static func accessibleChartHex(_ hex: String, _ scheme: ColorScheme) -> String { accessibleChartHex(hex, dark: scheme == .dark) }

    static func accessibleChartHex(_ hex: String, dark: Bool) -> String {
        let base = components(hex)
        let background = components(dark ? "151a22" : "f7f8fa")
        guard contrastRatio(base, background) < 3.1 else { return normalizedHex(base) }

        if !dark {
            var low = 0.0, high = 1.0
            for _ in 0..<24 {
                let factor = (low + high) / 2
                if contrastRatio(base.map { $0 * factor }, background) >= 3.1 { low = factor } else { high = factor }
            }
            return normalizedHex(base.map { $0 * low })
        }

        var low = 0.0, high = 1.0
        for _ in 0..<24 {
            let factor = (low + high) / 2
            let adjusted = base.map { $0 + (1 - $0) * factor }
            if contrastRatio(adjusted, background) >= 3.1 { high = factor } else { low = factor }
        }
        return normalizedHex(base.map { $0 + (1 - $0) * high })
    }

    private static func components(_ hex: String) -> [Double] {
        let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x64748B
        return [Double(value >> 16 & 255) / 255, Double(value >> 8 & 255) / 255, Double(value & 255) / 255]
    }
    private static func luminance(_ components: [Double]) -> Double { let linear = components.map { $0 <= 0.03928 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }; return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] }
    private static func contrastRatio(_ foreground: [Double], _ background: [Double]) -> Double { let a = luminance(foreground), b = luminance(background); return (max(a, b) + 0.05) / (min(a, b) + 0.05) }
    private static func normalizedHex(_ components: [Double]) -> String { components.map { String(format: "%02X", Int(($0 * 255).rounded())).padding(toLength: 2, withPad: "0", startingAt: 0) }.joined() }
}

struct WorkspaceControl: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @ScaledMetric(relativeTo: .body) private var fontSize = 16.0
    func body(content: Content) -> some View {
        content.font(.system(size: fontSize)).padding(.horizontal, 10).frame(minHeight: 44)
            .background(WorkspaceTheme.background(scheme), in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(WorkspaceTheme.control(scheme)))
    }
}

struct WorkspaceButton: ButtonStyle {
    @Environment(\.colorScheme) private var scheme
    var primary = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.subheadline.weight(.medium)).padding(.horizontal, 12).frame(minHeight: 44)
            .foregroundStyle(primary ? WorkspaceTheme.onAccent(scheme) : WorkspaceTheme.text(scheme))
            .background(primary ? WorkspaceTheme.accent(scheme) : WorkspaceTheme.surface(scheme), in: RoundedRectangle(cornerRadius: 4))
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(primary ? WorkspaceTheme.accent(scheme) : WorkspaceTheme.control(scheme)))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct WorkspaceChip: View {
    @Environment(\.colorScheme) private var scheme
    let text: String
    var color: String? = nil
    var prominent = false
    var body: some View {
        Text(text).font(prominent ? .subheadline.weight(.semibold) : .caption).padding(.horizontal, 6).padding(.vertical, 3)
            .foregroundStyle(WorkspaceTheme.text(scheme))
            .background(color == nil ? WorkspaceTheme.selected(scheme) : WorkspaceTheme.surface(scheme))
            .overlay(RoundedRectangle(cornerRadius: 4).fill(color.map(WorkspaceTheme.color)?.opacity(0.14) ?? .clear))
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(color.map(WorkspaceTheme.color)?.opacity(0.4) ?? WorkspaceTheme.border(scheme)))
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

/// Wrap chips like the mobile web's flex-wrap without measuring view geometry in state.
struct WorkspaceFlow: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? 320, subviews: subviews).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(width: bounds.width, subviews: subviews)
        for (index, point) in result.points.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: ProposedViewSize(width: min(bounds.width, subviews[index].sizeThatFits(.unspecified).width), height: nil))
        }
    }
    private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, points: [CGPoint]) {
        var x: CGFloat = 0, y: CGFloat = 0, height: CGFloat = 0
        var points: [CGPoint] = []
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: min(width, view.sizeThatFits(.unspecified).width), height: nil))
            if x > 0 && x + size.width > width { x = 0; y += height + spacing; height = 0 }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            height = max(height, size.height)
        }
        return (CGSize(width: width, height: y + height), points)
    }
}
