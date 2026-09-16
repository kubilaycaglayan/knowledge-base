// swift-tools-version: 5.9
// This package can be opened in Xcode on macOS and targets the native SwiftUI client.
// Configure KNOW_API_URL in the scheme for a deployed API URL.
import PackageDescription

let package = Package(
  name: "Know",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [.executable(name: "Know", targets: ["Know"])],
  dependencies: [.package(url: "https://github.com/google/GoogleSignIn-iOS", exact: "9.2.0")],
  targets: [
    .executableTarget(
      name: "Know",
      dependencies: [
        .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS"),
        .product(name: "GoogleSignInSwift", package: "GoogleSignIn-iOS"),
      ], path: "Know", exclude: ["Info.plist"]),
    .testTarget(name: "KnowTests", dependencies: ["Know"], path: "KnowTests"),
  ]
)
