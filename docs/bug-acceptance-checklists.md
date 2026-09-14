# Bug acceptance checklists

Release acceptance criteria for the September 2026 QA report.

## Extension timer controls

- [x] A running timer shows only the stop icon in the extension popup, with an accessible `Stop timer` name.
- [x] Stopping from the extension clears the active state and leaves the start icon visible.
- [x] An open web Sessions page receives the stop event and shows the completed session without a manual reload.
- [x] Automated coverage: `chrome-extension/popup.test.js`, `frontend/src/components/FloatingTimeTracker.test.ts`, and `frontend/src/views/SessionsView.test.ts`.

## Timer snapshot reactivity

- [x] A selected recent path remains selected after live synchronization.
- [x] A typed timer description remains when an incoming snapshot omits unchanged fields.
- [x] A real stop event still clears controls and refreshes history.
- [x] Automated coverage: `frontend/src/components/FloatingTimeTracker.test.ts`.

## Sessions

- [x] A completed session has a Start again action.
- [x] Start again sends the original path, labels, and description to the server.
- [x] Starting again reports a clear error when another timer is already running.
- [x] Automated coverage: `frontend/src/views/SessionsView.test.ts`.

## Notes and mobile layout

- [x] Note paragraphs and list items use compact, readable spacing.
- [x] The title and label input share one desktop row and wrap on narrow screens.
- [x] On mobile Chrome, the label picker remains reachable inside the open tracker panel.
- [x] When the mobile keyboard opens while typing a note, the caret remains above the keyboard.
- [x] Automated coverage: `frontend/src/views/NotesView.test.ts` plus responsive/accessibility checks.

## Page context

- [x] Browser titles begin with `Knowledge Base`, followed by the current page title.
- [x] Automated coverage: `frontend/src/App.test.ts`.
