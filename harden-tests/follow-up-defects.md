# HARD-02 product follow-up register

These findings require product or test-synchronization work outside the
test-only HARD-02 milestone. The references below are repository-local tracking
IDs; they are not claims that an external issue has been filed.

| Reference | Finding | Evidence | State |
| --- | --- | --- | --- |
| `KB-HARD02-01` | Fixed timer/dashboard shell overlaps archive navigation and footer targets at phone width; desktop footer hit testing also finds the dashboard shell over the target. | [Latest desktop Chromium capture](runs/2026-10-08-6d29b9b-desktop-chromium-board-resilience.md), [latest mobile Chromium capture](runs/2026-10-08-6d29b9b-mobile-chromium-board-resilience.md) | Reproduced; product root cause and fix not yet investigated. |
| `KB-HARD02-02` | More boards control is unavailable during the board/view-switch journey at phone width. | [Latest mobile Chromium capture](runs/2026-10-08-6d29b9b-mobile-chromium-board-resilience.md) | Reproduced; responsive state root cause and fix not yet investigated. |
| `KB-HARD02-03` | Gantt card locator detached while scrolling in three phone-size runs; the intervening capture-enabled run did not reproduce it. | [Initial mobile Chromium report](runs/2026-10-08-63cf4f3-mobile-chromium-board-resilience.md), [intervening follow-up](runs/2026-10-08-d2cda77-mobile-chromium-board-resilience.md), and [latest capture](runs/2026-10-08-6d29b9b-mobile-chromium-board-resilience.md) | Intermittent; determine whether this is test synchronization or application rerender behavior before changing the assertion. |
| `KB-HARD02-04` | Card editor content overflows its dialog/footer at 1280px and the phone-landscape body scroll region shrinks to 31px. | [Board fixture suite report](runs/2026-10-08-board-fixture-suite.md), [focused editor follow-up](runs/2026-10-08-ca714e9-board-label-picker-fixture-followup.md) | Reproduced in viewport assertions; product layout investigation remains. |
| `KB-HARD02-05` | Long note content causes line-history timestamps to overlap list and code-block lines in the phone dark-theme editor. | [Long-content desktop and phone Chromium report](runs/2026-10-08-long-content-resilience.md) | Reproduced in both browser suite runs; product layout investigation remains. |

The historical WebKit caret and timer-request findings are now reproduced by
the emulated iPhone WebKit report, but lack request/trace evidence. Session
tracker fixture controls are updated and pass; the board fixture suite still
has control/layout failures described in its report. Two incomplete-transcript
board failures remain unclassified because their artifacts were not retained.
