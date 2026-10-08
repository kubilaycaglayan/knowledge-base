#!/usr/bin/env bash
set -euo pipefail

# Compiles the iOS app's NoteDocument (ios/Know/NotesModels.swift) on Linux
# with the official Swift image and runs its XCTest cases from
# ios/KnowTests/NotesTests.swift (every test whose name starts with
# testDocument or testPlainText). SwiftUI cannot build on Linux, but this
# conversion is Foundation-only and decides what an iOS save does to a note.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
package="$(mktemp -d)"
trap 'rm -rf "$package"' EXIT
mkdir -p "$package/Sources/NoteDoc" "$package/Tests/NoteDocTests"
python3 - "$package" <<'PY'
import re, sys
package = sys.argv[1]
models = open("ios/Know/NotesModels.swift").read()
start, end = models.index("enum NoteDocument {"), models.index("protocol NotesTransport")
open(f"{package}/Sources/NoteDoc/NoteDocument.swift", "w").write("import Foundation\n\n" + models[start:end])
tests = open("ios/KnowTests/NotesTests.swift").read()
bodies = [tests[m.start():tests.index("\n  }\n", m.start()) + 5] for m in re.finditer(r"^  func (testDocument|testPlainText)\w*\(\)", tests, re.M)]
if not bodies:
    sys.exit("no NoteDocument tests found in ios/KnowTests/NotesTests.swift")
open(f"{package}/Tests/NoteDocTests/NoteDocTests.swift", "w").write(
    "import XCTest\n@testable import NoteDoc\n\nfinal class NoteDocTests: XCTestCase {\n" + "\n".join(bodies) + "}\n")
open(f"{package}/Package.swift", "w").write(
    '// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "NoteDoc", targets: [.target(name: "NoteDoc"), .testTarget(name: "NoteDocTests", dependencies: ["NoteDoc"])])\n')
PY
docker run --rm -v "$package:/pkg" -w /pkg swift:5.10 swift test
