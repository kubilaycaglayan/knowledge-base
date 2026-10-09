# Board browser fixture suite

This suite runs against a local Vite server and isolated API fixtures; it is
lower-layer evidence, not a real-stack browser profile run.

- Date (UTC): 2026-10-08.
- Commit: `55255ec` (`test: cover keyboard recovery from empty notes`); the later board label-picker fixture corrections are recorded in the [focused follow-up](2026-10-08-ca714e9-board-label-picker-fixture-followup.md).
- Exact command: `cd frontend && npm run test:board`.
- Exit status: 1.
- Browser: Playwright Chromium; exact build and host details are not recorded.
- Suite outcomes: 104 passed, 13 failed, 0 skipped (117 total across 27 suites).
- Long-content evidence: 8 board-tab overflow cases passed, including a very long board name; Gantt/path layout cases covered 390px and desktop widths. The suite also found a card editor overflow at 1280px and a nearly unusable 31px phone-landscape scroll area.
- Failure groups: archive footer link hit-testing (5 cases); card-label picker test assumptions (4); card editor overflow (2); compact phone-landscape scroll area (1); route-state wait synchronization (1). Four card-label cases pass after the fixture correction; remaining product/layout failures are tracked separately.
- Artifacts (local, git-ignored): [`run directory`](../local-artifacts/hard02-board-fixture-desktop/) contains the test transcript and 24 screenshots. Synthetic fixtures only; retain through 2026-10-15, then remove `harden-tests/local-artifacts/`.
