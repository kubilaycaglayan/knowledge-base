# HARD-06 acceptance checklist: iOS validation

Use this checklist with [HARD-06](06-ios-validation.md). Linux portability
checks are not evidence of SwiftUI or simulator behavior.

## Test inventory and supported host

- [ ] Inventory `KnowTests` and `KnowUITests` by screen, API flow, auth state,
  shared note conversion, and create/edit/archive/restore behavior.
- [ ] Mark each flow automated, manual, deferred, or unsupported and link its
  test or explicit gap; do not imply full native coverage from a subset.
- [ ] Select a supported macOS/Xcode host and document Xcode, XcodeGen,
  simulator runtime/device, scheme, and required signing assumptions.
- [ ] Provide a reproducible command or active CI job that generates the
  project, builds the app, and runs the intended unit and UI test sets.
- [ ] Verify the chosen path on the actual supported host before changing any
  currently disabled workflow job.
- [ ] Keep `check-ios-note-document.sh` identified as Foundation-only Linux
  validation; do not report it as a SwiftUI build or simulator pass.

## Behavior matrix

- [ ] Cover launch, sign-in, token/session restore, logout, expired/invalid
  session recovery, and unauthorized API responses.
- [ ] Cover list/detail navigation for notes, sessions, logs, paths, labels,
  calendar, and reports as present in the app.
- [ ] Cover create/edit/archive/restore flows and verify API persistence after
  navigation or relaunch where applicable.
- [ ] Cover note save and line-history preservation through the native
  `NoteDocument` conversion path.
- [ ] Cover network failure, retry, offline recovery, empty state, and server
  validation/conflict responses with user-visible recovery.
- [ ] Exercise Dynamic Type, VoiceOver labels/focus order, keyboard input where
  available, safe-area layout, and supported light/dark appearances.
- [ ] Freeze locale, timezone/calendar, animation, and network fixture timing
  for deterministic assertions.

## Artifacts and privacy

- [ ] Retain `.xcresult` for failures and successful release-gate runs according
  to the documented artifact policy.
- [ ] Capture relevant screenshots and logs on failure with credentials,
  tokens, and personal data removed.
- [ ] Use isolated disposable simulator accounts/data and document setup and
  cleanup without committing secrets.
- [ ] Distinguish manual evidence from automated CI in the test map and report
  exact host/runtime versions for each result.
- [ ] Link the complete test inventory and a supported-host run before marking
  the milestone complete.
