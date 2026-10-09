# HARD-06 Linux note-document portability run

## Run metadata

| Field | Value |
| --- | --- |
| Result | **Passed**, Foundation-only portability check |
| Date | 2026-10-09 |
| Host | Linux x86_64 (`Linux art 7.0.0-38-generic`) |
| Command | `./scripts/check-ios-note-document.sh` |
| Test target | `NoteDocTests` in the script's Swift container |
| Outcome | 7 tests passed, 0 failed |

The script built the note-document package in its Swift container and ran the
conversion and line-history rule tests. This verifies the shared Foundation
code on Linux. It does not compile the iOS app or SwiftUI, generate the Xcode
project, run a simulator, or establish rendered UI behavior. See the separate
[hosted macOS simulator run](2026-10-09-hard06-ios-simulator.md) for native
evidence; that run failed eight tests.
