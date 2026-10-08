# Tracker acceptance fixture repair

This is test-fixture evidence, not a browser-profile run. The suite uses a local
Vite server and isolated API fixtures.

- Date (UTC): 2026-10-08.
- Final source commit: `ace8296` (`test: align tracker acceptance with current controls`).
- Command: `cd frontend && npm run test:tracker`.
- Final outcome: 10 passed, 0 failed, 0 skipped.
- Final report screenshots: [`screenshots`](../local-artifacts/hard02-tracker-acceptance-repair/screenshots/) cover desktop, phone-width, and ultra-wide layouts in light/dark modes, plus the extension popup.
- Failure investigation: six exploratory suite runs before the final pass observed 40 failing test-case occurrences across six suite occurrences. They exposed obsolete picker selectors and assumptions about chip wrapping, field background equality, and extension menu state. Those checks now follow the current component semantics; the layout suite continues to assert control geometry, target sizes, no horizontal overflow, and accessibility. No API/product code changed.
- Raw output: [`logs`](../local-artifacts/hard02-tracker-acceptance-repair/logs/). The logs contain synthetic fixture data only. Retain through 2026-10-15, then remove `harden-tests/local-artifacts/`.
