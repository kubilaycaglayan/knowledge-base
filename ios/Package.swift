// swift-tools-version: 5.9
// This package can be opened in Xcode on macOS and targets the native SwiftUI client.
// Configure KNOW_API_URL in the scheme for a deployed API URL.
import PackageDescription

let package = Package(
    name: "Know",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.executable(name: "Know", targets: ["Know"])],
    targets: [
        .executableTarget(name: "Know", path: "Know"),
        .testTarget(name: "KnowTests", dependencies: ["Know"], path: "KnowTests")
    ]
)
