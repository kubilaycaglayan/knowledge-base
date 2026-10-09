# Web authentication milestone acceptance checklist

**Status:** Draft acceptance checklist  
**Product:** Knowledge Base  
**Platforms:** Desktop web browsers and Knowledge Base in mobile Chrome  
**Out of scope:** Automated test authoring/execution and the timer-only Chrome extension

This checklist turns the web-facing product counterpart of the sign-in milestone
into independently reviewable user flows. Each checkbox has one acceptance
responsibility. The current web implementation is the behavioral source of
truth; this document describes the acceptance contract to check against the
running application. It is not evidence that any item has passed.

## Product references

- [Auth view](../../frontend/src/views/AuthView.vue): sign-in, registration,
  Google sign-in, inline validation, and request feedback.
- [Application shell](../../frontend/src/App.vue): signed-in/signed-out shell,
  redirect handling, logout, and auth-related navigation.
- [Auth store](../../frontend/src/stores/auth.ts): persisted `know_token` state.
- [API client](../../frontend/src/lib/api.ts): bearer header, request timeout, and
  current-token 401 handling.
- [API contract](../api.md): `/api/v1/auth/*` endpoints and credential behavior.

## Acceptance setup and boundaries

- [ ] Use a local or otherwise approved non-production Knowledge Base
  environment and disposable accounts.
- [ ] Record the browser name/version, operating system, viewport dimensions,
  theme, account state, and application build for each acceptance pass.
- [ ] Check desktop web at a representative laptop width and a wide desktop
  width.
- [ ] Check mobile Chrome on a real Android device or mobile Chrome profile at
  a phone-sized viewport; record which one was used.
- [ ] Keep mobile Chrome results distinct from desktop browser results.
- [ ] Do not treat desktop browser emulation or a mobile user-agent string as
  mobile Chrome evidence.
- [ ] Check sign-in and registration in both light and dark appearances.
- [ ] Check the auth page at narrow widths without horizontal page overflow.
- [ ] Check the auth page at enlarged browser text/zoom without clipping
  controls or hiding recovery actions.
- [ ] Use keyboard-only interaction for each flow where keyboard input is
  available.
- [ ] Use touch-only interaction for each mobile Chrome flow.

## Flow: Open the signed-out experience

- [ ] Opening `/` without a saved token displays the Knowledge Base sign-in
  form.
- [ ] Opening an application URL while signed out displays the sign-in form
  rather than protected page content.
- [ ] The signed-out shell hides authenticated navigation, global search,
  settings, sign-out, and the floating timer.
- [ ] The signed-out shell exposes the theme control.
- [ ] The document title identifies the Knowledge Base sign-in page.
- [ ] The page has one visible level-one heading named “Sign in”.
- [ ] The primary sign-in form is reachable without horizontal scrolling at
  phone width.
- [ ] Mobile Chrome scrolling can reach every form control and account-mode
  link while the virtual keyboard is open.
- [ ] Returning focus from the mobile keyboard does not clear entered values.

## Flow: Enter sign-in credentials

- [ ] The sign-in form exposes an Email input with email input semantics.
- [ ] The Email input has the accessible name “Email”.
- [ ] The Email input uses the `username` autocomplete token.
- [ ] Email spellcheck is disabled.
- [ ] The sign-in form exposes a Password input with password semantics by
  default.
- [ ] The Password input has the accessible name “Password”.
- [ ] The Password input uses the `current-password` autocomplete token.
- [ ] The password visibility control reveals the entered password when
  activated.
- [ ] The password visibility control masks the password again when activated
  a second time.
- [ ] The password visibility control has an accessible name that reflects its
  next action.
- [ ] Password visibility changes do not clear or alter the entered password.
- [ ] The form accepts pasted email and password values.
- [ ] The Email and Password fields remain editable before submission begins.
- [ ] The sign-in submit action is labeled “Sign in”.
- [ ] The sign-in submit action submits when Enter is pressed from a credential
  input.
