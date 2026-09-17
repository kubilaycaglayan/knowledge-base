# Knowledge Base requirements acceptance checklist

## 1. Floating session tracker dismissal

- [ ] When the tracker is docked outside the Sessions page and expanded, a
      pointer click anywhere outside the tracker collapses its panel.
- [ ] Clicking inside the tracker does not collapse it.
- [ ] The inline tracker on the Sessions page remains expanded and is not
      dismissed by page clicks.
- [ ] Automated component coverage verifies the outside-click behavior.

## 2. Labels picker hit area

- [ ] Clicking any label chip, the chevron, or empty space inside the labels
      control opens the picker.
- [ ] Clicking the chevron while open still closes the picker.
- [ ] Clicking outside the picker closes it, and keyboard Escape closes it.
- [ ] Automated web and extension coverage verifies the hit area and dismissal
      behavior.

## 3. Command/control-enter saves forms

- [ ] Command+Enter on macOS and Control+Enter on Windows/Linux submit each
      form that exposes a Save action.
- [ ] The shortcut works from single-line fields and textareas without blocking
      ordinary typing or the existing submit button.
- [ ] Saving keeps the existing loading, validation, and error behavior.
- [ ] Automated coverage verifies at least the shared tracker/form paths and
      syntax checks cover the extension implementation.

## 4. Session description formatting

- [ ] Newlines, indentation, repeated spaces, and blank lines in a session
      description survive draft saves and timer updates.
- [ ] Web and extension session history render the preserved line breaks and
      spacing.
- [ ] iOS sends the description without trimming meaningful whitespace.
- [ ] Backend integration coverage verifies a formatted description round trip.

## Verification record

- [ ] Frontend component/store tests pass.
- [ ] Chrome extension tests and JavaScript syntax checks pass.
- [ ] Backend tests and integration tests pass.
- [ ] Full repository accessibility, security, smoke, build, and shell checks
      pass before final handoff.
