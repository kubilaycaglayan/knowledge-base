# iOS authentication parity state matrix

Reference captured on 2026-09-13 before implementation. The source of truth is
`frontend/src/views/AuthView.vue`, `AuthView.test.ts`, `stores/auth.ts` and its
tests, `lib/api.ts` and its tests, and `App.vue`/`App.test.ts`. This matrix records
observed source behavior separately from native requirements in Milestone 2.

## States and native mapping

| State / trigger | Current web behavior | Required Swift model/action and UI |
| --- | --- | --- |
| Initial sign-in | “YOUR PRIVATE WORKSPACE”; “Welcome back”; “Keep the things you learn, do, and remember in one place.”; Email, Password, “Sign in” | Signed out, sign-in mode, empty in-memory draft; identical copy |
| Registration | “Create account” heading and submit label; only Email and Password | Registration mode uses `/auth/register`; no name, password confirmation, or extra consent fields |
| Change mode / back | “New here? Create an account” / “Already have an account? Sign in”; toggles in place, preserves both inputs and existing API error; no separate route/history entry | Explicit mode action preserves draft; no destructive back transition |
| Missing email | Browser `required` validation prevents POST and focuses email | Inline email error; focus email; no request |
| Invalid email | Browser `type=email` validation prevents POST | Model validation matching HTML email syntax; inline error; focus email |
| Missing / short password | Browser `required`, `minlength=9`; browser-localized validation | Model validation; inline error; focus password after email is valid; preserve whitespace in password |
| Password over 200 characters | Web has no maxlength; server rejects with 400 | Preserve server maximum contract, document any native inline validation; count UTF-16 units like HTML/Java |
| Submit / loading | Clears form error, POSTs email/password; currently no spinner, disabling, or duplicate protection | Milestone explicitly requires a busy state, retained button label and spinner, one request at a time, preserved draft |
| Password success | Persists `know_token`, emits authenticated; App refreshes store and routes to safe internal redirect or `/sessions` | Validate response, persist Keychain before accepting token, route to native workspace through AppModel |
| Invalid credentials (401) | “Could not authenticate. Use a valid email and a password of at least 9 characters.” | Same form error, editable draft, retry through submit; failed public login must not clear an existing session |
| Duplicate email (409) | Same password-auth error; does not display backend “Email already registered” | Same form error and retry; registration draft remains intact |
| Network / server failure | Same password-auth error (Google uses Google-specific error); API timeout is 15 seconds | Recoverable error and retry, no false sign-out; native network explanation may supplement reference copy |
| Google not configured | Google separator/button omitted when trimmed `VITE_GOOGLE_CLIENT_ID` is empty | Check existing native OAuth configuration without changing identifiers; email/password remains available |
| Google idle | “or continue with”; Google-rendered wide button capped at 320px, theme follows app | Native Google button, accessible name, theme adaptation, at least 44pt target |
| Google loading | Provider manages dialog; credential callback POSTs `/auth/google`; no app busy state | Busy provider/exchange state, spinner retaining label, duplicate prevention |
| Google cancellation | No credential callback; form stays open and draft survives | Cancellation returns idle without error or accepting a token; preserve draft |
| Google failure | “Google sign-in could not be completed. Try again.” | Same recoverable error for exchange failure; configuration/presentation failures explain recovery |
| Google success | Same token persistence and authenticated routing as password | Shared session acceptance; only backend JWT goes into Keychain |
| Restored session | Store reads `know_token`; authenticated shell appears immediately; API validates on requests | Existing Keychain service `com.know.ios`, account `session`; keep restored token on outages |
| Sign-out | Clears reactive and persisted token; renders authentication | Clear Keychain, Google SDK session and account data; invalidate pending auth completion |
| Expired token | 401 for current bearer removes token/reloads; delayed 401 for replaced bearer is ignored | Expire only the session that made the request; route to sign-in; do not let old work erase new session |
| Authenticated outage | Network/5xx errors preserve token | Preserve current Keychain and model session, expose retry |
| Keyboard / autofill | Username autocomplete, email input, no spellcheck; current-password vs new-password; Enter submits | Native username/password content types; email keyboard, no correction/capitalization; email Return → password, password Return → submit; first invalid field focus |
| Appearance / large text | Shell appearance cycles system → dark → light → system; shared tokens; mobile layout at ≤700px | Light/dark/system, scrolling at large Dynamic Type, safe areas, readable labels and controls, reduced motion |

Browser validation strings are browser/localization dependent; they are not
application copy to duplicate verbatim. Inline native messages must describe the
same constraints. Do not trim passwords: spaces are significant credentials.

## Visual source tokens

Values come from `theme.css`, `style.css`, `extra.css`, and
`dashboard-shell.css`. Font sizes below are base sizes; native equivalents must
scale with Dynamic Type.

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#f7f8fa` | `#151a22` |
| Surface | `#ffffff` | `#1c2430` |
| Text | `#252b36` | `#e1e6ee` |
| Muted | `#606b7b` | `#a7b2c2` |
| Border | `#dfe3e9` | `#343e4c` |
| Control border | `#aab3c0` | `#697789` |
| Accent / foreground | `#334155` / `#ffffff` | `#c4d1e2` / `#18212e` |
| Focus | `#2563b5` | `#86b7f3` |
| Error text / surface / border | `#a12727` / `#fff4f4` / `#d7a4a4` | `#ffaaaa` / `#3a242b` / `#925e68` |