- [ ] The mobile Chrome keyboard provides an appropriate email keyboard for
  Email.
- [ ] The mobile Chrome keyboard provides a submit/Go action for Password.
- [ ] Form controls remain visible and operable while the mobile keyboard is
  displayed.

## Flow: Validate sign-in credentials in the browser

- [ ] Submitting an empty sign-in form keeps the user on the sign-in page.
- [ ] Submitting an empty sign-in form focuses or identifies the required
  Email field using browser validation.
- [ ] Submitting a malformed email prevents the sign-in request.
- [ ] A password shorter than nine characters is rejected by browser
  constraint validation before request submission.
- [ ] Password spaces are preserved as entered; the client does not trim the
  password.
- [ ] Email values with leading or trailing spaces are handled consistently
  with the server’s email normalization contract.
- [ ] Browser-native validation remains perceivable and usable in mobile
  Chrome with the on-screen keyboard.
- [ ] Correcting a validation error permits a subsequent submission without
  reloading the page.

## Flow: Submit sign-in credentials

- [ ] Submitting validly formatted credentials sends a password login request
  to `/api/v1/auth/login`.
- [ ] The login request body contains the entered `email` and `password`.
- [ ] Starting a sign-in request clears the prior form-level error.
- [ ] While sign-in is pending, the submit action retains its “Sign in” label.
- [ ] While sign-in is pending, a visible progress indicator is shown.
- [ ] While sign-in is pending, duplicate submission is prevented.
- [ ] While sign-in is pending, the entered credentials remain intact.
- [ ] A successful login persists the returned bearer token under the existing
  `know_token` key.
- [ ] A successful login switches the shell to authenticated application
  content.
- [ ] A successful login to `/` opens the default Sessions destination.
- [ ] A successful login after a valid internal `redirect` query returns to
  that requested destination.
- [ ] An external or protocol-relative redirect query does not navigate away
  from Knowledge Base.

## Flow: Recover from rejected sign-in credentials

- [ ] A rejected sign-in displays the form-level “Could not authenticate. Use
  a valid email and a password of at least 9 characters.” message.
- [ ] The rejection message is exposed as an alert to assistive technology.
- [ ] A rejected sign-in leaves the user on the sign-in page.
- [ ] A rejected sign-in preserves the entered email.
- [ ] A rejected sign-in preserves the entered password.
- [ ] A rejected sign-in does not persist a new token.
- [ ] A rejected sign-in exposes a “Try again” action.
- [ ] Activating “Try again” resubmits the current sign-in values.
- [ ] Editing credentials after rejection allows another sign-in attempt.
- [ ] The alert and retry action remain reachable when the mobile keyboard is
  open and after it is dismissed.

## Flow: Switch from sign-in to registration

- [ ] The signed-out sign-in form exposes “New here? Create an account”.
- [ ] Activating the mode switch changes the heading to “Create account”.
- [ ] Activating the mode switch changes the primary action to “Create
  account”.
- [ ] Activating the mode switch adds the Confirm password field.
- [ ] Activating the mode switch changes Password autocomplete to
  `new-password`.
- [ ] Activating the mode switch retains the entered email.
- [ ] Activating the mode switch retains the entered password.
- [ ] The registration mode exposes “Already have an account? Sign in”.
- [ ] The mode switch is operable by keyboard.
- [ ] The mode switch is operable by touch in mobile Chrome.

## Flow: Validate registration fields

- [ ] Registration requires an email value.
- [ ] Registration rejects malformed email according to browser email input
  validation.
- [ ] Registration requires a password value.
- [ ] Registration rejects a password shorter than nine characters.
- [ ] Registration requires a Confirm password value.
- [ ] A mismatch between Password and Confirm password displays “Passwords do
  not match.” inline with the confirmation field.
- [ ] Password mismatch prevents the registration request.
- [ ] Correcting the confirmation value clears the mismatch feedback on the
  next submission attempt.
