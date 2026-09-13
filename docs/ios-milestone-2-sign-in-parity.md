# iOS Milestone 2: sign-in and unauthenticated-flow parity

This is the handoff brief for the next implementation session. The goal is
not merely to make sign-in work: the native unauthenticated experience must
match the current web application in behavior, copy, hierarchy, spacing,
states, and recovery paths while retaining native iOS interaction patterns.

## Objective

Port the web sign-in/unauthenticated flow one-for-one to SwiftUI:

- sign in with email and password;
- registration, including every field and validation rule exposed by the web;
- Google sign-in and its loading, cancellation, and failure states;
- authenticated-session restoration and expired-session behavior;
- validation, API errors, offline/network errors, retry, and loading states;
- password-manager/autofill behavior, keyboard submission, focus movement, and
  accessible labels;
- visual parity in light, dark, system appearance, small/large iPhones, and
  Dynamic Type.

Do not change bundle identifiers, Keychain keys, OAuth client identifiers, or
API compatibility contracts. Keep authentication decisions in the existing
app model/API layer; the SwiftUI view should remain a thin client.

## Working method

Use the web as the behavioral and visual specification, as was done for the
Sessions milestone.

1. Read `frontend/src/views/AuthView.vue`, its tests, `frontend/src/stores/auth.ts`
   and tests, the shared web theme/components, and the relevant API/OpenAPI
   documentation. Search for every auth-related route, error string, and
   `auth` store action before editing Swift. The development web app is also
   available at `http://localhost:3000`; use it as a live design reference
   (with a disposable/local account) for spacing, typography, responsive
   behavior, and interaction details.
2. Run the web auth tests and inspect the rendered page in both themes. Record
   a state matrix before implementation: initial sign-in, registration, each
   field error, submit/loading, success, invalid credentials, duplicate email,
   network failure, Google cancellation/failure, restored session, sign-out,
   and expired token.
3. Map each web state to an explicit SwiftUI model state and action. Avoid
   inferring behavior from a screenshot. Preserve server validation and the
   existing `/api/v1/auth/*` contract.
4. Compare the web layout at phone-sized widths and large text. Identify the
   exact tokens (colors, typography, corner radii, borders, spacing, button
   heights, backgrounds) from the shared design system instead of inventing
   mobile-only values.
5. Implement in small vertical slices: shared auth state/API behavior first,
   then sign-in layout, registration mode, Google flow, and error/recovery
   polish. Keep the existing Keychain/session restoration path intact.
6. Re-check the web and iOS flows after each slice. If the web has changed
   since this brief was written, update the state matrix and follow the web,
   not this document, as the source of truth.

## iOS implementation checklist

- Keep `LoginView` focused on rendering and user intent; put request,
  cancellation, token acceptance, Keychain persistence, and signed-in routing
  in the existing observable app model.
- Use `@FocusState` with logical email → password progression. Submit on Return
  from password; use the registration form's correct Return behavior.
- Use `textContentType`, `keyboardType`, `autocorrectionDisabled`, and
  `isSecureTextEntry` equivalents so password managers and autofill work.
- Keep buttons enabled until a request starts, then show a spinner while
  retaining the original label. Prevent duplicate submissions without losing
  entered values.
- Show inline field errors and a clear form-level error with retry. Never turn
  a transport error into a false sign-out. Preserve drafts after rejected
  requests.
- Match web copy, capitalization, iconography, hit targets (at least 44 pt on
  iPhone), focus/selection behavior, safe-area handling, and reduced-motion
  expectations.
- Provide an obvious route between sign-in and registration and preserve the
  back/cancel semantics of the web flow. Do not create dead ends.
- Keep debug LAN API configuration in ignored `ios/Local.xcconfig`; never
  commit addresses, credentials, or tokens.

## Test plan and gates

Write tests alongside each behavior, not at the end.

Unit/model tests MUST cover successful password login, registration, Google
token exchange, Keychain restoration, sign-out, expired authentication,
duplicate-submit protection, cancellation, malformed responses, validation,
and network/server failures. Assert that errors do not clear a valid session or
silently mutate form drafts.

