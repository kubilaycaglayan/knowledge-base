# Board label-picker fixture follow-up

- Date (UTC): 2026-10-08.
- Commit: `ca714e9` (`test: update board labels acceptance selectors`).
- Exact command: `cd frontend && node --test --test-name-pattern='does not expose archived paths|keeps every card editor control|searches and picks card labels|keeps the label picker to one row|turns off browser completions' scripts/board.acceptance.test.mjs`
- Exit status: 1.
- Suite outcomes: 4 passed, 1 failed, 0 skipped (5 selected cases).
- Corrected cases: card-label path menu, label search/selection, one-row chip count, and autocomplete checks all pass using the current shared LabelPicker.
- Remaining failure: `keeps every card editor control in its own slot on desktop and phone`; desktop footer content exceeds its available width by 373px at 1280px.
- Artifacts (local, git-ignored): the focused command transcript is in the [board fixture artifact directory](../local-artifacts/hard02-board-fixture-desktop/logs/). No product CSS or behavior changed.