- [ ] The registration form does not request a display name; the server
  derives it from the email prefix.
- [ ] Registration accepts pasted email, password, and confirmation values.
- [ ] Both password visibility controls reveal only their corresponding
  field's value.
- [ ] The registration fields remain reachable by touch and scrolling while
  the mobile Chrome keyboard is open.

## Flow: Submit a registration

- [ ] Submitting validly formatted matching values sends a request to
  `/api/v1/auth/register`.
- [ ] The registration request body contains `email` and `password` only.
- [ ] Starting registration clears the prior form-level error.
- [ ] While registration is pending, the submit action retains its “Create
  account” label.
- [ ] While registration is pending, a visible progress indicator is shown.
- [ ] While registration is pending, duplicate registration submission is
  prevented.
- [ ] While registration is pending, all entered registration values remain
  intact.
- [ ] Successful registration persists the returned bearer token using the
  existing `know_token` key.
- [ ] Successful registration opens authenticated application content.
- [ ] Successful registration does not require the user to manually sign in
  again.

## Flow: Recover from registration rejection

- [ ] A rejected registration displays the same password-authentication error
  message used by the current web application.
- [ ] A rejected registration does not expose backend-only duplicate-email
  details in the public form error.
- [ ] A rejected registration preserves the entered email.
- [ ] A rejected registration preserves the entered password.
- [ ] A rejected registration preserves the entered confirmation.
- [ ] A rejected registration does not persist a new token.
- [ ] A rejected registration exposes a “Try again” action.
- [ ] Activating “Try again” retries registration with the current values.
- [ ] Returning to sign-in after a registration rejection retains the email
  and password fields.

## Flow: Restore a browser session

- [ ] Reloading the application with a saved `know_token` restores the
  authenticated shell.
- [ ] A restored session hides the sign-in form.
- [ ] A restored session displays authenticated navigation and account
  features.
- [ ] A restored session does not expose the token in visible page content.
- [ ] A restored session does not require credentials to be re-entered while
  the token remains accepted by the API.
- [ ] A browser with no saved token displays the signed-out sign-in flow.
- [ ] A browser where local storage is unavailable still exposes a usable
  sign-in interface and reports/recoveries remain operable.

## Flow: Handle an expired or rejected saved session

- [ ] A protected API response with HTTP 401 for the currently saved token
  clears `know_token`.
- [ ] After the current token is rejected, the application returns to the
  signed-out sign-in experience.
- [ ] A 401 response associated with a token that has since been replaced does
  not clear the replacement token.
- [ ] The user can sign in again after the expired-session transition.
- [ ] No protected page content remains available after the current token is
  rejected and cleared.

## Flow: Preserve a session during a temporary API outage

- [ ] A network failure during a protected request does not clear the saved
  token.
- [ ] A server error during a protected request does not clear the saved
  token.
- [ ] A timed-out request uses the API client's 15-second timeout behavior.
- [ ] A timed-out request does not by itself sign the user out.
- [ ] The affected page exposes an actionable recovery path for its failed
  operation.
- [ ] Restoring network connectivity permits the user to retry without
  re-entering credentials, unless the API separately rejects the token.

## Flow: Sign out

- [ ] The authenticated shell exposes a “Sign out” action.
- [ ] Activating “Sign out” removes the saved `know_token` value.
- [ ] Activating “Sign out” switches the shell to the signed-out experience.
- [ ] After sign-out, protected navigation and global search are hidden.
- [ ] After sign-out, browser Back does not restore authenticated content
  without a valid saved token.
- [ ] A subsequent sign-in can establish a new session in the same browser.

## Flow: Use Google sign-in when configured

- [ ] When a non-empty Google client ID is configured, the “or continue with”
  divider is displayed.
- [ ] When a non-empty Google client ID is configured, the Google sign-in
  control is rendered with an accessible name.
- [ ] The Google provider button's localized label is understandable in the
  active browser/provider language.