SwiftUI/UI regression tests MUST cover every state in the matrix, both sign-in
and registration, keyboard submission/focus, loading controls, error/retry,
theme variants, Dynamic Type, and accessibility labels. Use stable accessibility
identifiers and test observable behavior rather than pixel coordinates.

Run the web auth unit/regression tests to ensure the reference behavior remains
known. Run API/integration tests (including auth registration/login/me and
ownership/session continuity smoke coverage) against the same `/api/v1`
contract. On macOS, generate the Xcode project, run Swift package tests, build
and execute the aggregate iOS UI suite on a simulator, then install the Debug
build on the paired iPhone and manually exercise sign-in, registration,
Google-cancel, invalid credentials, retry, and restored-session flows.

Before handoff, run the relevant repository checks from `AGENTS.md`: backend
tests, frontend build/tests, accessibility/security/smoke checks, shell syntax,
and the iOS package/UI checks available on the host. Record any check that is
not runnable (for example, Linux cannot run Xcode UI tests).

## Commit and review cadence

Commit regularly in chronological and semantic order: each commit should be
the next coherent slice, build on the preceding slice, and have a subject that
describes the behavior it adds. Do not mix unrelated Logs, icon, generated
project, or local-environment changes into auth commits, and do not wait for
the entire milestone. Recommended sequence:

1. documentation/state matrix and API contract notes;
2. auth model/API and unit tests;
3. sign-in visual/state implementation and UI tests;
4. registration and Google/recovery flows and tests;
5. parity polish, accessibility, docs/roadmap, and final verification.

Each commit should build and leave tests green where practical. Review the diff
for accidental generated files, secrets, stale local IPs, and compatibility
identifier changes. Update `docs/roadmap.md`, API/testing documentation, and
this acceptance checklist whenever behavior changes.

## Acceptance checklist

- [x] Web auth state matrix captured from current source and tests (see
  [state matrix and verification log](ios-auth-state-matrix.md)).
- [ ] Sign-in and registration visuals match web in light/dark/system themes.
- [x] All web auth actions, validation, copy, and error/retry states exist on iOS.
- [x] Google sign-in matches loading, cancellation, success, and failure behavior.
- [x] Session restore, expiration, sign-out, and network outage behavior are safe.
- [ ] Keyboard, autofill, focus, Dynamic Type, VoiceOver, and hit targets verified.
- [ ] Unit, SwiftUI/UI regression, API/integration, and web reference tests pass.
- [ ] Physical iPhone flow verified over the intended local/production API.
- [x] Documentation and roadmap updated; changes committed in reviewed slices.

Implementation evidence (2026-09-13): the native LoginView contains the web
sign-in/registration fields, validation, autofill metadata, keyboard focus
progression, loading/retry controls, and configured Google route. AppModel
preserves existing sessions on rejected/malformed responses, handles Google
cancellation, and now uses the web-matching Google recovery message for
configuration and verification failures. Focused Swift tests for registration,
Google exchange/cancellation/failure, malformed responses, and retry pass.
Google authentication also retains its native button label while showing a
loading indicator during the request.

Visual, VoiceOver, full web/API integration, and physical-iPhone gates remain
open until those environments are exercised.

Additional verification (2026-09-13): the seven focused authentication UI
cases passed on the iPhone 17 Pro simulator, covering sign-in controls,
password visibility, empty validation, registration switching/draft retention,
password confirmation, and accessibility text size. Native Google button
styling now follows the active light/dark appearance.

## Prompt for a fresh session

> Implement `docs/ios-milestone-2-sign-in-parity.md`. Start by reading the
> current web auth view/store/tests and the existing Swift auth model/view.
> Open the running development app at `http://localhost:3000` to inspect the
> live web design and interactions, then produce the state matrix and implement
> parity in small tested slices.
> Preserve identifiers and server-owned auth behavior. Commit regularly and
> run unit, regression, integration, simulator UI, and physical-iPhone checks
> before handoff. Treat the current web behavior as the source of truth.
> Commit chronologically and semantically, with each commit containing one
> coherent implementation slice.
