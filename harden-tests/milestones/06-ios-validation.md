# HARD-06: A usable iOS validation path

**Priority:** Medium  
**Status:** In progress
**Scope:** Validation workflow planning and documentation only.

Track completion in the [HARD-06 acceptance checklist](06-acceptance-checklist.md).

## Why this milestone exists

The iOS application has unit and UI tests, but both related GitHub Actions jobs
are hard-disabled with `if: ${{ false }}`. Linux can compile selected
Foundation-only note conversion code, but cannot build or verify SwiftUI and
simulator behavior. The current state therefore leaves native changes without
an active automated gate.

## Tasks

- [x] Verify current target configuration and workflow scope. `KnowTests` is
  the Swift package test target; XcodeGen's `Know` scheme includes
  `KnowUITests`. The historical disabled workflow runs all `KnowTests` cases
  but selects only the Notes list/editor/archive and line-history UI cases.
  See the source-by-source matrix in the [acceptance checklist](06-acceptance-checklist.md).
- [x] Complete the source-level per-screen inventory by test name, test class,
  flow, and evidence type. Existing model/unit coverage includes notes,
  sessions, logs, paths, labels, calendar, and reports; the matrix identifies
  model-only behavior and simulator UI omissions. See
  [`06-test-inventory.md`](06-test-inventory.md).
- [x] Decide and document a supported validation path: a manually owned
  release gate on macOS with retained `.xcresult`. The exact generation,
  simulator, signing, full-test, and artifact procedure is documented in
  [`06-supported-validation.md`](06-supported-validation.md). A clean-checkout
  run was completed on the supported macOS host; its test failures are recorded
  in the [HARD-06 run report](../runs/2026-10-09-hard06-ios-simulator.md).
- [x] Record that the current workspace host is Linux and lacks `xcodebuild`
  and `xcodegen`; the Foundation-only conversion workflow is the available
  host-side check, not a native-app validation path.
- [x] Define a safe simulator test account/data setup that is isolated and
  disposable; ensure test secrets are sourced from CI secrets or generated
  locally, never committed or logged. The default UI suite uses in-memory
  fixtures without accounts; optional live API credentials and cleanup rules
  are documented in [`06-supported-validation.md`](06-supported-validation.md).
- [ ] Use the HARD-06 behavior matrix to cover app launch, sign-in/session
  restore, API error handling, every implemented screen, create/edit/delete or
  archive/restore flows, offline/network failure recovery, keyboard and
  Dynamic Type behavior, and an end-to-end note save/line-history flow.
- [ ] Make simulator tests deterministic around locale, calendar/time zone,
  animation, network fixtures, and asynchronous waits. Capture screenshots and
  `.xcresult` on failure without sensitive data.
- [x] Keep Linux `check-ios-note-document.sh` as a focused portability check,
  and state clearly that it is not evidence of SwiftUI or simulator success.

## Acceptance evidence

- A documented command or active CI job builds the app and runs the intended
  unit/UI test set on a supported macOS/Xcode environment.
- Failure artifacts include `.xcresult` and relevant screenshots/logs with
  secrets scrubbed.
- The test matrix names untested native flows and marks them as manual or
  deferred rather than implying full iOS coverage.
- Model/API unit tests, simulator UI tests, live-backend smoke, and manual
  device checks are labeled separately; no one evidence type silently
  substitutes for another.
- Mobile Chrome desktop/phone browser profiles remain separate from native
  simulator coverage in the shared hardening plan.
- Any workflow change is tested on the actual supported runner before the
  disabled state is changed.

The source inventory and proposed manual release path are documented, but this
milestone remains in progress: the clean-checkout macOS run failed eight tests.
Focused reruns have verified corrections for the seven UI failures, including
the Labels case after scrolling and querying by accessible label; a combined
rerun and a passing full-scheme run are still required. Persistence and device
coverage gaps also need coverage or explicit manual/deferred evidence. See the
[HARD-06 run report](../runs/2026-10-09-hard06-ios-simulator.md).

## Relevant sources

- `.github/workflows/verify.yml` (`ios` and `ios-note-document` jobs)
- `ios/Package.swift`, `ios/project.yml`, `ios/KnowTests/`, `ios/KnowUITests/`
- `scripts/check-ios-note-document.sh`
- `docs/ios-auth-state-matrix.md`
- `docs/ios-sessions-parity.md`
- `docs/testing.md`