- [ ] The Google sign-in control fits within the auth card at desktop width.
- [ ] The Google sign-in control fits within the auth card at phone width.
- [ ] The Google sign-in control uses the light-appearance provider treatment
  in light theme.
- [ ] The Google sign-in control uses the dark-appearance provider treatment
  in dark theme.
- [ ] A successful provider credential callback sends `idToken` to
  `/api/v1/auth/google`.
- [ ] A successful Google exchange persists the returned token using the
  existing `know_token` key.
- [ ] A successful Google exchange opens the authenticated application.
- [ ] Cancelling the Google provider flow returns to the auth form without
  accepting a token.
- [ ] Cancelling the Google provider flow preserves the current email and
  password draft.
- [ ] A failed Google exchange displays “Google sign-in could not be
  completed. Try again.”
- [ ] A failed Google exchange preserves the current form draft.
- [ ] A failed Google exchange exposes an actionable retry path.
- [ ] Mobile Chrome can complete the provider handoff and return to the same
  Knowledge Base tab/session.

## Flow: Use password sign-in when Google is unavailable

- [ ] When the Google client ID is empty or whitespace, the Google divider is
  omitted.
- [ ] When the Google client ID is empty or whitespace, the Google sign-in
  control is omitted.
- [ ] Password sign-in remains available when Google sign-in is not
  configured.
- [ ] Registration remains available when Google sign-in is not configured.

## Flow: Navigate and operate the auth interface accessibly

- [ ] Keyboard focus is visible on every interactive control.
- [ ] Keyboard focus is not obscured by fixed or sticky interface elements.
- [ ] Every icon-only password control has a descriptive accessible name.
- [ ] Validation feedback is associated visually and semantically with the
  corresponding field.
- [ ] Form-level failures are announced without moving focus unpredictably.
- [ ] Touch targets for auth actions are usable at phone size.
- [ ] Sign-in and registration primary actions provide at least a 44 × 44 CSS
  pixel touch target in mobile Chrome.
- [ ] Input and password visibility controls provide at least a 44 × 44 CSS
  pixel touch target in mobile Chrome.
- [ ] The page does not disable browser zoom.
- [ ] Mobile Chrome does not zoom unexpectedly when focusing auth inputs.
- [ ] Browser Back and Forward do not leave the user stranded in a blank or
  protected view after auth state changes.
- [ ] Theme changes do not remove focus visibility or error-state contrast.
- [ ] Reduced-motion preferences do not make the form or progress state
  difficult to use.

## Flow: Verify visual and responsive auth presentation

- [ ] At desktop width, the auth card remains centered and does not exceed its
  intended maximum width.
- [ ] At phone width, the auth card uses the mobile spacing and available
  viewport width without clipping.
- [ ] At phone width, auth input text remains legible while the virtual
  keyboard is open.
- [ ] The auth card, inputs, buttons, and errors remain distinguishable in
  light theme.
- [ ] The auth card, inputs, buttons, and errors remain distinguishable in
  dark theme.
- [ ] Long email values wrap or remain reachable without forcing horizontal
  page scrolling.
- [ ] Error messages and retry controls remain visible at enlarged text sizes.
- [ ] Loading indicators do not shift or obscure the primary action label.
- [ ] Theme changes preserve the current sign-in or registration mode and
  entered draft.

## Flow: Complete a browser-profile acceptance record

- [ ] Record the outcome of each applicable flow separately for desktop web.
- [ ] Record the outcome of each applicable flow separately for mobile Chrome.
- [ ] Record skipped flows with the specific reason they were not applicable
  or could not be exercised.
- [ ] Record each observed discrepancy with flow name, browser profile,
  preconditions, steps, expected result, actual result, and relevant
  sanitized evidence reference.
- [ ] Do not claim acceptance based only on source inspection; confirm the
  user-visible behavior in the running application.
- [ ] Do not use automated test results as a substitute for the requested
  product acceptance record.
