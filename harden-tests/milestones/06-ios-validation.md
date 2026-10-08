# HARD-06: A usable iOS validation path

**Priority:** Medium  
**Status:** Planned  
**Scope:** Validation workflow planning and documentation only.

Track completion in the [HARD-06 acceptance checklist](06-acceptance-checklist.md).

## Why this milestone exists

The iOS application has unit and UI tests, but both related GitHub Actions jobs
are hard-disabled with `if: ${{ false }}`. Linux can compile selected
Foundation-only note conversion code, but cannot build or verify SwiftUI and
simulator behavior. The current state therefore leaves native changes without
an active automated gate.

## Tasks

- [ ] Inventory iOS unit and UI test coverage by screen, API flow, auth state,
  and shared behavior (notes, sessions, logs, paths, labels, calendar,
  reports). Identify UI tests omitted from the historical workflow and why.
- [ ] Decide and document a supported validation path: a maintained macOS
  runner/job, a clearly owned manual release gate with retained `.xcresult`, or
  another supported CI host. Do not re-enable the existing job until the
  runner, signing assumptions, XcodeGen setup, simulator selection, and
  artifact retention are verified.
- [ ] Define a safe simulator test account/data setup that is isolated and
  disposable; ensure test secrets are sourced from CI secrets or generated
  locally, never committed or logged.
- [ ] Cover app launch, sign-in/session restore, API error handling, list/detail
  navigation, create/edit/archive/restore flows, offline/network failure
  recovery, keyboard and Dynamic Type behavior, and at least one end-to-end
  note save/line-history flow.
- [ ] Make simulator tests deterministic around locale, calendar/time zone,
  animation, network fixtures, and asynchronous waits. Capture screenshots and
  `.xcresult` on failure without sensitive data.
- [ ] Keep Linux `check-ios-note-document.sh` as a focused portability check,
  and state clearly that it is not evidence of SwiftUI or simulator success.

## Acceptance evidence

- A documented command or active CI job builds the app and runs the intended
  unit/UI test set on a supported macOS/Xcode environment.
- Failure artifacts include `.xcresult` and relevant screenshots/logs with
  secrets scrubbed.
- The test matrix names untested native flows and marks them as manual or
  deferred rather than implying full iOS coverage.
- Any workflow change is tested on the actual supported runner before the
  disabled state is changed.

## Relevant sources

- `.github/workflows/verify.yml` (`ios` and `ios-note-document` jobs)
- `ios/Package.swift`, `ios/project.yml`, `ios/KnowTests/`, `ios/KnowUITests/`
- `scripts/check-ios-note-document.sh`
- `docs/ios-auth-state-matrix.md`
- `docs/ios-sessions-parity.md`
- `docs/testing.md`
