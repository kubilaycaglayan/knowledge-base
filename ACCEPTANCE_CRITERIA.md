# Knowledge Base requirements acceptance checklist

## 1. Floating session tracker dismissal

- [x] When the tracker is docked outside the Sessions page and expanded, a
      pointer click anywhere outside the tracker collapses its panel.
- [x] Clicking inside the tracker does not collapse it.
- [x] The inline tracker on the Sessions page remains expanded and is not
      dismissed by page clicks.
- [x] Automated component coverage verifies the outside-click behavior.

## 2. Labels picker hit area

- [x] Clicking any label chip, the chevron, or empty space inside the labels
      control opens the picker.
- [x] Clicking the chevron while open still closes the picker.
- [x] Clicking outside the picker closes it, and keyboard Escape closes it.
- [x] Automated web and extension coverage verifies the hit area and dismissal
      behavior.

## 3. Command/control-enter saves forms

- [x] Command+Enter on macOS and Control+Enter on Windows/Linux submit each
      form that exposes a Save action.
- [x] The shortcut works from single-line fields and textareas without blocking
      ordinary typing or the existing submit button.
- [x] Saving keeps the existing loading, validation, and error behavior.
- [x] Automated coverage verifies at least the shared tracker/form paths and
      syntax checks cover the extension implementation.

## 4. Session description formatting

- [x] Newlines, indentation, repeated spaces, and blank lines in a session
      description survive draft saves and timer updates.
- [x] Web and extension session history render the preserved line breaks and
      spacing.
- [x] iOS sends the description without trimming meaningful whitespace.
- [x] Backend integration coverage verifies a formatted description round trip.

## Verification record

- [x] Frontend component/store tests pass.
- [x] Chrome extension tests and JavaScript syntax checks pass.
- [x] Backend tests and integration tests pass.
- [ ] Full repository accessibility, security, smoke, build, and shell checks
      pass before final handoff.

## Multi-board workspace

- [x] Authenticated users can create, name, select, rename, archive, restore,
  and URL-select multiple boards; new boards seed four ordered statuses.
- [x] Boards, statuses, cards, and linked paths/labels enforce authenticated
  ownership and reject cross-user references.
- [x] Cards support blank-compatible titles, Tiptap-compatible body JSON,
  priority, optional inclusive start/due dates, multiple paths, and `BOARD`
  labels; invalid date ranges are rejected.
- [x] Statuses support creation, rename, ordering, archive, restore, and card
  reassignment; the final active status cannot be archived.
- [x] Cards support mobile Kanban creation/editing, archive/restore, and a
  date-filtered Gantt view with intentional horizontal overflow.
- [x] Board controls provide keyboard-operable native controls, accessible
  names, visible focus, mobile-sized targets, sparse/error states, and reduced
  motion behavior.