Card and controls use 4px radii and 1px borders. Card max width is 480px;
card padding is 24px desktop, 16px mobile; shell side padding is 16px mobile.
Auth card has 40px vertical margins. Form margin is 24px and row gap 14px;
label-to-input gap is 6px. Heading is 26px, weight 650, line height 1.3;
eyebrow 10px, weight 650, 1px tracking; lede 13px with 1.5 line height;
labels/buttons 12px, weight 600. Mobile inputs use 16px type; mobile buttons
have minimum 44px height. Native inputs must also provide 44pt hit targets.
The web Google separator has no horizontal rules. The mode switch is bordered.

## API contract and invariants

`AuthController.Credentials` accepts `{email,password}` for both public POSTs:
nonblank email with server email validation and a nonblank 9–200-character
password. Server normalizes email by trimming and lowercasing. Registration
derives display name from the email prefix. No additional registration field is
exposed on web. `/auth/google` accepts `{idToken}` (nonblank, max 10000).
Responses contain `token`, UUID `userId`, `email`, and `displayName`.
`GET /auth/me` uses the bearer token and returns account information.
JWT lifetime remains 30 days; ownership and verification remain server-owned.
No bundle, Keychain, OAuth, database, or API identifiers should change.

## Verification log

- Initial web reference run on Node 26 failed because native `localStorage`
  shadows the jsdom storage. Rerun with
  `NODE_OPTIONS=--no-experimental-webstorage npm test -- src/views/AuthView.test.ts src/stores/auth.test.ts src/lib/api.test.ts src/App.test.ts`.
- Web reference rerun: all 34 tests passed across the four files above.
- Installed missing Playwright Chromium. The existing general UI runner timed
  out waiting for `main h1` on Sessions before reaching auth; this is not a
  passing general UI run. Added `frontend/scripts/check-auth-ui.mjs` to exercise
  the unauthenticated reference directly without depending on another page.
- Auth browser regression: 20 layout/axe audits passed (sign-in/registration,
  light/dark, widths 320/390/430/1440/2560), along with required email focus,
  mode-switch draft retention, Return submission, rejected-registration copy,
  and draft preservation. Enlarged-text layouts did not overflow. Google
  traffic is blocked; this run does not verify live Google interaction.
- Inspected the 390px light sign-in and dark registration screenshots. Evidence
  directory: `<temporary evidence directory>`.
  Evidence is temporary and can be regenerated with the script.
- Swift package baseline: 34 tests passed on Xcode 26.6/macOS. This does not
  prove simulator, physical device, or new milestone coverage.
- Generated `ios/Know.xcodeproj` with XcodeGen and started the aggregate iPhone
  17 Pro simulator test. The build reached test execution, but the runner hung
  while materializing test workers and was interrupted after repeated LLDB
  snapshot errors; no simulator/UI pass is claimed. A physical iPhone was not
  connected to this host, so device verification remains open.
- Isolated simulator UI checks pass for the three unauthenticated cases
  `testAuthenticationControlsAreReachable`,
  `testEmptySubmissionShowsInlineValidation`, and
  `testAuthenticationModeCanSwitchToRegistration` on iPhone 17 Pro. This
  covers basic controls only; it does not satisfy the full matrix gate.
- Added and passed `testAuthenticationModeSwitchPreservesDraftFields` on the
  same simulator, verifying email and secure-password draft retention (the
  latter through XCTest's masked value representation).
- `testAuthenticationControlsRemainReachableAtAccessibilityTextSize` passes on
  iPhone 17 Pro using `UICTContentSizeCategoryAccessibilityXXXL`; the form
  remains scrollable and all auth controls remain discoverable.
- The added model regression `testMalformedAuthResponsePreservesExistingSession`
  passes, proving malformed login data leaves an existing token intact.
- `testGoogleCancellationReturnsToIdleWithoutError` also passes, covering the
  provider cancellation path without a false form error or session mutation.
- `AppModel.authPhase` now exposes explicit `idle`, `authenticating`, and
  `failed` states while retaining `isAuthenticating` for view compatibility;
  rejected credential tests assert the failed-to-idle transition.
- `clearAuthError()` is the model-owned recovery action used by mode switching;
  its regression confirms that clearing an error also returns `authPhase` to
  `.idle`.
- Form-level failures now expose an explicit `auth.retry` “Try again” button
  with a 44-point hit target; it invokes the same validated submit action and
  retains the entered draft.
- Auth layout tokens were aligned in `LoginView`: 4-point card/control radii,
  480-point maximum card width, and 16-point compact-width side/card padding.
  Swift package tests and the simulator control test still pass after this
  change.
- Built and launched the native app on the iPhone 17 Pro simulator and captured
  light and dark auth screenshots at `/tmp/knowledge-base-evidence/ios-auth-
  {light,dark}.png`. Visual inspection confirms the complete hierarchy, Google
  control, keyboard-safe scrolling surface, and theme surfaces render without
  clipping at the simulator's compact width. These are local evidence files,
  not committed artifacts.
- The required Dockerized backend test command could not run because this host
  has no `docker` executable. Frontend build and web auth tests remain green;
  backend/API integration and smoke checks therefore remain unverified here.

## Remaining acceptance evidence

Record model tests for all rows, rendered web/iOS comparisons in both themes,
system appearance, small/large iPhones, Dynamic Type, keyboard and VoiceOver,
simulator aggregate UI results, backend and smoke results, and physical iPhone
flows. Source inspection alone does not prove these gates.
