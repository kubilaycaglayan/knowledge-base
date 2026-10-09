# HARD-06 supported native validation path

## Gate and ownership

Until a maintained macOS CI runner is configured and verified, the supported
release gate is a manual simulator run owned by the release engineer for each
release candidate that changes `ios/`. The owner records the Xcode, macOS,
XcodeGen, simulator runtime/device, commit, command result, and artifact
location in the release record. Linux Swift/Foundation checks and mobile web
browser profiles do not satisfy this gate.

This is a proposed path, not a claim of a completed native build. The current
workspace is Linux and cannot verify the commands below. Run them from a clean
checkout on a maintained macOS host with Xcode and the iOS simulator runtime
installed before relying on this gate. The project requires XcodeGen 2.38.0 or
newer, Swift 5.9 language mode, and iOS 17 or newer. Use the Xcode version
supported by the selected macOS host and record its exact version; do not infer
successful compatibility from the project manifest alone.

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
  CODE_SIGNING_ALLOWED=NO
```

Create the artifact parent directory before running. Do not add
`-only-testing` filters for the release gate. The scheme must run all unit and
UI tests. Simulator execution does not need a development team or signing
identity; if the selected Xcode requires signing, use simulator-only ad hoc
configuration and never add a production certificate or provisioning profile
to the repository.

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

This path becomes an established gate only after an owner completes it from a
clean checkout on the selected Mac and records a successful full-scheme run,
the exact host/tool/runtime/device versions, and the retained result bundle.
Any move to CI requires a separately verified macOS runner, XcodeGen install,
simulator selection, signing assumptions, and artifact retention before
changing either disabled workflow job.
