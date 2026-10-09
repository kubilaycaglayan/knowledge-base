# HARD-06 supported native validation path

## Gate and ownership

Until a maintained macOS CI runner is configured as a gate, the supported
release procedure is a simulator run owned by the release engineer for each
release candidate that changes `ios/`. A clean-checkout execution of the
procedure on GitHub's hosted macOS runner is recorded in
[`2026-10-09-hard06-ios-simulator.md`](../runs/2026-10-09-hard06-ios-simulator.md).
Project generation and build succeeded, but test failures mean this procedure
is not yet a passing release gate. Linux Swift/Foundation checks and mobile web
browser profiles do not satisfy native validation.

This path has been exercised from a clean checkout on GitHub-hosted
`macos-latest` with Xcode 26.6, XcodeGen 2.46.0, and an iPhone 17 Pro simulator
on iOS 26.5. The exact OS/build details and failed test results are in the run
record. The current workspace remains Linux. The project requires XcodeGen
2.38.0 or newer, Swift 5.9 language mode, and iOS 17 or newer; record exact
host/tool/runtime versions for every subsequent run.

## Clean-checkout procedure

From the repository root on the Mac:

```bash
mkdir -p harden-tests/artifacts
cd ios
brew install xcodegen
xcodegen generate --spec project.yml
xcrun simctl list devices available
```

Select an available iPhone simulator and use its exact UDID. Then build and run
the complete `Know` scheme, which includes `KnowTests` and `KnowUITests`:

```bash
xcodebuild test \
  -project Know.xcodeproj \
  -scheme Know \
  -destination 'platform=iOS Simulator,id=<IPHONE_SIMULATOR_UDID>' \
  -resultBundlePath "$PWD/../harden-tests/artifacts/Know.xcresult" \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=
```

Create the artifact parent directory before running. Do not add
`-only-testing` filters for the release gate. The scheme must run all unit and
UI tests. Simulator execution does not need a development team or signing
identity. Use the tested simulator-only ad hoc identity shown above; do not
disable signing for this suite. In the first full run, the Keychain unit test
failed with signing disabled, while a targeted rerun passed using this ad hoc
configuration. Never add a production certificate or provisioning profile to
the repository.

The `Know` package target in `ios/Package.swift` is useful for package-level
checks, but it does not include `KnowUITests`; the generated Xcode project and
scheme are required for the complete gate. The historical workflow is not the
gate: `.github/workflows/verify.yml` hard-disables both `ios` and
`ios-note-document`, and its old iOS job selected only all unit tests plus two
Notes UI tests.

## Determinism and fixture boundary

- Standard UI tests use the app's `-ui-testing` launch argument and in-memory
  fixtures. Authenticated workspace cases use `-ui-testing-authenticated` and
  deterministic fixture entities; they do not require a real user account or
  backend. Keep these as the default simulator test mode.
- The one opt-in live Reports test,
  `KnowUITests.testReportsLiveAPIFlowWhenExplicitlyConfigured`, requires
  `KNOW_PHYSICAL_REPORTS_API_URL`, `KNOW_PHYSICAL_REPORTS_EMAIL`, and
  `KNOW_PHYSICAL_REPORTS_PASSWORD`. Do not run it in the default release gate.
  If separately needed, use an isolated disposable local account, source its
  credentials from the host secret store, keep values out of command lines and
  logs, and delete the account/data after the run. Never use production or
  personal credentials.
- Before each run, use a newly booted simulator and launch the test runner's
  deterministic fixtures. Avoid dependence on a previously logged-in app,
  Keychain contents, or persistent simulator state. The source suite currently
  does not set a single global locale/time zone/animation policy; tests with
  date behavior must set their own fixed calendar/time zone, and the remaining
  device-wide determinism work is tracked in the acceptance checklist.
- On failure, retain the `.xcresult` and only the screenshots or logs needed
  to diagnose it. Inspect attachments before sharing; remove credentials,
  bearer tokens, account identifiers, and personal records. Store artifacts in
  access-controlled release storage, link their location and retention date in
  the release record, and do not commit results to Git.

## Completion evidence still required

This path becomes a passing release gate only after the remaining UI failures
recorded in the run report are triaged through the bug-fix workflow and a later
clean full-scheme run succeeds with its exact host/tool/runtime/device versions
and result bundle retained. Any move to CI requires a separately verified
macOS runner, XcodeGen install, simulator selection, signing assumptions, and
artifact retention before changing either disabled workflow job.
